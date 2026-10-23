#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Populate the private DBXV2 SQLite structured layer from the mounted CPK reader.
 *
 *   bun scripts/data/build-dbxv2-structured.ts plan
 *   bun scripts/data/build-dbxv2-structured.ts run [--format ema,emo] [--limit N] [--concurrency N]
 *
 * Raw CPK members are streamed from the authenticated private service and discarded after
 * parsing. SQLite remains the source of truth; unsupported formats are recorded as deferred.
 */
import { Database } from "bun:sqlite";
import { chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { applyDbxv2Schema } from "../../packages/db/src/dbxv2/schema";
import { decodeCms, decodeMsg } from "../../packages/db/src/dbxv2/msg";

const PARSER_VERSION = "bun-re-dbXV2-2026-10-23.1";
const SUMMARY_FORMATS = new Set([
  "bac",
  "bcm",
  "bcs",
  "bdm",
  "bsa",
  "cms",
  "cus",
  "ean",
  "ema",
  "emd",
  "emm",
  "emo",
  "esk",
  "msg",
  "pup",
]);
const LANG_SUFFIX = /(?:^|\/)([^/]+)_([a-z]{2})\.msg$/i;

interface FileRow {
  id: number;
  cpk: string;
  path: string;
  format: string;
  category: string;
  kind: string;
}

interface Identified {
  format: string;
  category: string;
  parsable: boolean;
}

interface Support {
  format: string;
  state: "full" | "header" | "unverified" | "convert" | "identify";
}

interface FfiApi {
  identify(bytes: Uint8Array, name?: string): Identified;
  summarize(bytes: Uint8Array, name?: string): { format: string; category: string; data: unknown };
  acbInfo(bytes: Uint8Array): unknown;
  support(): Support[];
  close(): void;
}

interface ResultRow {
  file: FileRow;
  format: string;
  category: string;
  kind: string;
  supportState: Support["state"] | "unknown";
  parseStatus: "parsed" | "deferred" | "error";
  sourceSha256: string | null;
  dataJson: string | null;
  error: string | null;
  parsedAt: string;
  msgRows?: { lang: string; base: string; id: number; nameId: string; text: string }[];
  characterRows?: { id: number; shortName: string }[];
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    db: {
      type: "string",
      default: process.env.DBXV2_DB_PATH ?? "/games/private/shenron-dbxv2/dbxv2.sqlite",
    },
    server: { type: "string", default: process.env.DBXV2_SERVER_URL ?? "http://10.200.77.1:8788" },
    format: { type: "string" },
    limit: { type: "string" },
    concurrency: { type: "string", default: process.env.DBXV2_STRUCTURED_CONCURRENCY ?? "4" },
  },
});

function kindFor(category: string, fallback: string): string {
  switch (category) {
    case "model":
    case "skeleton":
    case "animation":
      return "models";
    case "texture":
      return "textures";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "text":
      return "text";
    case "unknown":
      return fallback;
    default:
      return "data";
  }
}

function assertPrivatePath(path: string): string {
  const absolute = resolve(path);
  const root = resolve(homedir(), "src/shenron");
  if (absolute === root || absolute.startsWith(`${root}/`) || absolute.startsWith(`${root}\\`)) {
    throw new Error(`refusing a DBXV2 database inside the repository: ${absolute}`);
  }
  return absolute;
}

function formatFilter(): Set<string> | null {
  return values.format
    ? new Set(
        values.format
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
}

function rowLimit(): number | null {
  if (!values.limit) return null;
  const limit = Number(values.limit);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new Error("--limit must be a positive integer");
  return limit;
}

function requestUrl(base: string, cpk: string, path: string): string {
  const segments = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/cpk/${encodeURIComponent(cpk)}/raw/${segments}`;
}

async function readMember(base: string, token: string, file: FileRow): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(requestUrl(base, file.cpk, file.path), {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      const details = (await response.text()).slice(0, 500);
      lastError = new Error(`CPK service returned HTTP ${response.status}: ${details}`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await Bun.sleep(250 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function boundedError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

const command = positionals[0] ?? "plan";
const dbPath = assertPrivatePath(values.db!);
const db = new Database(dbPath, { create: command === "run" });
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
applyDbxv2Schema(db);

const totalFiles = (db.query("SELECT count(*) AS n FROM dbxv2_files").get() as { n: number }).n;
if (command === "run" && totalFiles === 0) {
  db.close();
  throw new Error(`No indexed DBXV2 files in ${dbPath}`);
}
if (command === "plan") {
  const rows = db
    .query(
      `SELECT format, category, count(*) AS files, sum(extract_size) AS extracted_bytes
     FROM dbxv2_files GROUP BY format, category ORDER BY files DESC`,
    )
    .all();
  const existing = db
    .query(
      "SELECT parse_status, count(*) AS files FROM dbxv2_structured GROUP BY parse_status ORDER BY parse_status",
    )
    .all();
  console.log(
    JSON.stringify({ db: dbPath, totalFiles, structured: existing, byFormat: rows }, null, 2),
  );
  db.close();
} else if (command === "run") {
  const token = process.env.DBXV2_TOKEN;
  if (!token || token.length < 16)
    throw new Error("DBXV2_TOKEN is required in the process environment");
  const authToken: string = token;
  const concurrency = Number(values.concurrency);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("--concurrency must be an integer from 1 to 16");
  }
  const selectedFormats = formatFilter();
  const limit = rowLimit();
  const serverUrl = values.server ?? "http://10.200.77.1:8788";
  const source =
    process.env.SHENRON_DBXV2_SRC ?? `${homedir()}/src/bun-os/packages/shenron-dbxv2/src/index.ts`;
  const { loadDbxv2Ffi } = (await import(source)) as {
    loadDbxv2Ffi(path?: string): FfiApi;
  };
  const api = loadDbxv2Ffi(process.env.SHENRON_DBXV2_LIB);
  const support = new Map(api.support().map((row) => [row.format, row.state]));
  const empty = new Uint8Array(4);
  const filterSql = selectedFormats
    ? `AND (${[...selectedFormats].map(() => "(lower(f.format)=? OR lower(f.path) LIKE ?)").join(" OR ")})`
    : "";
  const formatParams = selectedFormats
    ? [...selectedFormats].flatMap((format) => [format, `%.${format}`])
    : [];
  const pending = db
    .query(
      `SELECT f.id, f.cpk, f.path, f.format, f.category, f.kind
     FROM dbxv2_files f LEFT JOIN dbxv2_structured s ON s.file_id = f.id
     WHERE (s.file_id IS NULL OR s.parser_version != ? OR s.parse_status = 'error') ${filterSql}
     ORDER BY f.id${limit ? " LIMIT " + limit : ""}`,
    )
    .all(PARSER_VERSION, ...formatParams) as FileRow[];
  const stat = {
    queued: pending.length,
    parsed: 0,
    deferred: 0,
    errors: 0,
    messageEntries: 0,
    characters: 0,
  };
  const insertStructured = db.query(
    `INSERT INTO dbxv2_structured
       (file_id, format, support_state, parse_status, parser_version, source_sha256, data_json, error, parsed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET format=excluded.format, support_state=excluded.support_state,
       parse_status=excluded.parse_status, parser_version=excluded.parser_version,
       source_sha256=excluded.source_sha256, data_json=excluded.data_json, error=excluded.error,
       parsed_at=excluded.parsed_at`,
  );
  const updateFile = db.query(
    `UPDATE dbxv2_files SET format=?, category=?, kind=?, sha256=COALESCE(?, sha256) WHERE id=?`,
  );
  const clearMessages = db.query("DELETE FROM dbxv2_msg WHERE file_id=?");
  const insertMessage = db.query(
    "INSERT OR REPLACE INTO dbxv2_msg (file_id, lang, base, entry_id, name_id, text) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const clearCharacters = db.query("DELETE FROM dbxv2_characters WHERE file_id=?");
  const insertCharacter = db.query(
    "INSERT OR REPLACE INTO dbxv2_characters (file_id, id, short_name) VALUES (?, ?, ?)",
  );
  const batch: ResultRow[] = [];
  const flush = (): void => {
    if (batch.length === 0) return;
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const result of batch) {
        updateFile.run(
          result.format,
          result.category,
          result.kind,
          result.sourceSha256,
          result.file.id,
        );
        insertStructured.run(
          result.file.id,
          result.format,
          result.supportState,
          result.parseStatus,
          PARSER_VERSION,
          result.sourceSha256,
          result.dataJson,
          result.error,
          result.parsedAt,
        );
        if (result.msgRows) {
          clearMessages.run(result.file.id);
          for (const row of result.msgRows) {
            insertMessage.run(result.file.id, row.lang, row.base, row.id, row.nameId, row.text);
          }
        }
        if (result.characterRows) {
          clearCharacters.run(result.file.id);
          for (const row of result.characterRows)
            insertCharacter.run(result.file.id, row.id, row.shortName);
        }
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    batch.length = 0;
  };

  const makeResult = (
    file: FileRow,
    identified: Identified,
    supportState: Support["state"] | "unknown",
  ): ResultRow => ({
    file,
    format: identified.format,
    category: identified.category,
    kind: kindFor(identified.category, file.kind),
    supportState,
    parseStatus: "deferred",
    sourceSha256: null,
    dataJson: null,
    error: null,
    parsedAt: new Date().toISOString(),
  });

  async function parseFile(file: FileRow): Promise<ResultRow> {
    const byName = api.identify(empty, file.path);
    let format = byName.format;
    let category = byName.category;
    let fileKind = kindFor(category, file.kind);
    let state: Support["state"] | "unknown" =
      support.get(format) ??
      (format === "unknown" ? "unknown" : byName.parsable ? "full" : "identify");
    let result = makeResult(file, { ...byName, format, category }, state);
    const shouldParse = format === "acb" || (SUMMARY_FORMATS.has(format) && state !== "identify");
    if (!shouldParse) return result;

    try {
      const bytes = await readMember(serverUrl, authToken, file);
      const actual = api.identify(bytes, file.path);
      format = actual.format;
      category = actual.category;
      fileKind = kindFor(category, file.kind);
      state =
        support.get(format) ??
        (format === "unknown" ? "unknown" : actual.parsable ? "full" : "identify");
      result = makeResult(file, { ...actual, format, category }, state);
      result.sourceSha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
      const data = format === "acb" ? api.acbInfo(bytes) : api.summarize(bytes, file.path);
      result.parseStatus = "parsed";
      result.dataJson = JSON.stringify(data);
      result.kind = fileKind;
      if (format === "msg") {
        const lang = LANG_SUFFIX.exec(file.path)?.[2]?.toLowerCase() ?? "und";
        const base =
          LANG_SUFFIX.exec(file.path)?.[1] ??
          file.path
            .split("/")
            .at(-1)
            ?.replace(/\.msg$/i, "") ??
          file.path;
        result.msgRows = decodeMsg(bytes).map((entry) => ({
          lang,
          base,
          id: entry.id,
          nameId: entry.nameId,
          text: entry.lines.join("\n"),
        }));
      } else if (format === "cms") {
        result.characterRows = decodeCms(bytes);
      }
      return result;
    } catch (error) {
      result.parseStatus = "error";
      result.error = boundedError(error);
      return result;
    }
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    for (;;) {
      const file = pending[cursor++];
      if (!file) return;
      const result = await parseFile(file);
      batch.push(result);
      if (result.parseStatus === "parsed") {
        stat.parsed++;
        stat.messageEntries += result.msgRows?.length ?? 0;
        stat.characters += result.characterRows?.length ?? 0;
      } else if (result.parseStatus === "error") stat.errors++;
      else stat.deferred++;
      if (batch.length >= 128) flush();
      const done = stat.parsed + stat.deferred + stat.errors;
      if (done % 2_048 === 0) {
        flush();
        console.error(
          `structured ${done}/${stat.queued}: parsed=${stat.parsed} deferred=${stat.deferred} errors=${stat.errors}`,
        );
      }
    }
  });

  try {
    await Promise.all(workers);
    flush();
    const setMeta = db.query(
      "INSERT INTO dbxv2_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    );
    setMeta.run("structured_at", new Date().toISOString());
    setMeta.run("structured_parser_version", PARSER_VERSION);
    setMeta.run("structured_stats", JSON.stringify(stat));
    chmodSync(dirname(dbPath), 0o700);
    chmodSync(dbPath, 0o600);
    console.log(JSON.stringify({ db: dbPath, ...stat }));
  } finally {
    api.close();
    db.close();
  }
} else {
  db.close();
  throw new Error(`unknown command ${command} (plan | run)`);
}
