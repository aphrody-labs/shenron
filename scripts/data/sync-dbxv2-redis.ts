#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Mirror the private DBXV2 SQLite catalog and parsed data into its dedicated Redis. */
import { Database } from "bun:sqlite";
import { RedisClient } from "bun";

const dbPath = process.env.DBXV2_DB_PATH ?? "/games/private/shenron-dbxv2/dbxv2.sqlite";
const credentialsPath =
  process.env.DBXV2_REDIS_ENV ?? "/games/private/shenron-dbxv2/redis/credentials.env";
const credentialText = await Bun.file(credentialsPath).text();
const redisUrl = /^REDIS_URL=(.+)$/m
  .exec(credentialText)?.[1]
  ?.trim()
  .replace(/^['"]|['"]$/g, "");
if (!redisUrl) throw new Error("REDIS_URL missing from protected Redis credentials file");

const db = new Database(dbPath, { readonly: true });
const redis = new RedisClient(redisUrl, { connectionTimeout: 10_000, autoReconnect: false });
const generation = new Date().toISOString().replaceAll(/[^0-9A-Za-z]/g, "");
const prefix = `dbxv2:${generation}`;

interface FileRow {
  id: number;
  cpk: string;
  path: string;
  size: number;
  extract_size: number | null;
  kind: string;
  format: string;
  category: string;
  sha256: string | null;
  support_state: string | null;
  parse_status: string | null;
  data_json: string | null;
}

async function addToSet(key: string, value: string): Promise<void> {
  await redis.sadd(key, value);
}

const allFiles = db
  .query(
    `SELECT f.id, f.cpk, f.path, f.size, f.extract_size, f.kind, f.format, f.category, f.sha256,
          s.support_state, s.parse_status, s.data_json
     FROM dbxv2_files f LEFT JOIN dbxv2_structured s ON s.file_id=f.id ORDER BY f.id`,
  )
  .iterate() as Iterable<FileRow>;
let files = 0;
let messages = 0;
let characters = 0;
const pipeline: Promise<unknown>[] = [];

function queue<T>(promise: Promise<T>): void {
  pipeline.push(promise);
}

async function flush(): Promise<void> {
  if (pipeline.length === 0) return;
  const batch = pipeline.splice(0);
  await Promise.all(batch);
}

try {
  await redis.connect();
  if ((await redis.ping()) !== "PONG") throw new Error("Redis did not answer PONG");
  for (const file of allFiles) {
    const fileKey = `${prefix}:file:${file.id}`;
    queue(
      redis.hmset(fileKey, [
        "id",
        String(file.id),
        "cpk",
        file.cpk,
        "path",
        file.path,
        "size",
        String(file.size),
        "extract_size",
        file.extract_size === null ? "" : String(file.extract_size),
        "kind",
        file.kind,
        "format",
        file.format,
        "category",
        file.category,
        "sha256",
        file.sha256 ?? "",
        "support_state",
        file.support_state ?? "unknown",
        "parse_status",
        file.parse_status ?? "unprocessed",
        "data_json",
        file.data_json ?? "",
      ]),
    );
    queue(addToSet(`${prefix}:files`, String(file.id)));
    queue(addToSet(`${prefix}:format:${file.format}`, String(file.id)));
    queue(addToSet(`${prefix}:cpk:${file.cpk}`, String(file.id)));
    files++;
    if (files % 256 === 0) await flush();
  }
  await flush();

  const messageRows = db
    .query(
      `SELECT m.file_id, m.lang, m.base, m.entry_id, m.name_id, m.text, f.format
       FROM dbxv2_msg m JOIN dbxv2_files f ON f.id=m.file_id ORDER BY m.file_id,m.entry_id`,
    )
    .iterate() as Iterable<{
    file_id: number;
    lang: string;
    base: string;
    entry_id: number;
    name_id: string;
    text: string;
    format: string;
  }>;
  for (const row of messageRows) {
    queue(redis.set(`${prefix}:message:${row.file_id}:${row.entry_id}`, JSON.stringify(row)));
    queue(addToSet(`${prefix}:messages:${row.lang}`, `${row.file_id}:${row.entry_id}`));
    messages++;
    if (messages % 256 === 0) await flush();
  }
  await flush();

  const characterRows = db
    .query("SELECT file_id,id,short_name FROM dbxv2_characters ORDER BY file_id,id")
    .iterate() as Iterable<{ file_id: number; id: number; short_name: string }>;
  for (const row of characterRows) {
    queue(redis.set(`${prefix}:character:${row.file_id}:${row.id}`, JSON.stringify(row)));
    queue(addToSet(`${prefix}:characters`, `${row.file_id}:${row.id}`));
    characters++;
    if (characters % 256 === 0) await flush();
  }
  await flush();

  const metadata = {
    generation,
    createdAt: new Date().toISOString(),
    files,
    messages,
    characters,
    schemaVersion: db.query("SELECT value FROM dbxv2_meta WHERE key='schema_version'").get() as {
      value: string;
    } | null,
  };
  await redis.set(`${prefix}:manifest`, JSON.stringify(metadata));
  await redis.set("dbxv2:active", generation);
  console.log(JSON.stringify({ generation, files, messages, characters }));
} finally {
  db.close();
  redis.close();
}
