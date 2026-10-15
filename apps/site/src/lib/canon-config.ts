/**
 * canon-config — lecture/écriture **server-only** de la doctrine de canonicité.
 *
 * La table `CanonConfig` (schéma public) stocke un unique document JSON
 * (singleton `default`) : définitions des cinq rangs, règles générales, sources
 * admises et refusées, sujets tranchés et familles de formulations. La page
 * `/wiki/canon` lit ici la doctrine effective et la passe à `analyzeCanon` ;
 * l'éditeur `/admin/ai?tab=canon` l'écrit via `/api/canon-config`.
 *
 * La lecture publique est enveloppée et ne throw jamais : table absente, base
 * indisponible ou document invalide ⇒ doctrine livrée avec le dépôt. La page de
 * canonicité doit répondre même quand la base ne répond pas — c'est justement
 * elle qui promet de ne rien inventer.
 */
import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { canonConfig, canonReferences, wikiRevisions } from "@/db/schema";
import {
  DEFAULT_CANON_CONFIG,
  resolveCanonConfig,
  type CanonConfig,
  type CanonReference,
} from "@/lib/canon-engine";

const SINGLETON_ID = "default";

/** `tableName` des révisions d'une citation ingérée dans `wiki_revisions`. */
export const CANON_REFERENCES_TABLE = "canon_references";

/**
 * Doctrine effective (document en base fusionné aux défauts).
 *
 * Mémoïsée par requête : la page publique l'appelle pour le verdict et pour
 * l'affichage des règles, `canon-preuves` aussi — une seule lecture suffit.
 */
type CanonDatabase = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class CanonConfigWriteError extends Error {
  constructor(
    message: string,
    public readonly status: 409 | 428,
  ) {
    super(message);
    this.name = "CanonConfigWriteError";
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => JSON.stringify(key) + ":" + stableJson(item))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

const configurationColumns = {
  ...getTableColumns(canonConfig),
  updatedAtExact: sql<string>`${canonConfig.updatedAt}::text`,
};
const referenceColumns = {
  ...getTableColumns(canonReferences),
  updatedAtExact: sql<string>`${canonReferences.updatedAt}::text`,
};
type VersionedConfiguration = typeof canonConfig.$inferSelect & { updatedAtExact: string };
type VersionedReference = typeof canonReferences.$inferSelect & { updatedAtExact: string };

function referenceVersion(row: VersionedReference): string {
  const { createdAt: _created, seenAt: _seen, updatedAt: _updated, ...state } = row;
  return createHash("sha256").update(stableJson(state)).digest("hex");
}

function configurationSnapshot(row: VersionedConfiguration | undefined): string {
  return createHash("sha256")
    .update(
      stableJson(
        row
          ? {
              data: row.data,
              updatedAt: row.updatedAtExact,
            }
          : null,
      ),
    )
    .digest("hex");
}

async function readReferences(client: CanonDatabase | typeof db): Promise<CanonReference[]> {
  const rows = await client
    .select(referenceColumns)
    .from(canonReferences)
    .where(eq(canonReferences.visible, true));
  return rows.map((r) =>
    Object.assign(
      {
        id: r.id,
        subject: r.subject,
        keywords: Array.isArray(r.keywords) ? r.keywords : [],
        text: r.text,
      },
      r.textFr ? { textFr: r.textFr } : {},
      { source: r.source },
      r.year ? { year: r.year } : {},
      {
        document: r.document,
        lang: r.lang === "en" || r.lang === "ja" ? r.lang : "fr",
        provenance:
          r.provenance === "aphrody" || r.provenance === "databooks" || r.provenance === "manga"
            ? r.provenance
            : "manuel",
      },
      r.href ? { href: r.href } : {},
      r.updatedAt instanceof Date ? { updatedAt: r.updatedAt.toISOString() } : {},
      { version: referenceVersion(r) },
    ),
  );
}

/** Strict administration read: database failures must never become editable defaults. */
export async function getCanonConfigSnapshot(): Promise<{ config: CanonConfig; expected: string }> {
  const [row] = await db
    .select(configurationColumns)
    .from(canonConfig)
    .where(eq(canonConfig.id, SINGLETON_ID))
    .limit(1);
  if (row && (!row.data || typeof row.data !== "object" || Array.isArray(row.data))) {
    throw new Error("Invalid canon configuration document");
  }
  const doctrine = row ? resolveCanonConfig(row.data) : structuredClone(DEFAULT_CANON_CONFIG);
  const references = await readReferences(db);
  return {
    config: {
      ...doctrine,
      references: [...doctrine.references.filter((r) => r.provenance === "manuel"), ...references],
    },
    expected: configurationSnapshot(row),
  };
}

/** Public reads remain available when the editorial database is unavailable. */
export const getCanonConfig = cache(async (): Promise<CanonConfig> => {
  try {
    return (await getCanonConfigSnapshot()).config;
  } catch (error) {
    console.error("[canon-config] public doctrine fallback:", error);
    return structuredClone(DEFAULT_CANON_CONFIG);
  }
});

export const getCanonReferences = cache(async (): Promise<CanonReference[]> => {
  try {
    return await readReferences(db);
  } catch (error) {
    console.error("[canon-config] public references unavailable:", error);
    return [];
  }
});

// ── Gestes de l'éditeur sur les citations ingérées ──────────────────────────

/** État d'une ligne `canon_references` utile aux gestes de l'éditeur. */
export interface LigneCitation {
  id: string;
  subject: string;
  textFr: string | null;
  visible: boolean;
  updatedAt: Date;
  updatedAtExact: string;
  version: string;
}

/** Un geste à appliquer à UNE ligne, conditionné à la version lue (`lu`). */
export interface GesteCitation {
  id: string;
  lu: string;
  /** Nouvelle traduction (`null` = effacée) ; absent = inchangée. */
  textFr?: string | null;
  /** Nouvelle visibilité ; absent = inchangée. */
  visible?: boolean;
}

export interface PlanCitations {
  gestes: GesteCitation[];
  /** Gestes refusés faute de pouvoir prouver que la ligne n'a pas bougé. */
  conflits: { id: string; raison: string }[];
}

/**
 * Traduit les citations ingérées renvoyées par l'éditeur en gestes explicites.
 *
 * Trois règles, qui sont la correction de citations masquées sans trace :
 *  - une citation absente du document n'est **jamais** touchée : ne pas renvoyer
 *    une ligne (liste filtrée, client ancien, identifiant réécrit) n'est pas
 *    une demande de retrait ;
 *  - le retrait est un geste explicite (`visible: false`) ;
 *  - each edit requires the exact opaque row version returned by the reader;
 *    PostgreSQL microseconds must never be compared through a JavaScript Date.
 */
export function planifierGestesCitations(
  demandes: readonly CanonReference[],
  lignes: ReadonlyMap<string, LigneCitation>,
): PlanCitations {
  const gestes: GesteCitation[] = [];
  const conflits: PlanCitations["conflits"] = [];
  const vus = new Set<string>();
  for (const d of demandes) {
    if (d.provenance === "manuel" || vus.has(d.id)) continue;
    vus.add(d.id);
    const ligne = lignes.get(d.id);
    if (!ligne) continue;
    const textFr = d.textFr ?? null;
    const changeTraduction = textFr !== (ligne.textFr ?? null);
    const changeVisibilite = typeof d.visible === "boolean" && d.visible !== ligne.visible;
    if (!changeTraduction && !changeVisibilite) continue;
    if (!d.version || d.version !== ligne.version) {
      conflits.push({ id: d.id, raison: "citation version missing or changed since read" });
      continue;
    }
    gestes.push({
      id: d.id,
      lu: ligne.updatedAtExact,
      ...(changeTraduction ? { textFr } : {}),
      ...(changeVisibilite ? { visible: d.visible } : {}),
    });
  }
  return { gestes, conflits };
}

/** Auteur figé des révisions (`wiki_revisions.editorId` / `editorName`). */
type Auteur = { id: string | null; name: string | null } | null;

/**
 * Auteur de l'enregistrement : l'identité d'automatisation d'une requête par
 * jeton (jamais le compte `OWNER_ID` auquel elle est rattachée), sinon le user
 * métier, sinon l'identifiant transmis par la route.
 *
 * Import paresseux : la lecture publique de la doctrine ne charge pas la
 * session, et hors requête (script) la résolution échoue sans conséquence.
 */
async function auteurDeLaRequete(
  by: string | null | undefined,
): Promise<{ auteur: Auteur; updatedBy: string | null }> {
  try {
    const session = await import("@/lib/session");
    const me = await session.getCurrentUser();
    if (me?.automation) {
      return {
        auteur: { id: me.automation.id, name: me.automation.name },
        updatedBy: me.automation.id,
      };
    }
    if (by === session.TOKEN_ADMIN_SESSION_ID) {
      return { auteur: { ...session.API_TOKEN_ACTOR }, updatedBy: session.API_TOKEN_ACTOR.id };
    }
    const auteur = session.revisionActorOf(me);
    if (auteur) return { auteur, updatedBy: by ?? auteur.id };
  } catch {
    // Hors requête ou session indisponible : on retombe sur `by`.
  }
  return { auteur: by ? { id: by, name: null } : null, updatedBy: by ?? null };
}

/**
 * Applique un geste dans une transaction : la ligne n'est modifiée que si son
 * `updated_at` est encore celui de la version lue (égalité, et non un
 * « avant » : l'ingestion écrit `now()` dans le fuseau de la session, le site
 * une date UTC, seules deux valeurs lues sont comparables), et la révision est
 * écrite dans la même transaction — un retrait sans trace est impossible.
 */
async function appliquerGeste(
  geste: GesteCitation,
  avant: LigneCitation,
  auteur: Auteur,
  tx: CanonDatabase,
): Promise<boolean> {
  const set: Partial<typeof canonReferences.$inferInsert> = { updatedAt: new Date() };
  if ("textFr" in geste) set.textFr = geste.textFr ?? null;
  if (typeof geste.visible === "boolean") set.visible = geste.visible;
  const modifiees = await tx
    .update(canonReferences)
    .set(set)
    .where(
      and(eq(canonReferences.id, geste.id), eq(sql`${canonReferences.updatedAt}::text`, geste.lu)),
    )
    .returning({ id: canonReferences.id });
  if (modifiees.length === 0) return false;
  const snapshot = (l: { textFr?: string | null; visible?: boolean }) => ({
    ...("textFr" in geste ? { textFr: l.textFr ?? null } : {}),
    visible: l.visible,
  });
  await tx.insert(wikiRevisions).values({
    tableName: CANON_REFERENCES_TABLE,
    rowId: geste.id,
    action: typeof geste.visible === "boolean" ? "visibility" : "update",
    label: avant.subject.slice(0, 200),
    before: snapshot(avant),
    after: snapshot({
      textFr: "textFr" in geste ? geste.textFr : avant.textFr,
      visible: geste.visible ?? avant.visible,
    }),
    editorId: auteur?.id ?? null,
    editorName: auteur?.name ?? null,
  });
  return true;
}

/** Upsert du singleton (on stocke le document déjà résolu) → doctrine résolue. */
export async function saveCanonConfig(
  patch: unknown,
  by: string | null | undefined,
  expected: unknown,
): Promise<{ config: CanonConfig; expected: string }> {
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new CanonConfigWriteError("A current configuration snapshot is required", 428);
  }
  const brut = resolveCanonConfig(patch);
  // Seules les citations saisies à la main s'enregistrent dans le blob : les
  // autres viennent de la table et y retournent au prochain passage du service.
  // Une saisie manuelle marquée `visible: false` est un retrait du document.
  const resolved: CanonConfig = {
    ...brut,
    references: brut.references
      .filter((r) => r.provenance === "manuel" && r.visible !== false)
      .map(({ visible: _visible, updatedAt: _updatedAt, version: _version, ...r }) => r),
  };
  const { auteur, updatedBy } = await auteurDeLaRequete(by);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select(configurationColumns)
      .from(canonConfig)
      .where(eq(canonConfig.id, SINGLETON_ID))
      .limit(1);
    if (configurationSnapshot(before) !== expected)
      throw new CanonConfigWriteError("Configuration changed since it was read", 409);
    const data = resolved as unknown as Record<string, unknown>;
    const updatedAt = new Date(Math.max(Date.now(), (before?.updatedAt.getTime() ?? 0) + 1));
    const values = { data, updatedBy, updatedAt };
    const written = before
      ? await tx
          .update(canonConfig)
          .set(values)
          .where(
            and(
              eq(canonConfig.id, SINGLETON_ID),
              eq(sql`${canonConfig.updatedAt}::text`, before.updatedAtExact),
              eq(canonConfig.data, before.data),
            ),
          )
          .returning(configurationColumns)
      : await tx
          .insert(canonConfig)
          .values({ id: SINGLETON_ID, ...values })
          .onConflictDoNothing()
          .returning(configurationColumns);
    if (written.length !== 1)
      throw new CanonConfigWriteError("Configuration changed during save", 409);
    // L'éditeur peut retoucher une traduction, retirer ou rétablir une citation
    // ingérée : ces gestes s'appliquent à la table, ligne par ligne, jamais par
    // différence avec ce qui manque au document.
    const ingerees = brut.references.filter((r) => r.provenance !== "manuel");
    if (ingerees.length > 0) {
      const ids = [...new Set(ingerees.map((r) => r.id))];
      const lignes = new Map<string, LigneCitation>();
      for (const r of await tx
        .select(referenceColumns)
        .from(canonReferences)
        .where(inArray(canonReferences.id, ids))) {
        lignes.set(r.id, { ...r, version: referenceVersion(r) });
      }
      const { gestes, conflits } = planifierGestesCitations(ingerees, lignes);
      for (const geste of gestes) {
        if (!(await appliquerGeste(geste, lignes.get(geste.id)!, auteur, tx))) {
          conflits.push({ id: geste.id, raison: "citation modifiée pendant l'enregistrement" });
        }
      }
      if (conflits.length > 0) {
        throw new CanonConfigWriteError("One or more references changed since they were read", 409);
      }
    }

    if (!before || stableJson(before.data) !== stableJson(data)) {
      await tx.insert(wikiRevisions).values({
        tableName: "CanonConfig",
        rowId: SINGLETON_ID,
        action: "update",
        label: "Canon doctrine",
        before: before?.data ?? null,
        after: data,
        editorId: auteur?.id ?? null,
        editorName: auteur?.name ?? null,
      });
    }

    const references = await readReferences(tx);
    return {
      config: { ...resolved, references: [...resolved.references, ...references] },
      expected: configurationSnapshot(written[0]),
    };
  });
}
