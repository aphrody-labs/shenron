/**
 * wiki-admin — accès **lecture + écriture** direct à Neon (schéma `bot`) pour
 * l'admin du wiki Dragon Ball éditorial, sans aller-retour vers l'API REST du
 * bot. Neon `bot.*` est la **source de vérité** du wiki éditorial.
 *
 * Server-only : tape la DB Postgres via Drizzle (`@/lib/db`) → ne doit jamais
 * entrer dans un bundle client. Le route handler `/api/wiki-admin` et les Server
 * Components db-universe sont les seuls consommateurs.
 *
 * Contrat de sortie pour le route handler = **camelCase** (clés des objets
 * Drizzle `bot-schema.ts`), aligné 1:1 sur l'API bot `/api/database` → les
 * composants Client (`DbCrud`, éditeur générique) sont réutilisés verbatim.
 * Les Server Components db-universe consomment du **snake_case** historique :
 * `listWikiSnake` applique la conversion (miroir de `toSnake` de `_lib.ts`).
 *
 * Coercition de types : colonnes bigint (`int(...)` de bot-schema, `dataType
 * "number"`) → `Number(value)` (NaN/"" → null) ; text → `string|null`. La pk
 * auto (id) n'est jamais écrite à l'insert si absente du body.
 */
import "server-only";
import { assertDatabooksWritable } from "@/lib/databooks-freeze";
import { assertVariantEvidenceUpdate } from "@/lib/wiki-variant-evidence";
import type { RevisionActor } from "@/lib/wiki-revisions";
import {
  and,
  type Column,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  max,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { escapeLike } from "@aphrody/shenron-db/repos/wiki";
import { db } from "@/lib/db";
import { wikiRevisions } from "@/db/schema";
import * as botSchema from "@/db/bot-schema";
import { resolveMediaEditionId } from "@/lib/media-edition-aliases";
import { kindFromCategory } from "@/lib/databook-categories";
import {
  assertWikiUpdatePrecondition,
  WikiUpdateRequestError,
  wikiUpdateSnapshotHash,
} from "@/lib/wiki-update-precondition";
import { validateCatalogEditorialBody } from "@/lib/catalog-editorial-contracts";
import {
  anyGapSql,
  countWhereSql,
  drizzleColumnKeys,
  emptyGapCounts,
  gapKindSql,
  isBlankValue,
  isPublicRow,
  labelSql,
  planGaps,
  scopeSql,
  sumGapCounts,
  WORKLIST_EXTRA_TABLES,
  type GapCounts,
  type GapKind,
  type GapPlan,
  type VisibilityScope,
} from "@/lib/wiki-gaps";
import { WIKI_TABLE_SPECS, type WikiTableSpec } from "@/lib/wiki-tables";
import { planWikiList, planWikiRelation } from "@/lib/wiki-collection-query";
import {
  CatalogMediaConflictError,
  isMediaCatalogTable,
  isbnVariants,
  parseMediaCatalogBody,
} from "@/lib/catalog-media-contracts";

// Les tables Drizzle bot-schema sont hétérogènes → any localisé et assumé
// (la règle no-explicit-any est déjà off dans eslint.config.mjs).
// biome-ignore lint/suspicious/noExplicitAny: tables Drizzle hétérogènes
type AnyTable = any;
type Row = Record<string, unknown>;

interface ResolvedTable extends WikiTableSpec {
  table: AnyTable;
  /** colonnes camelCase de l'objet Drizzle (toutes, pk incluse). */
  columns: string[];
}

/**
 * Registre runtime : associe chaque spec client-safe (`WIKI_TABLE_SPECS`) à son
 * objet Drizzle `bot-schema`. Garder synchronisé avec `wiki-tables.ts`.
 */
const TABLE_OBJECTS: Record<string, AnyTable> = {
  db_characters: botSchema.botCharacters,
  db_planets: botSchema.botPlanets,
  db_transformations: botSchema.botTransformations,
  db_races: botSchema.botRaces,
  db_techniques: botSchema.botTechniques,
  db_character_techniques: botSchema.botCharacterTechniques,
  db_character_arcs: botSchema.botCharacterArcs,
  db_character_variants: botSchema.botCharacterVariants,
  db_character_relations: botSchema.botCharacterRelations,
  db_character_continuities: botSchema.botCharacterContinuities,
  db_character_variant_battles: botSchema.botCharacterVariantBattles,
  db_character_variant_staff_credits: botSchema.botCharacterVariantStaffCredits,
  db_character_variant_voice_actors: botSchema.botCharacterVariantVoiceActors,
  db_character_variant_appearances: botSchema.botCharacterVariantAppearances,
  db_character_variant_technique_uses: botSchema.botCharacterVariantTechniqueUses,
  db_sagas: botSchema.botSagas,
  db_arcs: botSchema.botArcs,
  db_episodes: botSchema.botEpisodes,
  db_manga_volumes: botSchema.botMangaVolumes,
  db_databooks: botSchema.botDatabooks,
  db_manga_chapters: botSchema.botMangaChapters,
  db_manga_pages: botSchema.botMangaPages,
  db_movies: botSchema.botMovies,
  db_games: botSchema.botGames,
  db_game_characters: botSchema.botGameCharacters,
  db_wiki_sections: botSchema.botWikiSections,
  db_tools: botSchema.botTools,
  db_news: botSchema.botNews,
  db_battles: botSchema.botBattles,
  db_items: botSchema.botItems,
  db_dragons: botSchema.botDragons,
  db_wishes: botSchema.botWishes,
  db_locations: botSchema.botLocations,
  db_tournaments: botSchema.botTournaments,
  db_voice_actors: botSchema.botVoiceActors,
  db_soundtracks: botSchema.botSoundtracks,
  db_power_levels: botSchema.botPowerLevels,
  db_timeline_events: botSchema.botTimelineEvents,
  db_sources: botSchema.botSources,
  db_licenses: botSchema.botLicenses,
  db_assets: botSchema.botAssets,
  media_works: botSchema.botMediaWorks,
  media_editions: botSchema.botMediaEditions,
  media_volumes: botSchema.botMediaVolumes,
};

export const WIKI_TABLES: Record<string, ResolvedTable> = Object.fromEntries(
  Object.entries(WIKI_TABLE_SPECS)
    .filter(([name]) => Boolean(TABLE_OBJECTS[name]))
    .map(([name, spec]) => {
      const table = TABLE_OBJECTS[name];
      if (!table) throw new Error(`[wiki-admin] table Drizzle absente: ${name}`);
      // Les clés camelCase exposées par l'objet Drizzle (colonnes du select).
      const columns = drizzleColumnKeys(table);
      return [name, { ...spec, table, columns }];
    }),
);

export function isWikiTable(name: string): name is keyof typeof WIKI_TABLES {
  return name in WIKI_TABLES;
}

function getSpec(name: string): ResolvedTable | null {
  return WIKI_TABLES[name] ?? null;
}

/** dataType Drizzle de la colonne camelCase `key` ("number" | "string" | …). */
function colDataType(spec: ResolvedTable, key: string): string | undefined {
  const col = spec.table[key];
  return col?.dataType as string | undefined;
}

/** Coerce une valeur entrante vers le type de la colonne (number / string / null). */
function coerceValue(spec: ResolvedTable, key: string, value: unknown): unknown {
  if (value == null || value === "") return null;
  const dt = colDataType(spec, key);
  if (dt === "number") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isNaN(n) ? null : n;
  }
  // Colonnes booléennes (ex. `visible` des sections) : accepte true/"true"/1/"1".
  if (dt === "boolean") {
    return value === true || value === "true" || value === 1 || value === "1";
  }
  // Colonnes jsonb (dataType Drizzle "json", ex. `links` des sections) : passe
  // la valeur telle quelle → Drizzle sérialise le jsonb. NE JAMAIS String(value)
  // ici (casserait un array en scalaire — cf. piège jsonb du CLAUDE.md).
  if (dt === "json") {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }
  // text et fallback : string
  return typeof value === "string" ? value : String(value);
}

/**
 * Filtre + coerce un body entrant aux colonnes mutables uniquement (whitelist).
 * `forInsert` autorise en plus la pk simple si fournie (jamais générée si absente).
 */
function buildValues(spec: ResolvedTable, body: Row, { forInsert }: { forInsert: boolean }): Row {
  if (spec.name === "db_character_variants" && forInsert && Object.hasOwn(body, "evidence")) {
    throw new WikiUpdateRequestError(
      "Variant evidence metadata may only extend an existing measurement",
    );
  }
  // Guard the owner writer as well as HTTP routes, including historical restores.
  if (spec.name === "db_databooks" && Object.hasOwn(body, "pages")) assertDatabooksWritable();
  const out: Row = {};
  const allowed = new Set(spec.mutableColumns);
  // À l'insert, on autorise aussi la/les pk si explicitement fournies.
  if (forInsert && !isMediaCatalogTable(spec.name)) {
    for (const pkCol of pkCamelKeys(spec)) {
      if (body[pkCol] !== undefined) allowed.add(pkCol);
    }
  }
  const selected = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
  const editorial = validateCatalogEditorialBody(spec.name, selected, forInsert);
  if (!editorial.ok) throw new WikiUpdateRequestError("Invalid editorial metadata");
  const parsed = parseMediaCatalogBody(spec.name, editorial.value, forInsert);
  for (const key of allowed) {
    if (key in parsed) out[key] = coerceValue(spec, key, parsed[key]);
  }
  return out;
}

/** Clés camelCase de la/des colonne(s) pk (résout snake_case composite → camel). */
function pkCamelKeys(spec: ResolvedTable): string[] {
  const pks = Array.isArray(spec.pk) ? spec.pk : [spec.pk];
  return pks.map((snake) => {
    // pk simple "id"/"key"/"slug" sont déjà identiques en camel.
    if (spec.columns.includes(snake)) return snake;
    const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return spec.columns.includes(camel) ? camel : snake;
  });
}

/**
 * Condition WHERE sur la pk. `id` peut être :
 *   - simple : valeur brute
 *   - composite : "a,b" (ordre = ordre des colonnes pk) ou "a:b"
 */
function pkCondition(spec: ResolvedTable, id: string): SQL {
  const keys = pkCamelKeys(spec);
  const parts = keys.length > 1 ? id.split(/[,:]/) : [id];
  if (parts.length !== keys.length) {
    throw new Error(`pk composite ${spec.name} attend ${keys.length} valeurs (reçu "${id}")`);
  }
  const conds = keys.map((key, i) => {
    const raw = parts[i]?.trim() ?? "";
    const coerced = coerceValue(spec, key, raw);
    return eq(spec.table[key], coerced as never);
  });
  return (conds.length === 1 ? conds[0] : and(...conds)) as SQL;
}

// ── camelCase ↔ snake_case ────────────────────────────────────────────────
function toSnakeRow(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] = v;
  }
  return out;
}

// ── API camelCase (route handler / contrat bot) ────────────────────────────

export async function listWiki(
  table: string,
  {
    limit = 50,
    offset = 0,
    q,
    visibleOnly = false,
  }: { limit?: number; offset?: number; q?: string; visibleOnly?: boolean } = {},
): Promise<{ rows: Row[]; total: number; limit: number; offset: number }> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const plan = planWikiList(spec.columns, pkCamelKeys(spec), { limit, offset, q });
  const term = plan.q;
  // Échappe les métacaractères LIKE (% _ \) → "100%" cherche bien le littéral.
  const safe = escapeLike(term);
  const search =
    term && plan.searchColumns.length
      ? or(...plan.searchColumns.map((k) => ilike(spec.table[k], `%${safe}%`)))
      : undefined;
  const conditions: SQL[] = [];
  if (search) conditions.push(search);
  if (visibleOnly && spec.columns.includes("visible")) {
    conditions.push(eq(spec.table.visible, true));
  }
  const where =
    conditions.length > 1
      ? and(...conditions)
      : conditions.length === 1
        ? conditions[0]
        : undefined;
  // Ordre déterministe : libellé PUIS pk (tie-break) → pagination stable même
  // quand plusieurs lignes partagent le même libellé.
  const rows = (await db
    .select()
    .from(spec.table)
    .where(where)
    .orderBy(...plan.orderColumns.map((key) => asc(spec.table[key])))
    .limit(plan.limit)
    .offset(plan.offset)) as Row[];
  const [{ value: total = 0 } = { value: 0 }] = await db
    .select({ value: count() })
    .from(spec.table)
    .where(where);
  return { rows, total: Number(total), limit: plan.limit, offset: plan.offset };
}

/**
 * Options légères pour un picker de clé étrangère : seulement pk + libellé
 * (name/title/slug), triées, plafond élevé. Évite de rapatrier des lignes
 * complètes (jsonb compris) et la troncature à 500 de `listWiki`.
 */
export async function listWikiOptions(table: string): Promise<{ value: string; label: string }[]> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const pkKey = pkCamelKeys(spec)[0];
  const labelKey = ["name", "title", "slug"].find((k) => spec.columns.includes(k)) ?? pkKey;
  const rows = (await db
    .select({ value: spec.table[pkKey], label: spec.table[labelKey] })
    .from(spec.table)
    .orderBy(spec.table[labelKey])
    .limit(5000)) as { value: unknown; label: unknown }[];
  return rows.map((r) => ({ value: String(r.value), label: String(r.label ?? r.value) }));
}

/**
 * Relations N-N : ids liés dans une table de jointure. Ex. techniques d'un
 * personnage → `listWikiRelations("db_character_techniques", "characterId", "5",
 * "techniqueId")`. Colonnes validées contre le schéma (anti-injection).
 */
export async function listWikiRelations(
  table: string,
  col: string,
  id: string,
  target: string,
): Promise<string[]> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const plan = planWikiRelation(spec.columns, col, id, target);
  const rows = (await db
    .select({ v: spec.table[target] })
    .from(spec.table)
    .where(eq(spec.table[plan.col], coerceValue(spec, plan.col, plan.id) as never))) as {
    v: unknown;
  }[];
  return rows.map((r) => String(r.v));
}

/**
 * 1-N children of a parent row: every row of `table` whose `col` equals `id`
 * (e.g. the transformations of one character →
 * `listWikiByParent("db_transformations", "characterId", "5")`). Uncapped on
 * purpose: the generic `listWiki` page (50 rows, whole table) is not a filter.
 * Column validated against the schema (anti-injection).
 */
export async function listWikiByParent(
  table: string,
  col: string,
  id: string,
): Promise<{ rows: Row[]; total: number }> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const plan = planWikiRelation(spec.columns, col, id);
  const orderColumns = [
    ...(spec.columns.includes("sortOrder") ? ["sortOrder"] : []),
    ...pkCamelKeys(spec).filter((key) => key !== "sortOrder"),
  ];
  const rows = (await db
    .select()
    .from(spec.table)
    .where(eq(spec.table[plan.col], coerceValue(spec, plan.col, plan.id) as never))
    .orderBy(...orderColumns.map((key) => asc(spec.table[key])))) as Row[];
  return { rows, total: rows.length };
}

export async function getWikiRow(
  table: string,
  id: string,
  options: { transaction?: CatalogTransaction; lock?: boolean } = {},
): Promise<Row | null> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const client = options.transaction ?? db;
  if (options.lock && !options.transaction) throw new Error("Wiki row locks require a transaction");
  if (options.lock) {
    if (isMediaCatalogTable(table)) await lockMediaCatalog(options.transaction!, table);
    // Match the writer's lock order: advisory key first, then the physical row.
    await client.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`shenron:wiki:${table}:${id}`}))`,
    );
  }
  const query = client.select().from(spec.table).where(pkCondition(spec, id)).limit(1);
  const rows = (await (options.lock ? query.for("update") : query)) as Row[];
  const row = rows[0] ?? null;
  if (row && table === "media_editions") {
    // Preserve the historical row and requested ID for admin and revision readers.
    return { ...row, canonicalId: await resolveMediaEditionId(client, Number(id)) };
  }
  return row;
}

/** Read-only evidence for deriving missing media pagination; no page text or secrets. */
export async function readMediaVolumePageReferenceInventory(): Promise<
  Array<{
    id: number;
    pageCount: number | null;
    chapters: Array<{ id: number; pages: string[] }>;
  }>
> {
  const rows = await db.execute(sql`SELECT v.id,v.page_count AS "pageCount",
    coalesce((SELECT json_agg(json_build_object('id',c.id,'pages',c.pages) ORDER BY c.id)
    FROM bot.media_chapters c WHERE c.volume_id=v.id),'[]'::json) AS chapters
    FROM bot.media_volumes v WHERE v.page_count IS NULL ORDER BY v.id`);
  if (rows.length > 1000) throw new Error("Media page-reference inventory exceeds bounds");
  return rows.map((row) => {
    const id = Number(row.id);
    if (!Number.isSafeInteger(id) || id < 1 || !Array.isArray(row.chapters)) {
      throw new Error("Invalid media page-reference inventory row");
    }
    return {
      id,
      pageCount: row.pageCount === null ? null : Number(row.pageCount),
      chapters: row.chapters.map((chapter: { id: number; pages: string[] }) => ({
        id: Number(chapter.id),
        pages: chapter.pages,
      })),
    };
  });
}

/**
 * Tables dont la pk est auto-générée par Postgres (IDENTITY / default) → ne
 * jamais injecter d'id à l'insert. Toutes les autres tables wiki à pk numérique
 * simple ont une pk `bigint` SANS séquence (héritée du SQLite du bot) → la
 * création depuis le studio doit calculer le prochain id (max+1) elle-même,
 * sinon `null value in column "id"`.
 */
const DB_AUTOGEN_PK = new Set<string>([
  "db_wiki_sections",
  "db_databooks",
  "db_character_variants",
  "db_character_relations",
  "db_character_variant_battles",
  "db_character_variant_staff_credits",
  "db_character_variant_voice_actors",
  "db_character_variant_appearances",
  "db_character_variant_technique_uses",
  "media_works",
  "media_editions",
  "media_volumes",
]);

type CatalogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const MEDIA_IDENTITY_FIELDS: Record<string, string[]> = {
  media_works: ["slug", "kind", "series"],
  media_editions: ["workId", "edition", "language", "isbn", "label", "pageColor"],
  media_volumes: ["slug", "editionId", "number", "legacyVolumeId"],
};

/** NULL ISBNs have no unique constraint in PostgreSQL; serialize editorial deduplication. */
async function lockMediaCatalog(tx: CatalogTransaction, table: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`shenron:catalog:${table}`}))`);
}

async function assertMediaCatalogUnique(
  tx: CatalogTransaction,
  spec: ResolvedTable,
  values: Row,
  currentId?: string,
): Promise<void> {
  let identity: SQL | undefined;
  if (spec.name === "media_works") {
    identity = or(
      eq(spec.table.slug, values.slug),
      and(eq(spec.table.kind, values.kind), eq(spec.table.series, values.series)),
    );
  } else if (spec.name === "media_editions") {
    const isbnIdentity =
      typeof values.isbn === "string"
        ? inArray(
            sql`upper(regexp_replace(${spec.table.isbn}, '[[:space:]-]', '', 'g'))`,
            isbnVariants(values.isbn),
          )
        : undefined;
    const editorialIdentity = and(
      eq(spec.table.workId, values.workId),
      eq(spec.table.edition, values.edition),
      eq(spec.table.language, values.language),
      sql`lower(trim(${spec.table.label})) = lower(trim(${String(values.label)}))`,
      eq(spec.table.pageColor, values.pageColor),
      typeof values.isbn === "string" ? isNull(spec.table.isbn) : undefined,
    );
    identity = or(isbnIdentity, editorialIdentity);
  } else if (spec.name === "media_volumes") {
    identity = or(
      eq(spec.table.slug, values.slug),
      and(eq(spec.table.editionId, values.editionId), eq(spec.table.number, values.number)),
      values.legacyVolumeId != null
        ? eq(spec.table.legacyVolumeId, values.legacyVolumeId)
        : undefined,
    );
  }
  if (!identity) return;
  if (spec.name === "media_editions") {
    identity = and(
      identity,
      sql`NOT EXISTS (
      SELECT 1 FROM bot.media_edition_aliases alias
      WHERE alias.alias_id = ${spec.table.id}
    )`,
    );
  }
  const matches = await tx
    .select({ id: spec.table.id })
    .from(spec.table)
    .where(currentId ? and(identity, sql`${spec.table.id} <> ${Number(currentId)}`) : identity);
  if (matches.length) throw new CatalogMediaConflictError(matches.map((row) => Number(row.id)));
}

/** Prochain id disponible (max+1) pour une table à pk numérique sans séquence. */
async function nextPkValue(spec: ResolvedTable, pkKey: string): Promise<number> {
  const [{ value = null } = { value: null }] = (await db
    .select({ value: max(spec.table[pkKey]) })
    .from(spec.table)) as Array<{ value: number | null }>;
  return (value == null ? 0 : Number(value)) + 1;
}

/**
 * Databooks : un seul champ UI (`category`). `kind` (NOT NULL, index legacy)
 * est dérivé automatiquement — jamais exposé au formulaire.
 */
function applyDatabookKind(
  table: string,
  values: Row,
  { forInsert }: { forInsert: boolean },
): void {
  if (table !== "db_databooks") return;
  if (values.category != null && values.category !== "") {
    values.kind = kindFromCategory(String(values.category));
  } else if (forInsert) {
    values.category = "Autre";
    values.kind = "databook";
  }
}

export async function insertWiki(
  table: string,
  data: Row,
  options: { restoreId?: number } = {},
): Promise<Row> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  const values = buildValues(spec, data, { forInsert: true });
  if (options.restoreId !== undefined) {
    if (
      !isMediaCatalogTable(table) ||
      !Number.isSafeInteger(options.restoreId) ||
      options.restoreId <= 0
    ) {
      throw new Error("Invalid media restoration identity.");
    }
    values.id = options.restoreId;
  }
  applyDatabookKind(table, values, { forInsert: true });
  if (Object.keys(values).length === 0) {
    throw new Error("Aucune colonne fournie.");
  }
  // Tables de jointure (pk composite) : lier est idempotent → un re-lien d'une
  // paire existante est un no-op au lieu d'une erreur unique_violation brute.
  const isJoin = Array.isArray(spec.pk);
  if (isMediaCatalogTable(table)) {
    return db.transaction(async (tx) => {
      await lockMediaCatalog(tx, table);
      if (table === "media_editions" && options.restoreId !== undefined) {
        const canonicalId = await resolveMediaEditionId(tx, options.restoreId);
        if (canonicalId !== options.restoreId) throw new CatalogMediaConflictError([canonicalId]);
      }
      if (table === "media_volumes" && values.editionId !== undefined) {
        values.editionId = await resolveMediaEditionId(tx, Number(values.editionId));
      }
      await assertMediaCatalogUnique(tx, spec, values);
      const builder = tx.insert(spec.table);
      const query = options.restoreId === undefined ? builder : builder.overridingSystemValue();
      const [inserted] = (await query.values(values as never).returning()) as Row[];
      if (!inserted) throw new Error("Catalogue insert returned no row.");
      return inserted;
    });
  }
  // Pk numérique simple non fournie et non auto-générée → attribue max+1 pour
  // permettre la création d'entités depuis le studio (« Nouvelle entrée »).
  if (!isJoin && !DB_AUTOGEN_PK.has(table)) {
    const pkKey = pkCamelKeys(spec)[0];
    if (values[pkKey] === undefined && colDataType(spec, pkKey) === "number") {
      values[pkKey] = await nextPkValue(spec, pkKey);
    }
  }
  const q = db.insert(spec.table).values(values as never);
  const inserted = (await (isJoin ? q.onConflictDoNothing() : q).returning()) as Row[];
  return inserted[0] ?? values;
}

export async function updateWiki(
  table: string,
  id: string,
  data: Row,
  options: {
    transaction?: CatalogTransaction;
    expected?: Row;
    expectedSha256?: string;
    actor?: RevisionActor;
    revisionAction?: "update" | "revert";
    onRevision?: (revisionId: string) => void;
    /** Internal historical restore: identity is checked against the persisted revision. */
    restoreEpisodeRevisionId?: string;
  } = {},
): Promise<Row> {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  let historicalFrames = false;
  if (options.restoreEpisodeRevisionId !== undefined) {
    if (
      table !== "db_episodes" ||
      options.revisionAction !== "revert" ||
      !options.expected ||
      !options.expectedSha256 ||
      !Object.hasOwn(data, "frames")
    )
      throw new WikiUpdateRequestError("Invalid historical episode restore");
    const [revision] = await db
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.id, options.restoreEpisodeRevisionId))
      .limit(1);
    const before = revision?.before as Row | null | undefined;
    if (
      revision?.tableName !== table ||
      revision.rowId !== id ||
      !before ||
      !Object.hasOwn(before, "frames") ||
      wikiUpdateSnapshotHash({ frames: data.frames }) !==
        wikiUpdateSnapshotHash({ frames: before.frames })
    )
      throw new WikiUpdateRequestError(
        "Historical episode frames differ from the recorded revision",
      );
    historicalFrames = true;
  }
  // A trusted historical array still passes the entire base frame schema; only
  // the newer native provenance constraint is inapplicable to its old producer IDs.
  const validationData =
    historicalFrames && Array.isArray(data.frames)
      ? {
          ...data,
          frames: data.frames.map((frame: Row) =>
            frame.source === "bun-video" ? { ...frame, source: "ffmpeg" } : frame,
          ),
        }
      : data;
  const values = buildValues(spec, validationData, { forInsert: false });
  if (historicalFrames) values.frames = data.frames;
  applyDatabookKind(table, values, { forInsert: false });
  if (Object.keys(values).length === 0) {
    throw new Error("Aucune colonne mutable fournie.");
  }
  const cond = pkCondition(spec, id);
  const client = options.transaction ?? db;
  const transaction = <T>(work: (tx: CatalogTransaction) => Promise<T>): Promise<T> =>
    options.transaction ? work(options.transaction) : db.transaction(work);
  const variantEvidenceWrite =
    table === "db_character_variants" && Object.hasOwn(values, "evidence");
  const variantImageWrite = table === "db_character_variants" && Object.hasOwn(values, "image");
  // Import after module initialization: revisions also calls this writer for revert.
  const variantJournal =
    table === "db_character_variants"
      ? (await import("@/lib/wiki-revisions")).recordRevisionStrict
      : null;
  if (
    !isMediaCatalogTable(table) &&
    (options.expected ||
      options.expectedSha256 ||
      (table === "db_episodes" && Object.hasOwn(values, "frames")) ||
      (table === "db_manga_chapters" &&
        ["pages", "readerExtent", "visible"].some((key) => Object.hasOwn(values, key))) ||
      variantEvidenceWrite ||
      variantImageWrite ||
      variantJournal)
  ) {
    if (
      (!variantJournal || variantEvidenceWrite || options.expected || options.expectedSha256) &&
      (!options.expected || !options.expectedSha256)
    ) {
      throw new WikiUpdateRequestError("Complete wiki snapshot and SHA256 required");
    }
    return transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`shenron:wiki:${table}:${id}`}))`,
      );
      const [before] = (await tx
        .select()
        .from(spec.table)
        .where(cond)
        .limit(1)
        .for("update")) as Row[];
      if (!before) throw new Error(`Ligne introuvable: ${table}#${id}`);
      if (options.expected)
        assertWikiUpdatePrecondition(before, options.expected, {
          complete: true,
          sha256: options.expectedSha256,
        });
      if (variantEvidenceWrite || variantImageWrite) assertVariantEvidenceUpdate(before, values);
      const [updated] = (await tx.update(spec.table).set(values).where(cond).returning()) as Row[];
      if (!updated) throw new Error(`Ligne introuvable: ${table}#${id}`);
      if (variantJournal) {
        const revisionId = await variantJournal(
          {
            table,
            id,
            action: options.revisionAction ?? "update",
            before,
            after: updated,
            actor: options.actor,
          },
          tx,
        );
        options.onRevision?.(revisionId);
      }
      return updated;
    });
  }
  if (isMediaCatalogTable(table)) {
    return transaction(async (tx) => {
      await lockMediaCatalog(tx, table);
      if (table === "media_editions") {
        const canonicalId = await resolveMediaEditionId(tx, Number(id));
        if (canonicalId !== Number(id)) throw new CatalogMediaConflictError([canonicalId]);
      }
      if (table === "media_volumes" && values.editionId !== undefined) {
        values.editionId = await resolveMediaEditionId(tx, Number(values.editionId));
      }
      const [before] = (await tx.select().from(spec.table).where(cond).limit(1)) as Row[];
      if (!before) throw new Error(`Ligne introuvable: ${table}#${id}`);
      if (options.expected) {
        assertWikiUpdatePrecondition(before, options.expected, {
          complete: Boolean(options.expectedSha256),
          sha256: options.expectedSha256,
        });
      } else if (options.expectedSha256) {
        throw new WikiUpdateRequestError("Complete wiki snapshot and SHA256 required");
      }
      // Existing duplicate notices still need metadata repairs without new identities.
      if (
        MEDIA_IDENTITY_FIELDS[table].some(
          (field) => field in values && values[field] !== before[field],
        )
      ) {
        await assertMediaCatalogUnique(tx, spec, { ...before, ...values }, id);
      }
      const [updated] = (await tx.update(spec.table).set(values).where(cond).returning()) as Row[];
      if (!updated) throw new Error(`Ligne introuvable: ${table}#${id}`);
      return updated;
    });
  }
  const updated = (await client.update(spec.table).set(values).where(cond).returning()) as Row[];
  // 0 ligne matchée = pk introuvable → ne JAMAIS renvoyer un faux succès
  // (l'admin croirait avoir sauvegardé). Le route handler mappe ça en 404.
  if (updated.length === 0) {
    throw new Error(`Ligne introuvable: ${table}#${id}`);
  }
  return updated[0];
}

export async function deleteWiki(
  table: string,
  id: string,
  actor: { id: string | null; name: string | null } | null = null,
): Promise<Row> {
  const spec = ensureVisibility(table);
  return db.transaction(async (tx) => {
    if (table === "media_editions") {
      await lockMediaCatalog(tx, table);
      const canonicalId = await resolveMediaEditionId(tx, Number(id));
      if (canonicalId !== Number(id)) throw new CatalogMediaConflictError([canonicalId]);
    }
    const [before] = (await tx
      .select()
      .from(spec.table)
      .where(pkCondition(spec, id))
      .limit(1)) as Row[];
    if (!before) throw new Error(`Ligne introuvable: ${table}#${id}`);
    const [after] = (await tx
      .update(spec.table)
      .set({ visible: false })
      .where(pkCondition(spec, id))
      .returning()) as Row[];
    await tx.insert(wikiRevisions).values({
      tableName: table,
      rowId: id,
      action: "visibility",
      label: String(before.name ?? before.title ?? id).slice(0, 200),
      before,
      after: after ?? { ...before, visible: false },
      editorId: actor?.id ?? null,
      editorName: actor?.name ?? null,
    });
    return after ?? { ...before, visible: false };
  });
}

// ── Visibilité éditoriale (colonne PG-only `visible`) ──────────────────────

/**
 * Tables « parcourables » du wiki portant la colonne `visible` (masquage du site
 * public sans suppression). Doit rester synchronisé avec `visibleCol` dans
 * `bot-schema.ts` et `scripts/add-wiki-visibility.ts`.
 */
const VISIBILITY_TABLES = new Set<string>([
  "db_characters",
  "db_planets",
  "db_transformations",
  "db_races",
  "db_techniques",
  "db_sagas",
  "db_arcs",
  "db_episodes",
  "db_movies",
  "db_games",
  "db_manga_volumes",
  "db_databooks",
  "db_manga_chapters",
  "media_works",
  "media_editions",
  "media_volumes",
]);

export function hasVisibility(table: string): boolean {
  return VISIBILITY_TABLES.has(table);
}

export interface VisibilityRow {
  id: string;
  label: string;
  image: string | null;
  /** Contexte secondaire (série, type…) pour désambiguïser. */
  extra: string | null;
  visible: boolean;
}

function ensureVisibility(table: string): ResolvedTable {
  const spec = getSpec(table);
  if (!spec) throw new Error(`Table inconnue: ${table}`);
  if (!VISIBILITY_TABLES.has(table)) throw new Error(`Table sans visibilité: ${table}`);
  return spec;
}

/** Liste id + libellé + image + état `visible` de toutes les lignes (pour le manager). */
export async function listWikiVisibility(
  table: string,
  { q }: { q?: string } = {},
): Promise<VisibilityRow[]> {
  const spec = ensureVisibility(table);
  const pkKey = pkCamelKeys(spec)[0];
  const labelKey = ["name", "title"].find((k) => spec.columns.includes(k)) ?? pkKey;
  const imageKey = ["image", "cover", "poster"].find((k) => spec.columns.includes(k)) ?? null;
  const extraKey = ["series", "type"].find((k) => spec.columns.includes(k)) ?? null;

  const sel: Record<string, unknown> = {
    id: spec.table[pkKey],
    label: spec.table[labelKey],
    visible: spec.table.visible,
  };
  if (imageKey) sel.image = spec.table[imageKey];
  if (extraKey) sel.extra = spec.table[extraKey];

  const term = (q ?? "").trim();
  const safeTerm = escapeLike(term);
  const where = term ? ilike(spec.table[labelKey], `%${safeTerm}%`) : undefined;

  const rows = (await db
    .select(sel as never)
    .from(spec.table)
    .where(where)
    .orderBy(asc(spec.table[labelKey]), asc(spec.table[pkKey]))
    .limit(5000)) as Array<{
    id: unknown;
    label: unknown;
    visible: unknown;
    image?: unknown;
    extra?: unknown;
  }>;
  return rows.map((r) => ({
    id: String(r.id),
    label: String(r.label ?? r.id),
    image: r.image != null ? String(r.image) : null,
    extra: r.extra != null ? String(r.extra) : null,
    // Défaut true : null/undefined (théorique) = visible.
    visible: r.visible !== false,
  }));
}

/** Bascule la visibilité d'une ligne. Lève si la pk est introuvable. */
export async function setWikiVisibility(
  table: string,
  id: string,
  visible: boolean,
): Promise<void> {
  const spec = ensureVisibility(table);
  const updated = (await db
    .update(spec.table)
    .set({ visible })
    .where(pkCondition(spec, id))
    .returning()) as Row[];
  if (updated.length === 0) throw new Error(`Ligne introuvable: ${table}#${id}`);
}

/** État de visibilité d'une ligne, tel que capturé AVANT une bascule de masse. */
export interface VisibilityState {
  id: string;
  visible: boolean;
}

/**
 * Bascule TOUTES les lignes d'une table (« tout afficher / tout masquer »).
 *
 * Renvoie l'état **d'avant** de chaque ligne, et pas seulement un compte : sans
 * lui, l'opération est irréversible. C'est exactement ce qui s'est produit en
 * production — 2 309 lignes (1 322 personnages, 825 techniques, 81
 * transformations, 62 planètes, 18 races) masquées d'un coup, sans trace dans
 * `wiki_revisions` et sans retour arrière possible, parce que cette fonction ne
 * rendait qu'un `number` et que le route handler répondait avant d'écrire
 * l'audit. L'appelant DOIT passer ce résultat à `recordBulkVisibilityRevision`.
 *
 * L'`UPDATE` reste volontairement sans `WHERE` (c'est la sémantique voulue) ;
 * c'est la capture préalable qui rend l'opération sûre.
 */
export async function setAllWikiVisibility(
  table: string,
  visible: boolean,
): Promise<{ updated: number; previous: VisibilityState[] }> {
  const spec = ensureVisibility(table);
  const pkCol = spec.table[pkCamelKeys(spec)[0]];

  // Capture AVANT bascule. Bornée : au-delà, on renonce à l'instantané plutôt
  // que d'écrire un jsonb démesuré (`db_manga_pages` ≈ 12 500 lignes).
  const before = (await db
    .select({ id: pkCol, visible: spec.table.visible })
    .from(spec.table)
    .limit(BULK_VISIBILITY_SNAPSHOT_CAP + 1)) as Array<{ id: unknown; visible: unknown }>;

  const previous: VisibilityState[] =
    before.length > BULK_VISIBILITY_SNAPSHOT_CAP
      ? []
      : before.map((r) => ({ id: String(r.id), visible: r.visible !== false }));

  const updated = (await db.update(spec.table).set({ visible }).returning({ id: pkCol })) as Row[];

  return { updated: updated.length, previous };
}

/**
 * Au-delà de ce nombre de lignes, l'instantané d'une bascule de masse n'est pas
 * conservé (le revert devient « tout remettre à l'état demandé », pas ligne à
 * ligne). Seule `db_manga_pages` dépasse ce seuil aujourd'hui.
 */
const BULK_VISIBILITY_SNAPSHOT_CAP = 20_000;

/** Réapplique un instantané de visibilité ligne à ligne (retour arrière). */
export async function restoreWikiVisibility(
  table: string,
  states: VisibilityState[],
): Promise<number> {
  const spec = ensureVisibility(table);
  // Deux `UPDATE … IN (…)` (un par valeur cible) plutôt qu'un par ligne : le
  // revert d'un masquage de 1 300 personnages ne doit pas faire 1 300 requêtes.
  let touched = 0;
  for (const want of [true, false]) {
    const ids = states.filter((s) => s.visible === want).map((s) => s.id);
    if (ids.length === 0) continue;
    const pkCol = spec.table[pkCamelKeys(spec)[0]];
    const rows = (await db
      .update(spec.table)
      .set({ visible: want })
      .where(inArray(pkCol, ids as never[]))
      .returning({ id: pkCol })) as Row[];
    touched += rows.length;
  }
  return touched;
}

// ── Vue d'ensemble CMS : complétude du contenu par entité ──────────────────

/** Entités « contenu » suivies dans le tableau de bord CMS (/admin/wiki). */
const CMS_ENTITY_TABLES = [
  "db_characters",
  "db_planets",
  "db_transformations",
  "db_races",
  "db_techniques",
  "db_sagas",
  "db_arcs",
  "db_episodes",
  "db_movies",
  "db_games",
  "db_manga_volumes",
  "db_databooks",
] as const;

export interface CmsEntityStat {
  table: string;
  /** Toutes les lignes, masquées comprises. */
  total: number;
  /** Lignes masquées du site public (visible = false). 0 si pas de colonne. */
  hidden: number;
  /** Lignes PUBLIQUES (`visible IS NOT FALSE`) sans image/cover/poster. */
  missingImage: number;
  /** Lignes PUBLIQUES sans texte (description, synopsis français…). */
  missingDesc: number;
  /** Lignes PUBLIQUES sans nom/titre japonais attendu. */
  missingJa: number;
  imageCol: string | null;
  descCol: string | null;
  jaCol: string | null;
  hasVisibility: boolean;
}

/** Spec + plan de vérification d'une table (cf. `wiki-gaps.ts`). */
function resolveGapPlan(table: string): { spec: ResolvedTable; plan: GapPlan } | null {
  const spec = getSpec(table);
  if (!spec) return null;
  return { spec, plan: planGaps(table, spec.columns, pkCamelKeys(spec)[0]) };
}

/**
 * Mesure complète d'une table en UNE requête d'agrégat : lignes, lignes
 * masquées, et manques — comptés sur les seules lignes publiques, les lignes
 * masquées incomplètes étant comptées à part. Jamais plafonné.
 */
async function measureTable(
  spec: ResolvedTable,
  plan: GapPlan,
): Promise<{ rows: number; hiddenRows: number; gaps: GapCounts }> {
  const t = spec.table;
  const pub = scopeSql(t, plan, "public");
  const hid = scopeSql(t, plan, "hidden");
  const any = anyGapSql(t, plan) ?? sql`false`;
  const kind = (k: GapKind) => countWhereSql(and(pub, gapKindSql(t, plan, k) ?? sql`false`));
  const [r] = await db
    .select({
      rows: countWhereSql(undefined),
      hiddenRows: countWhereSql(hid),
      total: countWhereSql(and(pub, any)),
      image: kind("image"),
      desc: kind("desc"),
      ja: kind("ja"),
      hidden: countWhereSql(and(hid, any)),
    })
    .from(t);
  if (!r) return { rows: 0, hiddenRows: 0, gaps: emptyGapCounts() };
  return {
    rows: r.rows,
    hiddenRows: r.hiddenRows,
    gaps: { total: r.total, image: r.image, desc: r.desc, ja: r.ja, hidden: r.hidden },
  };
}

/** Statistiques de complétude d'une entité (total, masquées, manques publics). */
async function tableStat(table: string): Promise<CmsEntityStat> {
  const resolved = resolveGapPlan(table);
  if (!resolved)
    return {
      table,
      total: 0,
      hidden: 0,
      missingImage: 0,
      missingDesc: 0,
      missingJa: 0,
      imageCol: null,
      descCol: null,
      jaCol: null,
      hasVisibility: false,
    };
  const { spec, plan } = resolved;
  const m = await measureTable(spec, plan);
  return {
    table,
    total: m.rows,
    hidden: m.hiddenRows,
    missingImage: m.gaps.image,
    missingDesc: m.gaps.desc,
    missingJa: m.gaps.ja,
    imageCol: plan.checks.image,
    descCol: plan.checks.desc,
    jaCol: plan.checks.ja,
    hasVisibility: plan.visibleKey !== null,
  };
}

/**
 * Vue d'ensemble CMS : complétude de chaque entité « contenu » (comptes réels
 * Postgres). Alimente le tableau de bord /admin/wiki (cartes de complétude,
 * signaux de contenu manquant). Une requête d'agrégat par entité.
 */
export async function getWikiCmsStats(): Promise<CmsEntityStat[]> {
  return Promise.all(CMS_ENTITY_TABLES.map((t) => tableStat(t)));
}

/**
 * Tables de la worklist /admin/wiki/todo : les entités du tableau de bord puis
 * les rubriques d'expansion (objets, lieux, dragons, doublage, versions).
 */
const WORKLIST_TABLES: readonly string[] = [...CMS_ENTITY_TABLES, ...WORKLIST_EXTRA_TABLES];

/** Plafond d'une table dépliée (« tout afficher ») : garde-fou, pas une pagination. */
const WORKLIST_EXPAND_LIMIT = 2000;

export interface IncompleteRow {
  table: string;
  id: string;
  label: string;
  /** Contexte de désambiguïsation (série, n°, catégorie), ou null. */
  context: string | null;
  /** Terme de recherche (slug, sinon libellé) pour `/admin/database/<table>?q=`. */
  searchTerm: string;
  image: string | null;
  missingImage: boolean;
  missingDesc: boolean;
  missingJa: boolean;
  /** Ligne masquée du site public (listée seulement à la demande). */
  hidden: boolean;
}

export interface IncompleteGroup {
  table: string;
  /** Colonne vérifiée par manque (null = non vérifié sur cette table). */
  checks: Record<GapKind, string | null>;
  jaExemptReason: string | null;
  jaScopeReason: string | null;
  note: string | null;
  /** Comptes réels, jamais plafonnés. */
  counts: GapCounts;
  /** Lignes publiques à compléter, plafonnées à `limit`. */
  rows: IncompleteRow[];
  /** Lignes masquées incomplètes, plafonnées — vides sauf `includeHidden`. */
  hiddenRows: IncompleteRow[];
  limit: number;
}

export interface IncompleteContent {
  groups: IncompleteGroup[];
  totals: GapCounts;
  perTable: number;
  includeHidden: boolean;
}

/** Contexte lisible d'une ligne : « DBZ_KAI_FINAL · n° 4 », « Arme »… */
function formatContext(plan: GapPlan, r: Record<string, unknown>): string | null {
  const parts = plan.contextKeys.flatMap((k) => {
    const v = r[`ctx_${k}`];
    if (isBlankValue(v)) return [];
    return [k === "numberInSeries" || k === "volumeNumber" ? `n° ${String(v)}` : String(v)];
  });
  return parts.length ? parts.join(" · ") : null;
}

/** Lignes incomplètes d'une portée (publique ou masquée), triées, plafonnées. */
async function listGapRows(
  spec: ResolvedTable,
  plan: GapPlan,
  scope: VisibilityScope,
  limit: number,
): Promise<IncompleteRow[]> {
  const t = spec.table;
  const any = anyGapSql(t, plan);
  if (!any || limit <= 0) return [];
  const flag = (k: GapKind) => gapKindSql(t, plan, k) ?? sql<boolean>`false`;
  const label = labelSql(t, plan);
  const sel: Record<string, unknown> = {
    id: t[plan.pkKey],
    label,
    missingImage: flag("image"),
    missingDesc: flag("desc"),
    missingJa: flag("ja"),
  };
  if (plan.checks.image) sel.image = t[plan.checks.image];
  if (plan.slugKey) sel.slug = t[plan.slugKey];
  if (plan.visibleKey) sel.visible = t[plan.visibleKey];
  for (const k of plan.contextKeys) sel[`ctx_${k}`] = t[k];
  const rows = (await db
    .select(sel as never)
    .from(t)
    .where(and(scopeSql(t, plan, scope), any))
    .orderBy(...plan.orderKeys.map((k) => asc(t[k])), asc(label), asc(t[plan.pkKey]))
    .limit(limit)) as Row[];
  return rows.map((r) => {
    const text = String(r.label ?? r.id);
    return {
      table: plan.table,
      id: String(r.id),
      label: text,
      context: formatContext(plan, r),
      searchTerm: plan.slugKey && !isBlankValue(r.slug) ? String(r.slug) : text,
      image: isBlankValue(r.image) ? null : String(r.image),
      missingImage: r.missingImage === true,
      missingDesc: r.missingDesc === true,
      missingJa: r.missingJa === true,
      hidden: !isPublicRow(plan, r),
    };
  });
}

/**
 * Worklist /admin/wiki/todo : fiches PUBLIQUES à compléter (image, texte,
 * japonais) par entité, avec leurs comptes réels. La liste est plafonnée à
 * `perTable` (sauf la table `expand`, dépliée), les comptes ne le sont jamais.
 * Les lignes masquées incomplètes sont toujours comptées à part, et listées
 * seulement si `includeHidden`.
 */
export async function listIncompleteContent({
  perTable = 60,
  includeHidden = false,
  expand = null,
}: {
  perTable?: number;
  includeHidden?: boolean;
  expand?: string | null;
} = {}): Promise<IncompleteContent> {
  const groups = await Promise.all(
    WORKLIST_TABLES.map(async (table): Promise<IncompleteGroup | null> => {
      const resolved = resolveGapPlan(table);
      if (!resolved) return null;
      const { spec, plan } = resolved;
      if (!anyGapSql(spec.table, plan)) return null;
      const limit = expand === table ? WORKLIST_EXPAND_LIMIT : perTable;
      const [measure, rows, hiddenRows] = await Promise.all([
        measureTable(spec, plan),
        listGapRows(spec, plan, "public", limit),
        includeHidden ? listGapRows(spec, plan, "hidden", limit) : Promise.resolve([]),
      ]);
      const counts = measure.gaps;
      if (counts.total === 0 && counts.hidden === 0) return null;
      return {
        table,
        checks: plan.checks,
        jaExemptReason: plan.jaExemptReason,
        jaScopeReason: plan.jaScopeReason,
        note: plan.note,
        counts,
        rows,
        hiddenRows,
        limit,
      };
    }),
  );
  const kept = groups.filter((g): g is IncompleteGroup => g !== null);
  return {
    groups: kept,
    totals: sumGapCounts(kept.map((g) => g.counts)),
    perTable,
    includeHidden,
  };
}

// ── Sections de contenu par entité (bot.db_wiki_sections) ──────────────────

export interface WikiSectionRow {
  id: number;
  entityType: string;
  entityId: number;
  key: string;
  label: string;
  accent: string | null;
  body: string | null;
  groupLabel: string | null;
  links: botSchema.WikiSectionLink[] | null;
  sortOrder: number;
  visible: boolean;
}

/**
 * Sections d'une entité pour l'ADMIN : toutes (masquées comprises), triées par
 * `sort_order` puis `id`. La lecture publique (`getWikiSections` de shenron.ts)
 * filtre en plus `visible = true`.
 */
export async function listWikiSectionsForEntity(
  entityType: string,
  entityId: number,
): Promise<WikiSectionRow[]> {
  const t = botSchema.botWikiSections;
  const rows = (await db
    .select()
    .from(t)
    .where(and(eq(t.entityType, entityType), eq(t.entityId, entityId)))
    .orderBy(asc(t.sortOrder), asc(t.id))) as WikiSectionRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    entityType: r.entityType,
    entityId: Number(r.entityId),
    key: r.key,
    label: r.label,
    accent: r.accent ?? null,
    body: r.body ?? null,
    groupLabel: r.groupLabel ?? null,
    links: Array.isArray(r.links) ? r.links : null,
    sortOrder: Number(r.sortOrder ?? 0),
    visible: r.visible !== false,
  }));
}

// ── API snake_case (Server Components db-universe) ─────────────────────────

/**
 * Variante snake_case de `listWiki` pour les pages db-universe (qui consomment
 * du snake_case, comme l'ancien `adminFetch` qui passait par `toSnake`).
 */
export async function listWikiSnake(
  table: string,
  { limit = 500, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<Row[]> {
  const { rows } = await listWiki(table, { limit, offset });
  return rows.map(toSnakeRow);
}

// ── Lectures dédiées db-universe (snake_case, miroir des endpoints publics) ──

/** Épisodes d'une série, triés par numéro (snake_case). */
export async function listEpisodesBySeries(series: string, limit = 500): Promise<Row[]> {
  const t = botSchema.botEpisodes;
  const rows = (await db
    .select()
    .from(t)
    .where(eq(t.series, series))
    .orderBy(asc(t.numberInSeries))
    .limit(limit)) as Row[];
  return rows.map(toSnakeRow);
}

/** Total d'épisodes d'une série (pour l'affichage paginé). */
export async function countEpisodesBySeries(series: string): Promise<number> {
  const t = botSchema.botEpisodes;
  const [{ value = 0 } = { value: 0 }] = await db
    .select({ value: count() })
    .from(t)
    .where(eq(t.series, series));
  return Number(value);
}

/** Sources + jointure licence (license_name, license_url), snake_case. */
export async function listSourcesWithLicense(): Promise<Row[]> {
  const s = botSchema.botSources;
  const l = botSchema.botLicenses;
  const rows = await db
    .select({
      id: s.id,
      name: s.name,
      url: s.url,
      licenseKey: s.licenseKey,
      attributionTemplate: s.attributionTemplate,
      licenseName: l.name,
      licenseUrl: l.url,
    })
    .from(s)
    .leftJoin(l, eq(s.licenseKey, l.key))
    .orderBy(asc(s.id));
  return rows.map((r) => toSnakeRow(r as Row));
}

/**
 * Galerie des médias — mesures et filtres.
 *
 * Les « buckets » sont le premier segment du chemin (`characters/…`, `toei/…`).
 * Ils sont **mesurés en base**, jamais listés en dur : une liste écrite à la main
 * rend invisibles les médias d'un bucket qu'on a oublié d'y inscrire — c'était le
 * cas des 4 images uploadées sous `./assets/wiki/assets/`, introuvables dans
 * l'interface alors qu'elles existaient en base.
 */
export type AssetBucket = { bucket: string; total: number };

export async function listAssetBuckets(): Promise<AssetBucket[]> {
  const t = botSchema.botAssets;
  const segment = sql<string>`split_part(${t.path}, '/', 1)`;
  const rows = await db
    .select({ bucket: segment, total: count() })
    .from(t)
    .groupBy(segment)
    .orderBy(desc(count()));
  return rows.map((r) => ({ bucket: r.bucket, total: Number(r.total) }));
}

/** Ce que la galerie annonce en tête : de quoi juger l'état du corpus d'un coup d'œil. */
export type AssetStats = {
  total: number;
  octets: number;
  orphelins: number;
  /** Fichiers EN TROP (un groupe de 2 en compte 1), à ne pas confondre avec les
   *  lignes que la vue « doublons » affiche : elle montre les groupes entiers. */
  doublonsEnTrop: number;
};

export async function getAssetStats(): Promise<AssetStats> {
  const t = botSchema.botAssets;
  const [global] = await db
    .select({
      total: count(),
      octets: sql<string>`coalesce(sum(${t.bytes}), 0)`,
      orphelins: sql<string>`count(*) filter (where ${t.entityType} is null)`,
    })
    .from(t);
  // Un sha256 partagé = le même fichier stocké deux fois : 64 groupes mesurés le 2026-09-03.
  const [dup] = await db.select({ enTrop: sql<string>`coalesce(sum(n) - count(*), 0)` }).from(
    db
      .select({ n: count().as("n") })
      .from(t)
      .where(sql`${t.sha256} is not null`)
      .groupBy(t.sha256)
      .having(sql`count(*) > 1`)
      .as("groupes"),
  );
  return {
    total: Number(global?.total ?? 0),
    octets: Number(global?.octets ?? 0),
    orphelins: Number(global?.orphelins ?? 0),
    doublonsEnTrop: Number(dup?.enTrop ?? 0),
  };
}

/**
 * Ordres de tri de la galerie.
 *
 * Le défaut est `naturel` et non l'ordre d'insertion : un tri lexicographique place
 * `0-1-10` entre `0-1-1` et `0-1-2`, donc les 42 tomes d'une édition arrivent
 * mélangés. On compare donc les nombres comme des nombres, en les rembourrant à la
 * volée (mesuré : 28 ms sur 1 078 médias, pour une page d'admin).
 */
export type TriAssets = "naturel" | "recent" | "lourd" | "petit" | "rattachement";

export const TRIS_ASSETS: { cle: TriAssets; libelle: string }[] = [
  { cle: "naturel", libelle: "Ordre naturel (chemin)" },
  { cle: "recent", libelle: "Ajout le plus récent" },
  { cle: "lourd", libelle: "Les plus lourds" },
  { cle: "petit", libelle: "Les plus petits (px)" },
  { cle: "rattachement", libelle: "Non rattachés d'abord" },
];

/** Clé de tri naturelle : chaque nombre du chemin est comparé comme un nombre. */
const cleNaturelle = (colonne: SQL | Column) => sql`(
	select string_agg(
		case when morceau ~ '^[0-9]+$' then lpad(morceau, 12, '0') else morceau end, ''
	)
	from regexp_split_to_table(${colonne}, '(?<=[^0-9])(?=[0-9])|(?<=[0-9])(?=[^0-9])') as morceau
)`;

export type AssetFiltres = {
  bucket?: string;
  recherche?: string;
  licence?: string;
  /** `orphelins` : sans entité rattachée. `doublons` : sha256 partagé avec une autre ligne. */
  vue?: "tous" | "orphelins" | "doublons";
  tri?: TriAssets;
  page?: number;
  parPage?: number;
};

function ordreDe(tri: TriAssets, t: typeof botSchema.botAssets): SQL[] {
  switch (tri) {
    case "recent":
      return [desc(t.id)];
    // `nulls last` partout : une colonne vide ne doit pas occuper la première page.
    case "lourd":
      return [sql`${t.bytes} desc nulls last`];
    case "petit":
      return [sql`${t.width} * ${t.height} asc nulls last`];
    case "rattachement":
      return [sql`${t.entityType} nulls first`, cleNaturelle(t.path)];
    default:
      return [cleNaturelle(t.path)];
  }
}

/** Une page de la galerie + le total réel correspondant aux filtres (pour la pagination). */
export async function listAssets(
  filtres: AssetFiltres = {},
): Promise<{ lignes: Row[]; total: number }> {
  const t = botSchema.botAssets;
  const parPage = Math.min(200, Math.max(1, filtres.parPage ?? 60));
  const page = Math.max(1, filtres.page ?? 1);

  const conditions: SQL[] = [];
  if (filtres.bucket) conditions.push(sql`split_part(${t.path}, '/', 1) = ${filtres.bucket}`);
  if (filtres.licence) conditions.push(eq(t.licenseKey, filtres.licence));
  if (filtres.vue === "orphelins") conditions.push(isNull(t.entityType));
  if (filtres.vue === "doublons")
    conditions.push(
      sql`${t.sha256} is not null and ${t.sha256} in (
				select sha256 from bot.db_assets where sha256 is not null group by 1 having count(*) > 1
			)`,
    );
  if (filtres.recherche?.trim()) {
    const motif = `%${escapeLike(filtres.recherche.trim())}%`;
    const ou = or(
      ilike(t.path, motif),
      ilike(t.role, motif),
      ilike(t.attribution, motif),
      ilike(t.sourceId, motif),
    );
    if (ou) conditions.push(ou);
  }
  const filtre = conditions.length ? and(...conditions) : undefined;

  const lignes = (await db
    .select({
      id: t.id,
      path: t.path,
      sourceId: t.sourceId,
      attribution: t.attribution,
      licenseKey: t.licenseKey,
      role: t.role,
      bytes: t.bytes,
      mimeType: t.mimeType,
      width: t.width,
      height: t.height,
      entityType: t.entityType,
      entityId: t.entityId,
      sha256: t.sha256,
    })
    .from(t)
    .where(filtre)
    .orderBy(...ordreDe(filtres.tri ?? "naturel", t))
    .limit(parPage)
    .offset((page - 1) * parPage)) as Row[];

  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(t).where(filtre);

  return { lignes: lignes.map(toSnakeRow), total: Number(total) };
}

/** Les licences réellement présentes, pour ne proposer que des filtres qui rendent quelque chose. */
export async function listAssetLicences(): Promise<{ licence: string; total: number }[]> {
  const t = botSchema.botAssets;
  const rows = await db
    .select({ licence: t.licenseKey, total: count() })
    .from(t)
    .groupBy(t.licenseKey)
    .orderBy(desc(count()));
  return rows
    .filter((r) => r.licence)
    .map((r) => ({ licence: r.licence as string, total: Number(r.total) }));
}

/**
 * Recherche d'entités pour RATTACHER un média à une fiche depuis la galerie.
 *
 * On ne charge jamais la liste entière côté client : `db_characters` compte 1 307
 * lignes, et embarquer leurs noms dans la charge RSC de la page d'admin coûterait
 * plus cher que la galerie elle-même (le wiki a déjà payé cette leçon avec les
 * 12 362 chemins de `/wiki/manga`). On interroge à la frappe, 20 résultats maxi.
 */
const ENTITES_RATTACHABLES: Record<string, { table: string; colonne: "name" | "title" }> = {
  character: { table: "db_characters", colonne: "name" },
  planet: { table: "db_planets", colonne: "name" },
  saga: { table: "db_sagas", colonne: "name" },
  transformation: { table: "db_transformations", colonne: "name" },
  technique: { table: "db_techniques", colonne: "name" },
  race: { table: "db_races", colonne: "name" },
  movie: { table: "db_movies", colonne: "title" },
  episode: { table: "db_episodes", colonne: "title" },
  game: { table: "db_games", colonne: "title" },
  databook: { table: "db_databooks", colonne: "title" },
};

export const TYPES_RATTACHABLES = Object.keys(ENTITES_RATTACHABLES);

export async function chercheEntites(
  type: string,
  recherche: string,
): Promise<{ id: number; nom: string }[]> {
  const spec = ENTITES_RATTACHABLES[type];
  if (!spec) return [];
  const motif = `%${recherche.trim()}%`;
  const rows = (await db.execute(
    sql`select id, ${sql.raw(spec.colonne)} as nom from bot.${sql.raw(spec.table)}
		    where ${sql.raw(spec.colonne)} ilike ${motif} and visible
		    order by length(${sql.raw(spec.colonne)}) asc, id asc limit 20`,
  )) as unknown as { id: number | string; nom: string }[];
  // postgres-js rend les bigint en CHAÎNES : sans Number(), l'id repart en texte
  // dans le PATCH et la colonne entity_id (bigint) refuse l'écriture.
  return rows.map((r) => ({ id: Number(r.id), nom: r.nom }));
}
