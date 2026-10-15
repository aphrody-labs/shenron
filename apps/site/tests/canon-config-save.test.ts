/**
 * Enregistrement de la doctrine et citations ingérées (`canon_references`).
 *
 * Défaut corrigé : à chaque enregistrement, l'id des citations était
 * re-slugifié (`_` → `-`, coupure à 60), et toute ligne absente du document
 * passait en `visible = false` sans révision — 78 citations en production
 * (`manga-vol-dbz_anime_comics-*`, `db_movies`, `sdbh_*`…), plus toute citation
 * ingérée entre la lecture et l'enregistrement.
 *
 * La suite traverse le vrai `saveCanonConfig` sur une base en mémoire qui
 * interprète les conditions Drizzle rendues en SQL ; aucune base réelle.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTableColumns, getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { CanonReference } from "../src/lib/canon-engine";

type Ligne = Record<string, unknown>;

const tables = new Map<string, Ligne[]>();
let unavailable = false;
let raceSingleton = false;
const dialect = new PgDialect();

function colonnes(table: Table): Map<string, string> {
  return new Map(Object.entries(getTableColumns(table)).map(([cle, col]) => [col.name, cle]));
}

/** Valeur comparable (les dates arrivent en ISO depuis le pilote simulé). */
function comparable(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return Date.parse(v);
  return v;
}

/** Interprète `"t"."c" = $n`, `"t"."c" in ($n, …)` et leurs conjonctions `and`. */
function predicat(table: Table, condition: SQL | undefined): (l: Ligne) => boolean {
  if (!condition) return () => true;
  const { sql, params } = dialect.sqlToQuery(condition);
  const noms = colonnes(table);
  const termes = sql.replace(/^\((.*)\)$/, "$1").split(" and ");
  const tests = termes.map((terme) => {
    const m = terme.match(/^"\w+"\."(\w+)" (=|in) (.+)$/);
    if (!m) throw new Error(`condition non simulée : ${terme}`);
    const cle = noms.get(m[1]!)!;
    const valeurs = new Set(
      [...m[3]!.matchAll(/\$(\d+)/g)].map((x) => comparable(params[Number(x[1]) - 1])),
    );
    return (l: Ligne) => valeurs.has(comparable(l[cle]));
  });
  return (l) => tests.every((t) => t(l));
}

function lignes(table: Table): Ligne[] {
  const nom = getTableName(table);
  if (!tables.has(nom)) tables.set(nom, []);
  return tables.get(nom)!;
}

function projeter(l: Ligne, champs?: Record<string, { name: string }>): Ligne {
  if (!champs) return { ...l };
  return Object.fromEntries(Object.keys(champs).map((k) => [k, l[k]]));
}

/**
 * Un constructeur Drizzle simulé s'exécute dès qu'il est terminé (`where`,
 * `values`) : le code testé l'attend ou l'enchaîne aussitôt.
 */
function promesse<T, E extends object>(valeur: T, extra: E): Promise<T> & E {
  return Object.assign(Promise.resolve(valeur), extra);
}

const fauxDb = {
  select: (champs?: Record<string, { name: string }>) => {
    if (unavailable) throw new Error("database unavailable");
    return {
      from: (table: Table) => ({
        where: (condition?: SQL) => {
          const lues = lignes(table)
            .filter(predicat(table, condition))
            .map((l) => projeter(l, champs));
          return promesse(lues, { limit: async (n: number) => lues.slice(0, n) });
        },
      }),
    };
  },
  update: (table: Table) => ({
    set: (valeurs: Ligne) => ({
      where: (condition?: SQL) => {
        if (raceSingleton && getTableName(table) === "CanonConfig") {
          raceSingleton = false;
          lignes(table)[0]!.updatedAt = new Date("2099-01-01T00:00:00Z");
        }
        const touchees = lignes(table).filter(predicat(table, condition));
        for (const l of touchees) Object.assign(l, valeurs);
        return promesse(touchees, {
          returning: async (champs?: Record<string, { name: string }>) =>
            touchees.map((l) => projeter(l, champs)),
        });
      },
    }),
  }),
  insert: (table: Table) => ({
    values: (valeurs: Ligne) => {
      const existante =
        valeurs.id === undefined ? undefined : lignes(table).find((l) => l.id === valeurs.id);
      if (!existante) lignes(table).push({ ...valeurs });
      return promesse([valeurs], {
        onConflictDoNothing: () => ({ returning: async () => (existante ? [] : [valeurs]) }),
        returning: async () => [valeurs],
      });
    },
  }),
  transaction,
};

/** Une transaction simulée rejoue le même faux client. */
async function transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
  const before = structuredClone(tables);
  try {
    return await fn(fauxDb);
  } catch (error) {
    tables.clear();
    for (const [key, values] of before) tables.set(key, values);
    throw error;
  }
}

const AUTOMATISATION = { id: "api-token", name: "Jeton API (automatisation)" };

mock.module("server-only", () => ({}));
mock.module("@/lib/db", () => ({ db: fauxDb }));
mock.module("@/lib/session", () => ({
  TOKEN_ADMIN_SESSION_ID: "token-admin",
  API_TOKEN_ACTOR: AUTOMATISATION,
  getCurrentUser: async () => ({
    sessionUserId: "token-admin",
    discordId: "owner-discord",
    user: { id: "user-owner", username: "Propriétaire", roleAdmin: true },
    automation: AUTOMATISATION,
  }),
  revisionActorOf: () => AUTOMATISATION,
}));

const {
  saveCanonConfig: saveVersionedCanonConfig,
  getCanonReferences,
  getCanonConfig,
  getCanonConfigSnapshot,
} = await import("../src/lib/canon-config");
const { DEFAULT_CANON_CONFIG } = await import("../src/lib/canon-engine");

async function saveCanonConfig(patch: unknown, by: string) {
  const { expected } = await getCanonConfigSnapshot();
  return (await saveVersionedCanonConfig(patch, by, expected)).config;
}

const T0 = new Date("2026-10-01T08:00:00.000Z");

function citation(id: string, provenance: string, extra: Ligne = {}): Ligne {
  return {
    id,
    subject: `Sujet ${id}`,
    keywords: ["cell"],
    text: `Texte ${id}`,
    textFr: null,
    source: "Daizenshuu 2",
    year: 1995,
    document: "document",
    lang: "ja",
    provenance,
    href: null,
    hash: "h",
    visible: true,
    seenAt: T0,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

/** Les identifiants que l'ancien enregistrement réécrivait. */
const IDS_FRAGILES = [
  "manga-vol-dbz_anime_comics-3",
  "manga-vol-db_movies-12",
  "manga-vol-sdbh_big_bang_mission-1",
  "seg-noms-familles-freeza-cold-chilled-et-la-lignee-des-demons-du-froid-selon-toriyama",
];

function corpus(): Ligne[] {
  return tables.get("canon_references") ?? [];
}

function ligne(id: string): Ligne {
  return (tables.get("canon_references") ?? []).find((l) => l.id === id)!;
}

function revisions(): Ligne[] {
  return (tables.get("wiki_revisions") ?? []).filter((row) => row.tableName === "canon_references");
}

/** Ce que l'éditeur lit (GET) : la doctrine du dépôt et le corpus visible. */
async function lecture(): Promise<CanonReference[]> {
  return structuredClone(await getCanonReferences());
}

beforeEach(() => {
  tables.clear();
  unavailable = false;
  raceSingleton = false;
  tables.set(
    "canon_references",
    [
      ...IDS_FRAGILES.map((id) => citation(id, id.startsWith("seg") ? "aphrody" : "manga")),
      citation("planche-12-34", "databooks", { textFr: "Traduction relue" }),
    ].map((l) => Object.assign({}, l)),
  );
  tables.set("CanonConfig", []);
  tables.set("wiki_revisions", []);
});

describe("saveCanonConfig et citations ingérées", () => {
  test("renvoyer le corpus lu ne masque rien et ne réécrit aucun identifiant", async () => {
    const lu = await lecture();
    const config = await saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references: lu }, "x");
    for (const id of [...IDS_FRAGILES, "planche-12-34"]) expect(ligne(id).visible).toBe(true);
    expect(config.references.map((r) => r.id).toSorted()).toEqual(
      [...IDS_FRAGILES, "planche-12-34"].toSorted(),
    );
    expect(revisions()).toHaveLength(0);
  });

  test("une citation ingérée entre la lecture et l'enregistrement n'est jamais touchée", async () => {
    const lu = await lecture();
    tables.get("canon_references")!.push(citation("planche-99-1", "databooks"));
    await saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references: lu }, "x");
    expect(ligne("planche-99-1").visible).toBe(true);
  });

  test("une citation absente du document n'est pas une demande de retrait", async () => {
    await saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references: [] }, "x");
    expect(corpus().every((l) => l.visible === true)).toBe(true);
    expect(revisions()).toHaveLength(0);
  });

  test("le retrait explicite masque la ligne et laisse une révision signée", async () => {
    const lu = await lecture();
    const cible = IDS_FRAGILES[0]!;
    const references = lu.map((r) =>
      r.id === cible ? Object.assign({}, r, { visible: false }) : r,
    );
    const config = await saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references }, "owner-discord");
    expect(ligne(cible).visible).toBe(false);
    expect(config.references.some((r) => r.id === cible)).toBe(false);
    expect(revisions()).toHaveLength(1);
    expect(revisions()[0]).toMatchObject({
      tableName: "canon_references",
      rowId: cible,
      action: "visibility",
      before: { visible: true },
      after: { visible: false },
      editorId: "api-token",
      editorName: "Jeton API (automatisation)",
    });
    expect(tables.get("CanonConfig")![0]!.updatedBy).toBe("api-token");
  });

  test("un retrait sur une version périmée est refusé", async () => {
    const lu = await lecture();
    // L'ingestion réécrit la ligne après la lecture de l'éditeur.
    Object.assign(ligne("planche-12-34"), { updatedAt: new Date("2026-10-01T08:15:00.000Z") });
    const references = lu.map((r) =>
      r.id === "planche-12-34" ? Object.assign({}, r, { visible: false }) : r,
    );
    await expect(
      saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references }, "x"),
    ).rejects.toMatchObject({ status: 409 });
    expect(ligne("planche-12-34").visible).toBe(true);
    expect(revisions()).toHaveLength(0);
  });

  test("une traduction n'écrase pas une ligne réécrite depuis la lecture", async () => {
    const lu = await lecture();
    Object.assign(ligne("planche-12-34"), {
      textFr: "Traduction réingérée",
      updatedAt: new Date("2026-10-01T08:15:00.000Z"),
    });
    const references = lu.map((r) =>
      r.id === "planche-12-34" ? Object.assign({}, r, { textFr: "Retouche de l'éditeur" }) : r,
    );
    await expect(
      saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references }, "x"),
    ).rejects.toMatchObject({ status: 409 });
    expect(ligne("planche-12-34").textFr).toBe("Traduction réingérée");
  });

  test("une traduction sur la version lue s'applique et se trace", async () => {
    const lu = await lecture();
    const references = lu.map((r) =>
      r.id === "planche-12-34" ? Object.assign({}, r, { textFr: "Retouche de l'éditeur" }) : r,
    );
    await saveCanonConfig({ ...DEFAULT_CANON_CONFIG, references }, "x");
    expect(ligne("planche-12-34").textFr).toBe("Retouche de l'éditeur");
    expect(ligne("planche-12-34").visible).toBe(true);
    expect(revisions()[0]).toMatchObject({
      action: "update",
      before: { textFr: "Traduction relue", visible: true },
      after: { textFr: "Retouche de l'éditeur", visible: true },
    });
  });
});

describe("getCanonConfig preserves editorial choices", () => {
  test("a saved empty entry and heuristic list stays empty and disabled scaling stays disabled", async () => {
    const saved = {
      ...structuredClone(DEFAULT_CANON_CONFIG),
      entries: [],
      heuristics: [],
      powerScaling: { ...DEFAULT_CANON_CONFIG.powerScaling, enabled: false },
    };
    await saveCanonConfig(saved, "x");
    const read = await getCanonConfig();
    expect(read.entries).toEqual([]);
    expect(read.heuristics).toEqual([]);
    expect(read.powerScaling.enabled).toBe(false);
    expect(read.references).toHaveLength(corpus().length);
  });
  test("a missing singleton still uses repository defaults", async () => {
    const read = await getCanonConfig();
    expect(read.entries).toEqual(DEFAULT_CANON_CONFIG.entries);
    expect(read.heuristics).toEqual(DEFAULT_CANON_CONFIG.heuristics);
    expect(read.powerScaling).toEqual(DEFAULT_CANON_CONFIG.powerScaling);
  });
});

describe("strict canon snapshots and atomic saves", () => {
  test("admin failure throws while public reads keep the fallback", async () => {
    unavailable = true;
    await expect(getCanonConfigSnapshot()).rejects.toThrow("database unavailable");
    expect(await getCanonConfig()).toEqual(DEFAULT_CANON_CONFIG);
    expect(await getCanonReferences()).toEqual([]);
  });
  test("missing precondition never writes", async () => {
    await expect(
      saveVersionedCanonConfig(DEFAULT_CANON_CONFIG, "x", undefined),
    ).rejects.toMatchObject({ status: 428 });
    expect(tables.get("CanonConfig")).toEqual([]);
  });
  test("a stale absent singleton cannot replace the first writer", async () => {
    const { expected } = await getCanonConfigSnapshot();
    const first = await saveVersionedCanonConfig(
      { ...DEFAULT_CANON_CONFIG, entries: [] },
      "x",
      expected,
    );
    expect(first.expected).not.toBe(expected);
    await expect(
      saveVersionedCanonConfig(DEFAULT_CANON_CONFIG, "y", expected),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getCanonConfigSnapshot()).config.entries).toEqual([]);
  });
  test("compare and swap detects a write between read and update", async () => {
    await saveCanonConfig(DEFAULT_CANON_CONFIG, "x");
    const before = await getCanonConfigSnapshot();
    raceSingleton = true;
    await expect(
      saveVersionedCanonConfig({ ...before.config, entries: [] }, "x", before.expected),
    ).rejects.toMatchObject({ status: 409 });
  });
  test("one stale reference rolls back doctrine and earlier reference revisions", async () => {
    const before = await getCanonConfigSnapshot();
    const references = before.config.references.map((r) => ({ ...r, visible: false }));
    ligne("planche-12-34").updatedAt = new Date("2026-10-02T00:00:00Z");
    await expect(
      saveVersionedCanonConfig({ ...before.config, entries: [], references }, "x", before.expected),
    ).rejects.toMatchObject({ status: 409 });
    expect(tables.get("CanonConfig")).toEqual([]);
    expect(corpus().every((r) => r.visible)).toBe(true);
    expect(revisions()).toEqual([]);
  });
});

test("snapshot includes data even if an external writer preserves the timestamp", async () => {
  await saveCanonConfig(DEFAULT_CANON_CONFIG, "x");
  const before = await getCanonConfigSnapshot();
  tables.get("CanonConfig")![0]!.data = { ...DEFAULT_CANON_CONFIG, entries: [] };
  await expect(saveVersionedCanonConfig(before.config, "x", before.expected)).rejects.toMatchObject(
    { status: 409 },
  );
  expect((await getCanonConfigSnapshot()).config.entries).toEqual([]);
});

test("doctrine changes have a signed reversible revision in the same transaction", async () => {
  const snapshot = await getCanonConfigSnapshot();
  await saveVersionedCanonConfig({ ...snapshot.config, entries: [] }, "token-admin", snapshot.expected);
  const history = (tables.get("wiki_revisions") ?? []).filter(
    (row) => row.tableName === "CanonConfig",
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    rowId: "default",
    action: "update",
    before: null,
    editorId: "api-token",
    editorName: "Jeton API (automatisation)",
  });
  expect((history[0]!.after as { entries: unknown[] }).entries).toEqual([]);
  const unchanged = await getCanonConfigSnapshot();
  await saveVersionedCanonConfig(unchanged.config, "token-admin", unchanged.expected);
  expect(
    (tables.get("wiki_revisions") ?? []).filter((row) => row.tableName === "CanonConfig"),
  ).toHaveLength(1);
});
