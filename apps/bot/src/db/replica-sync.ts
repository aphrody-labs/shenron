// SPDX-License-Identifier: Apache-2.0
/**
 * Reverse-sync PostgreSQL `bot.*` → réplica SQLite du bot (wiki éditorial).
 *
 * PostgreSQL est la source éditoriale ; le SQLite du bot (`DATABASE_PATH`) en est
 * le miroir de lecture. Le point d'entrée est `scripts/sync-neon-to-sqlite.ts`
 * (timer systemd de 15 min) ; ce module porte la logique, testable sans
 * PostgreSQL grâce à l'interface {@link ReplicaSource}.
 *
 * Déroulé : plan sur le schéma que le réplica aura après `ensureWikiReplicaSchema`
 * puis `ensureWikiVisibility` (copie en mémoire) ; lecture de chaque table dans UN
 * instantané PostgreSQL (REPEATABLE READ, lecture seule), limitée à l'intersection
 * des colonnes des deux côtés, et conversion des valeurs ; alors seulement, les deux
 * garanties sur le réplica puis, table par table, remplacement complet (DELETE puis
 * INSERT en lots) dans une transaction SQLite courte (BEGIN IMMEDIATE). Un échec de
 * lecture PostgreSQL n'écrit donc rien.
 * Les lignes masquées (`visible = false`) descendent avec `visible = 0`. Une table
 * dont le contenu est déjà identique n'est pas réécrite. Une table en échec est
 * annulée (rollback) sans toucher aux autres ; le rapport la marque `failed`.
 *
 * Écarts de contraintes (PostgreSQL `bot.*` est plus permissif que le réplica),
 * traités sans bloquer la table et comptés dans le rapport : un NULL dans une
 * colonne NOT NULL côté SQLite prend le défaut SQLite, sinon 0 ou '' selon
 * l'affinité (`nullsReplaced`) ; une ligne qui violerait un index unique du réplica
 * est écartée, la ligne visible puis le plus petit `id` étant conservés
 * (`duplicatesDropped`). Une table que PostgreSQL renverrait vide n'est vidée
 * qu'avec `allowEmpty`.
 *
 * Aucun index dérivé n'est reconstruit ici : `db_search` (FTS5 de la migration
 * 0008) n'a aucun écrivain, et l'index RAG `rag_chunks` se reconstruit hors
 * ligne par copie (`rag-build` puis `swap-rag-tables`), jamais sur la base vivante.
 */
import { Database } from "bun:sqlite";
import type { SQL } from "bun";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable, type SQLiteColumn } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import {
  ensureWikiReplicaSchema,
  ensureWikiVisibility,
  WIKI_VISIBILITY_TABLES,
} from "./wiki-visibility";

/** Schéma PostgreSQL de la source éditoriale. */
export const SOURCE_SCHEMA = "bot";
/** Attente maximale du verrou d'écriture SQLite (le bot écrit en continu). */
export const REPLICA_BUSY_TIMEOUT_MS = 15_000;
/** Lignes par INSERT multi-lignes (borné aussi par le nombre de paramètres). */
export const INSERT_BATCH_ROWS = 500;
/** SQLITE_MAX_VARIABLE_NUMBER par défaut depuis SQLite 3.32. */
const SQLITE_MAX_VARIABLES = 32_766;

const PG_TIMESTAMP_TYPES = new Set([
  "timestamp with time zone",
  "timestamp without time zone",
  "date",
]);
const PG_JSON_TYPES = new Set(["json", "jsonb", "ARRAY"]);

// ── Types ───────────────────────────────────────────────────────────────────

/** Colonne PostgreSQL (`information_schema.columns`). */
export interface SourceColumn {
  name: string;
  /** `data_type` d'information_schema (`boolean`, `jsonb`, `ARRAY`, `timestamp with time zone`…). */
  dataType: string;
}

/** Colonne du réplica (`pragma_table_info`). */
export interface ReplicaColumn {
  name: string;
  /** Type déclaré (détermine l'affinité SQLite). */
  type: string;
  notNull: boolean;
  /** Expression SQL du défaut, telle que `pragma_table_info.dflt_value`. */
  defaultSql: string | null;
}

export type SourceRow = Record<string, unknown>;
export type SqliteValue = string | number | bigint | Uint8Array | null;

/** Lecture d'une source éditoriale, à l'intérieur d'un instantané. */
export interface ReplicaReader {
  /** Colonnes de chaque table demandée présente dans la source (table absente : pas d'entrée). */
  columns(tables: readonly string[]): Promise<Map<string, SourceColumn[]>>;
  /**
   * Lignes d'une table, limitées aux colonnes données. Dates : `Date` ou epoch en
   * millisecondes ; json/jsonb/tableaux : texte JSON ou valeur décodée.
   */
  rows(table: string, columns: readonly SourceColumn[]): Promise<SourceRow[]>;
}

/** Source éditoriale (PostgreSQL en production, simulée dans les tests). */
export interface ReplicaSource {
  /** Exécute `read` dans un instantané cohérent, en lecture seule. */
  snapshot<T>(read: (reader: ReplicaReader) => Promise<T>): Promise<T>;
}

/** Représentation SQLite attendue d'une date (schéma Drizzle du bot). */
export type TimestampEncoding = "seconds" | "milliseconds" | "iso";
export type TimestampTargets = ReadonlyMap<string, ReadonlyMap<string, TimestampEncoding>>;

/** Plan d'une colonne copiée. */
export interface ColumnPlan {
  name: string;
  pgType: string;
  timestamp: TimestampEncoding;
  notNull: boolean;
  /** Valeur écrite à la place d'un NULL PostgreSQL dans une colonne NOT NULL. */
  fallback: SqliteValue;
}

/** Index unique du réplica (contrainte UNIQUE ou clé primaire composite). */
export interface UniqueKey {
  name: string;
  columns: string[];
}

/** Contenu converti d'une table, prêt à remplacer celui du réplica. */
export interface TablePlan {
  table: string;
  columns: ColumnPlan[];
  /** Lignes lues dans la source, et parmi elles `visible = 0`. */
  rowsRead: number;
  hiddenRead: number;
  /** Lignes à écrire (doublons d'index unique retirés). */
  rows: SqliteValue[][];
  /** Lignes à écrire avec `visible = 0`. */
  hidden: number;
  /** NULL PostgreSQL remplacés (colonne NOT NULL côté SQLite) : défaut SQLite, sinon 0 ou ''. */
  nullsReplaced: Record<string, number>;
  /** Lignes écartées par index unique du réplica (PostgreSQL n'a pas ces contraintes). */
  duplicatesDropped: Record<string, number>;
}

export type TableStatus = "written" | "unchanged" | "planned" | "skipped" | "failed";

export interface TableReport {
  status: TableStatus;
  reason?: string;
  rowsRead: number;
  rowsWritten: number;
  /** Lignes `visible = 0` lues dans PostgreSQL. */
  hiddenRead: number;
  /** Lignes `visible = 0` écrites dans le réplica. */
  hiddenWritten: number;
  /** Colonnes copiées (intersection). */
  columns: number;
  ignoredColumns: { postgres: string[]; sqlite: string[] };
  nullsReplaced?: Record<string, number>;
  duplicatesDropped?: Record<string, number>;
  writeMs?: number;
  error?: string;
}

export interface SyncReport {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  durationMs: number;
  /** Tables qui ont reçu la colonne `visible` (`ensureWikiVisibility`). */
  visibleAdded: string[];
  tables: Record<string, TableReport>;
  totals: {
    rowsRead: number;
    rowsWritten: number;
    hiddenWritten: number;
    written: number;
    unchanged: number;
    planned: number;
    skipped: number;
    failed: number;
  };
}

export interface SyncOptions {
  /** Réplica ouvert par {@link openReplica} (lecture seule en `dryRun`). */
  sqlite: Database;
  source: ReplicaSource;
  /** Tables à synchroniser, dans l'ordre d'écriture. */
  tables: readonly string[];
  dryRun?: boolean;
  /** Autorise à vider une table que la source renvoie vide (refusé par défaut). */
  allowEmpty?: boolean;
  /** Défaut : dérivé du schéma Drizzle du bot (`schema.ts`). */
  timestampTargets?: TimestampTargets;
}

// ── Arguments ───────────────────────────────────────────────────────────────

export type SyncArgs =
  | { kind: "run"; dryRun: boolean; allowEmpty: boolean; tables: string[] }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const SYNC_USAGE = `Usage : bun scripts/sync-neon-to-sqlite.ts [--dry-run] [--tables a,b] [--allow-empty]

Reverse-sync PostgreSQL bot.* → réplica SQLite du bot (tables WIKI_EDITORIAL).
  --dry-run       lit PostgreSQL et le réplica, n'écrit rien (comptes par table)
  --tables a,b    limite la synchronisation aux tables listées
  --allow-empty   autorise à vider une table que PostgreSQL renvoie vide
Environnement : DATABASE_URL (sinon SHENRON_PG_ENV ou ~/.shenron-neon.env),
DATABASE_PATH (défaut : data/bot.db du bot).
Sortie : rapport JSON sur stdout. Code 0 si tout est synchronisé, 1 en cas
d'échec (table en échec annulée), 2 si les arguments sont invalides.`;

export function parseSyncArgs(argv: readonly string[], allowed: readonly string[]): SyncArgs {
  let dryRun = false;
  let allowEmpty = false;
  let selection: string[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") return { kind: "help" };
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--allow-empty") allowEmpty = true;
    else if (arg === "--tables" || arg.startsWith("--tables=")) {
      const raw = arg === "--tables" ? argv[++i] : arg.slice("--tables=".length);
      if (raw === undefined || raw.startsWith("--")) {
        return { kind: "error", message: "--tables attend une liste : --tables a,b" };
      }
      selection = [
        ...new Set(
          raw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ];
      if (selection.length === 0) return { kind: "error", message: "--tables : liste vide" };
    } else return { kind: "error", message: `argument inconnu : ${arg}` };
  }
  const unknown = (selection ?? []).filter((t) => !allowed.includes(t));
  if (unknown.length > 0) {
    return {
      kind: "error",
      message: `tables hors WIKI_EDITORIAL : ${unknown.join(", ")}`,
    };
  }
  // Ordre canonique de la liste éditoriale, quel que soit l'ordre de --tables.
  const tables = selection ? allowed.filter((t) => selection.includes(t)) : [...allowed];
  return { kind: "run", dryRun, allowEmpty, tables };
}

// ── Colonnes ────────────────────────────────────────────────────────────────

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** Affinité SQLite d'un type déclaré (règles de « Datatypes In SQLite », §3.1). */
export function sqliteAffinity(type: string): "INTEGER" | "TEXT" | "BLOB" | "REAL" | "NUMERIC" {
  const t = type.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "TEXT";
  if (t.includes("BLOB") || t.trim() === "") return "BLOB";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "REAL";
  return "NUMERIC";
}

/** Colonnes partagées (ordre du réplica) et colonnes ignorées de part et d'autre. */
export function intersectColumns(
  source: readonly SourceColumn[],
  replica: readonly ReplicaColumn[],
): {
  shared: { source: SourceColumn; replica: ReplicaColumn }[];
  postgresOnly: string[];
  sqliteOnly: string[];
} {
  const bySource = new Map(source.map((c) => [c.name, c]));
  const replicaNames = new Set(replica.map((c) => c.name));
  const shared: { source: SourceColumn; replica: ReplicaColumn }[] = [];
  const sqliteOnly: string[] = [];
  for (const column of replica) {
    const match = bySource.get(column.name);
    if (match) shared.push({ source: match, replica: column });
    else sqliteOnly.push(column.name);
  }
  const postgresOnly = source.map((c) => c.name).filter((name) => !replicaNames.has(name));
  return { shared, postgresOnly, sqliteOnly };
}

/** Colonnes d'une table du réplica (vide si la table est absente). */
export function readReplicaColumns(sqlite: Database, table: string): ReplicaColumn[] {
  return sqlite
    .query<{ name: string; type: string; notnull: number; dflt_value: string | null }, [string]>(
      'SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)',
    )
    .all(table)
    .map((c) => ({
      name: c.name,
      type: c.type,
      notNull: c.notnull === 1,
      defaultSql: c.dflt_value,
    }));
}

/** Index uniques d'une table du réplica (hors index partiels ou sur expression). */
export function readUniqueKeys(sqlite: Database, table: string): UniqueKey[] {
  return sqlite
    .query<{ name: string; unique: number; partial: number }, [string]>(
      'SELECT name, "unique", partial FROM pragma_index_list(?)',
    )
    .all(table)
    .filter((index) => index.unique === 1 && index.partial === 0)
    .map((index) => ({
      name: index.name,
      columns: sqlite
        .query<{ name: string | null }, [string]>("SELECT name FROM pragma_index_info(?)")
        .all(index.name)
        .map((c) => c.name ?? ""),
    }))
    .filter((key) => key.columns.length > 0 && key.columns.every(Boolean));
}

/** Représentation des dates attendue par le schéma Drizzle SQLite du bot, par table et colonne. */
export function drizzleTimestampTargets(): TimestampTargets {
  const targets = new Map<string, Map<string, TimestampEncoding>>();
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    targets.set(config.name, new Map(config.columns.map((c) => [c.name, drizzleEncoding(c)])));
  }
  return targets;
}

function drizzleEncoding(column: SQLiteColumn): TimestampEncoding {
  if (column.columnType === "SQLiteTimestamp") {
    return "mode" in column && column.mode === "timestamp_ms" ? "milliseconds" : "seconds";
  }
  const sqlType = column.getSQLType().toLowerCase();
  return sqlType === "text" || sqlType === "blob" ? "iso" : "seconds";
}

/**
 * Représentation d'une date pour une colonne du réplica : celle du schéma Drizzle
 * (`timestamp` en secondes, `timestamp_ms` en millisecondes, `text` en ISO), à
 * défaut l'affinité SQLite (entier ou réel : secondes, convention du bot ; texte : ISO).
 */
export function timestampEncoding(
  table: string,
  column: ReplicaColumn,
  targets: TimestampTargets,
): TimestampEncoding {
  const declared = targets.get(table)?.get(column.name);
  if (declared) return declared;
  const affinity = sqliteAffinity(column.type);
  return affinity === "TEXT" || affinity === "BLOB" ? "iso" : "seconds";
}

// ── Valeurs ─────────────────────────────────────────────────────────────────

function epochMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Date.parse(String(value));
}

function encodeTimestamp(value: unknown, pgType: string, encoding: TimestampEncoding): SqliteValue {
  const ms = epochMs(value);
  if (!Number.isFinite(ms)) return null;
  if (encoding === "seconds") return Math.floor(ms / 1000);
  if (encoding === "milliseconds") return Math.floor(ms);
  const iso = new Date(Math.floor(ms)).toISOString();
  return pgType === "date" ? iso.slice(0, 10) : iso;
}

/** `bigint`/`numeric` arrivent en texte (Bun.SQL) : nombre JS quand il est exact. */
function numericFromText(value: string, pgType: string): SqliteValue {
  const n = Number(value);
  if (!Number.isFinite(n)) return value.trim().toLowerCase() === "nan" ? null : value;
  if (pgType === "bigint" && !Number.isSafeInteger(n)) return BigInt(value);
  return n;
}

/**
 * Convertit une valeur PostgreSQL vers SQLite : booléens en 0/1 ; dates selon la
 * représentation du réplica ; json/jsonb et tableaux en texte JSON ; `bigint` et
 * `numeric` en nombres ; binaire en BLOB.
 */
export function toSqliteValue(
  value: unknown,
  pgType: string,
  encoding: TimestampEncoding,
): SqliteValue {
  if (value === null || value === undefined) return null;
  if (PG_TIMESTAMP_TYPES.has(pgType) || value instanceof Date) {
    return encodeTimestamp(value, pgType, encoding);
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (pgType === "boolean" && typeof value === "string") {
    return /^(?:t|true|1|y|yes|on)$/i.test(value.trim()) ? 1 : 0;
  }
  // Texte : déjà du JSON (le lecteur PostgreSQL caste json/jsonb/tableaux en ::text).
  if (PG_JSON_TYPES.has(pgType)) return typeof value === "string" ? value : JSON.stringify(value);
  if (typeof value === "string") {
    return pgType === "bigint" || pgType === "numeric" ? numericFromText(value, pgType) : value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value;
  }
  if (value instanceof Uint8Array) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Valeur d'un NULL PostgreSQL dans une colonne NOT NULL : défaut SQLite, sinon 0 ou ''. */
export function nullFallback(
  column: ReplicaColumn,
  evalDefault: (expression: string) => SqliteValue,
): SqliteValue {
  if (column.defaultSql !== null) {
    try {
      const value = evalDefault(column.defaultSql);
      if (value !== null) return value;
    } catch {
      // Défaut non évaluable hors INSERT : valeur neutre ci-dessous.
    }
  }
  const affinity = sqliteAffinity(column.type);
  return affinity === "TEXT" || affinity === "BLOB" ? "" : 0;
}

/** Évalue l'expression d'un défaut SQLite (`0`, `'ja'`, `(strftime('%s','now'))`…). */
export function sqliteDefaultEvaluator(sqlite: Database): (expression: string) => SqliteValue {
  return (expression) =>
    sqlite.query<{ v: SqliteValue }, []>(`SELECT ${expression} AS v`).get()?.v ?? null;
}

/** Plans des colonnes partagées, dans l'ordre du réplica. */
export function planColumns(
  table: string,
  shared: readonly { source: SourceColumn; replica: ReplicaColumn }[],
  targets: TimestampTargets,
  evalDefault: (expression: string) => SqliteValue,
): ColumnPlan[] {
  return shared.map(({ source, replica }) => ({
    name: replica.name,
    pgType: source.dataType,
    timestamp: timestampEncoding(table, replica, targets),
    notNull: replica.notNull,
    fallback: replica.notNull ? nullFallback(replica, evalDefault) : null,
  }));
}

function encodeValue(value: SqliteValue): string {
  if (value === null) return "N";
  if (typeof value === "number") return `n${value}`;
  if (typeof value === "bigint") return `b${value}`;
  if (typeof value === "string") return `s${value.length}:${value}`;
  return `x${Buffer.from(value).toString("hex")}`;
}

/**
 * Retire les lignes qui violeraient un index unique du réplica. Priorité : ligne
 * visible, puis plus petit `id` ; une ligne écartée masquée reste hors des lectures
 * publiques comme si elle avait `visible = 0`. Une clé avec NULL ne se heurte à rien
 * (sémantique SQLite). L'ordre de la source est conservé.
 */
export function dropUniqueDuplicates(
  columns: readonly ColumnPlan[],
  rows: SqliteValue[][],
  uniqueKeys: readonly UniqueKey[],
): { rows: SqliteValue[][]; dropped: Record<string, number> } {
  const keys = uniqueKeys
    .map((key) => ({
      name: key.name,
      indexes: key.columns.map((c) => columns.findIndex((p) => p.name === c)),
    }))
    .filter((key) => key.indexes.length > 0 && key.indexes.every((i) => i >= 0));
  const dropped: Record<string, number> = {};
  if (keys.length === 0 || rows.length < 2) return { rows, dropped };
  const visibleIndex = columns.findIndex((c) => c.name === "visible");
  const idIndex = columns.findIndex((c) => c.name === "id");
  const rank = (row: SqliteValue[]) =>
    visibleIndex >= 0 && Number(row[visibleIndex]) === 0 ? 1 : 0;
  const id = (row: SqliteValue[]) => (idIndex >= 0 ? Number(row[idIndex]) : Number.NaN);
  const order = rows
    .map((_, i) => i)
    .toSorted((a, b) => {
      const byRank = rank(rows[a]!) - rank(rows[b]!);
      if (byRank !== 0) return byRank;
      const byId = id(rows[a]!) - id(rows[b]!);
      return Number.isNaN(byId) || byId === 0 ? a - b : byId;
    });
  const seen = keys.map(() => new Set<string>());
  const keep = rows.map(() => false);
  for (const i of order) {
    const row = rows[i]!;
    const signatures = keys.map((key) =>
      key.indexes.some((j) => row[j] === null)
        ? null
        : key.indexes.map((j) => encodeValue(row[j]!)).join("\u0001"),
    );
    const clash = signatures.findIndex((s, k) => s !== null && seen[k]!.has(s));
    if (clash >= 0) {
      const name = keys[clash]!.name;
      dropped[name] = (dropped[name] ?? 0) + 1;
      continue;
    }
    signatures.forEach((s, k) => s !== null && seen[k]!.add(s));
    keep[i] = true;
  }
  return { rows: rows.filter((_, i) => keep[i]), dropped };
}

/** Convertit les lignes de la source en lignes du réplica (ordre de `columns`). */
export function planTable(
  table: string,
  columns: readonly ColumnPlan[],
  rows: readonly SourceRow[],
  uniqueKeys: readonly UniqueKey[] = [],
): TablePlan {
  const visibleIndex = columns.findIndex((c) => c.name === "visible");
  const countHidden = (list: readonly SqliteValue[][]) =>
    visibleIndex < 0 ? 0 : list.filter((row) => Number(row[visibleIndex]) === 0).length;
  const nullsReplaced: Record<string, number> = {};
  const converted = rows.map((row) => {
    const out: SqliteValue[] = Array.from({ length: columns.length });
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i]!;
      let value = toSqliteValue(row[column.name], column.pgType, column.timestamp);
      if (value === null && column.notNull) {
        value = column.fallback;
        nullsReplaced[column.name] = (nullsReplaced[column.name] ?? 0) + 1;
      }
      out[i] = value;
    }
    return out;
  });
  const unique = dropUniqueDuplicates(columns, converted, uniqueKeys);
  return {
    table,
    columns: [...columns],
    rowsRead: converted.length,
    hiddenRead: countHidden(converted),
    rows: unique.rows,
    hidden: countHidden(unique.rows),
    nullsReplaced,
    duplicatesDropped: unique.dropped,
  };
}

// ── Comparaison ─────────────────────────────────────────────────────────────

/** Empreinte d'un contenu, indépendante de l'ordre des lignes (multiensemble de hachages). */
export function rowsFingerprint(rows: Iterable<readonly SqliteValue[]>): bigint[] {
  const hashes: bigint[] = [];
  for (const row of rows) hashes.push(BigInt(Bun.hash.wyhash(row.map(encodeValue).join("\u0001"))));
  return hashes.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function sameFingerprint(a: readonly bigint[], b: readonly bigint[]): boolean {
  return a.length === b.length && a.every((hash, i) => hash === b[i]);
}

/** Lignes actuelles du réplica, en flux (mémoire bornée à une ligne). */
function* replicaRows(
  sqlite: Database,
  table: string,
  columns: readonly ColumnPlan[],
): Generator<SqliteValue[]> {
  const names = columns.map((c) => c.name);
  const select = sqlite.query<Record<string, SqliteValue>, []>(
    `SELECT ${names.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)}`,
  );
  for (const row of select.iterate()) yield names.map((name) => row[name] ?? null);
}

// ── Réplica ─────────────────────────────────────────────────────────────────

/**
 * Ouvre le réplica sans jamais le créer. WAL et `busy_timeout` : le bot lit et
 * écrit la même base pendant la synchronisation. Les clés étrangères sont
 * désactivées sur CETTE connexion : PostgreSQL `bot.*` n'en déclare aucune et le
 * réplica en est le miroir (pas de cascade, pas de refus d'ordre d'insertion).
 */
export function openReplica(path: string, options: { readonly: boolean }): Database {
  const sqlite = options.readonly
    ? new Database(path, { readonly: true })
    : new Database(path, { readwrite: true, create: false });
  sqlite.exec(`PRAGMA busy_timeout = ${REPLICA_BUSY_TIMEOUT_MS}`);
  if (!options.readonly) {
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec("PRAGMA synchronous = NORMAL");
  }
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return sqlite;
}

function tableExists(sqlite: Database, table: string): boolean {
  return (
    sqlite
      .query<{ n: number }, [string]>(
        "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table)!.n > 0
  );
}

/**
 * Copie en mémoire du schéma des tables (tables et index), garanties
 * `ensureWikiReplicaSchema` et `ensureWikiVisibility` appliquées : le schéma que
 * le réplica aura, connu sans y écrire (plan, `--dry-run`). L'appelant ferme la copie.
 */
function projectedReplicaSchema(sqlite: Database, tables: readonly string[]): Database {
  const clone = new Database(":memory:");
  try {
    const names = [...new Set([...tables, ...WIKI_VISIBILITY_TABLES])];
    const ddl = (type: "table" | "index", name: string) =>
      sqlite
        .query<{ sql: string }, [string, string]>(
          "SELECT sql FROM sqlite_master WHERE type = ? AND tbl_name = ? AND sql IS NOT NULL",
        )
        .all(type, name)
        .map((r) => r.sql);
    for (const name of names) for (const sql of ddl("table", name)) clone.exec(sql);
    for (const name of names) for (const sql of ddl("index", name)) clone.exec(sql);
    ensureWikiReplicaSchema(clone);
    ensureWikiVisibility(clone);
    return clone;
  } catch (err) {
    clone.close();
    throw err;
  }
}

/** Remplace le contenu d'une table du réplica (DELETE puis INSERT en lots), en une transaction. */
export function replaceTable(sqlite: Database, plan: TablePlan): void {
  const table = quoteIdent(plan.table);
  const width = plan.columns.length;
  const batch = Math.max(1, Math.min(INSERT_BATCH_ROWS, Math.floor(SQLITE_MAX_VARIABLES / width)));
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  const insertSql = (rows: number) =>
    `INSERT INTO ${table} (${plan.columns.map((c) => quoteIdent(c.name)).join(", ")}) VALUES ${Array.from({ length: rows }, () => tuple).join(", ")}`;
  const full = sqlite.prepare(insertSql(batch));
  try {
    sqlite
      .transaction(() => {
        sqlite.run(`DELETE FROM ${table}`);
        const whole = plan.rows.length - (plan.rows.length % batch);
        for (let i = 0; i < whole; i += batch) full.run(...plan.rows.slice(i, i + batch).flat());
        if (whole < plan.rows.length) {
          const rest = sqlite.prepare(insertSql(plan.rows.length - whole));
          try {
            rest.run(...plan.rows.slice(whole).flat());
          } finally {
            rest.finalize();
          }
        }
      })
      .immediate();
  } finally {
    full.finalize();
  }
}

// ── Synchronisation ─────────────────────────────────────────────────────────

/** Compare au réplica puis, si besoin, remplace la table ; renvoie son statut. */
function writePlan(
  sqlite: Database,
  plan: TablePlan,
  report: TableReport,
  options: { dryRun: boolean; allowEmpty?: boolean },
): TableStatus {
  // En --dry-run, une colonne encore à créer (`visible`…) rend la comparaison inutile.
  const realColumns = new Set(readReplicaColumns(sqlite, plan.table).map((c) => c.name));
  const current = plan.columns.every((c) => realColumns.has(c.name))
    ? rowsFingerprint(replicaRows(sqlite, plan.table, plan.columns))
    : null;
  if (current && sameFingerprint(current, rowsFingerprint(plan.rows))) return "unchanged";
  const currentCount =
    current?.length ??
    (realColumns.size === 0
      ? 0
      : sqlite
          .query<{ n: number }, []>(`SELECT count(*) AS n FROM ${quoteIdent(plan.table)}`)
          .get()!.n);
  if (plan.rows.length === 0 && currentCount > 0 && !options.allowEmpty) {
    report.error = `PostgreSQL renvoie 0 ligne, le réplica en a ${currentCount} : table conservée (--allow-empty pour la vider)`;
    return "failed";
  }
  if (options.dryRun) return "planned";
  const t0 = performance.now();
  try {
    replaceTable(sqlite, plan);
    report.rowsWritten = plan.rows.length;
    report.hiddenWritten = plan.hidden;
    return "written";
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    return "failed";
  } finally {
    report.writeMs = Math.round(performance.now() - t0);
  }
}

function emptyReport(): TableReport {
  return {
    status: "skipped",
    rowsRead: 0,
    rowsWritten: 0,
    hiddenRead: 0,
    hiddenWritten: 0,
    columns: 0,
    ignoredColumns: { postgres: [], sqlite: [] },
  };
}

export async function syncReplica(options: SyncOptions): Promise<SyncReport> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const { sqlite, source, tables } = options;
  const dryRun = options.dryRun ?? false;
  const targets = options.timestampTargets ?? drizzleTimestampTargets();

  // Base vide ou non migrée : on ne la remplit pas (elle doit le rester jusqu'au boot du bot).
  if (!WIKI_VISIBILITY_TABLES.some((t) => tableExists(sqlite, t))) {
    throw new Error(
      "réplica sans tables wiki : base vide ou non migrée (démarrer le bot une fois)",
    );
  }

  // Plan établi sur le schéma garanti (copie en mémoire) : rien n'est écrit dans le
  // réplica tant que PostgreSQL n'a pas été lu en entier.
  const schemaDb = projectedReplicaSchema(sqlite, tables);
  let replicaColumns: Map<string, ReplicaColumn[]>;
  let uniqueKeys: Map<string, UniqueKey[]>;
  try {
    replicaColumns = new Map(tables.map((t) => [t, readReplicaColumns(schemaDb, t)]));
    uniqueKeys = new Map(tables.map((t) => [t, readUniqueKeys(schemaDb, t)]));
  } finally {
    schemaDb.close();
  }
  const evalDefault = sqliteDefaultEvaluator(sqlite);

  const reports: Record<string, TableReport> = {};
  const plans: TablePlan[] = [];

  // 1. Lecture complète dans un instantané PostgreSQL, avant toute écriture.
  await source.snapshot(async (reader) => {
    const sourceColumns = await reader.columns(tables);
    for (const table of tables) {
      const report = emptyReport();
      reports[table] = report;
      const replica = replicaColumns.get(table) ?? [];
      const pg = sourceColumns.get(table);
      if (replica.length === 0) {
        report.reason = "absente du réplica SQLite";
        continue;
      }
      if (!pg || pg.length === 0) {
        report.reason = "absente de PostgreSQL";
        continue;
      }
      const { shared, postgresOnly, sqliteOnly } = intersectColumns(pg, replica);
      report.ignoredColumns = { postgres: postgresOnly, sqlite: sqliteOnly };
      report.columns = shared.length;
      if (shared.length === 0) {
        report.reason = "aucune colonne commune";
        continue;
      }
      const columns = planColumns(table, shared, targets, evalDefault);
      // Une table à la fois sur la connexion de l'instantané : mémoire bornée à une table brute.
      // oxlint-disable-next-line no-await-in-loop -- lecture séquentielle voulue
      const rows = await reader.rows(
        table,
        shared.map((s) => s.source),
      );
      const plan = planTable(table, columns, rows, uniqueKeys.get(table));
      report.rowsRead = plan.rowsRead;
      report.hiddenRead = plan.hiddenRead;
      if (Object.keys(plan.nullsReplaced).length > 0) report.nullsReplaced = plan.nullsReplaced;
      if (Object.keys(plan.duplicatesDropped).length > 0) {
        report.duplicatesDropped = plan.duplicatesDropped;
      }
      plans.push(plan);
    }
  });

  // 2. Garanties de schéma (idempotentes, celles du boot du bot), puis écriture
  //    table par table, chacune dans sa transaction courte.
  let visibleAdded: string[] = [];
  if (!dryRun) {
    ensureWikiReplicaSchema(sqlite);
    visibleAdded = ensureWikiVisibility(sqlite);
  }
  for (const plan of plans) {
    const report = reports[plan.table]!;
    report.status = writePlan(sqlite, plan, report, { dryRun, allowEmpty: options.allowEmpty });
    plan.rows = []; // libère la table traitée avant la suivante
  }

  const all = Object.values(reports);
  const count = (status: TableStatus) => all.filter((r) => r.status === status).length;
  return {
    ok: count("failed") === 0,
    dryRun,
    startedAt,
    durationMs: Math.round(performance.now() - started),
    visibleAdded,
    tables: reports,
    totals: {
      rowsRead: all.reduce((s, r) => s + r.rowsRead, 0),
      rowsWritten: all.reduce((s, r) => s + r.rowsWritten, 0),
      hiddenWritten: all.reduce((s, r) => s + r.hiddenWritten, 0),
      written: count("written"),
      unchanged: count("unchanged"),
      planned: count("planned"),
      skipped: count("skipped"),
      failed: count("failed"),
    },
  };
}

// ── Source PostgreSQL ───────────────────────────────────────────────────────

/**
 * Expression SELECT d'une colonne PostgreSQL : json/jsonb en `::text`, tableaux en
 * `to_json(…)::text`, dates en epoch millisecondes (`float8`) — un contrat de
 * valeurs indépendant du décodage du pilote et du fuseau de la session.
 */
export function pgSelectExpression(column: SourceColumn): string {
  const id = quoteIdent(column.name);
  if (column.dataType === "json" || column.dataType === "jsonb") return `${id}::text AS ${id}`;
  if (column.dataType === "ARRAY") return `to_json(${id})::text AS ${id}`;
  if (PG_TIMESTAMP_TYPES.has(column.dataType)) {
    return `(extract(epoch FROM ${id}) * 1000)::float8 AS ${id}`;
  }
  return id;
}

/** Source PostgreSQL (Bun.SQL) : un instantané REPEATABLE READ en lecture seule. */
export function createPgReplicaSource(sql: SQL): ReplicaSource {
  return {
    snapshot<T>(read: (reader: ReplicaReader) => Promise<T>): Promise<T> {
      return sql.begin("isolation level repeatable read, read only", (tx) =>
        read({
          async columns(tables) {
            const wanted = new Set(tables);
            const rows = (await tx.unsafe(
              `SELECT table_name, column_name, data_type FROM information_schema.columns
               WHERE table_schema = '${SOURCE_SCHEMA}' ORDER BY table_name, ordinal_position`,
            )) as { table_name: string; column_name: string; data_type: string }[];
            const byTable = new Map<string, SourceColumn[]>();
            for (const row of rows) {
              if (!wanted.has(row.table_name)) continue;
              const list = byTable.get(row.table_name) ?? [];
              list.push({ name: row.column_name, dataType: row.data_type });
              byTable.set(row.table_name, list);
            }
            return byTable;
          },
          async rows(table, columns) {
            return (await tx.unsafe(
              `SELECT ${columns.map(pgSelectExpression).join(", ")} FROM ${SOURCE_SCHEMA}.${quoteIdent(table)}`,
            )) as SourceRow[];
          },
        }),
      ) as Promise<T>;
    },
  };
}
