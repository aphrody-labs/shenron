#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * build-dbxv2-db.ts — builds the PRIVATE DBXV2 database (SQLite) on the build host.
 *
 *   bun scripts/data/build-dbxv2-db.ts build [--assets DIR] [--cpk-index FILE] [--out FILE]
 *   bun scripts/data/build-dbxv2-db.ts embed [--db FILE] [--embed-url URL] [--batch N=16] [--limit N]
 *   bun scripts/data/build-dbxv2-db.ts plan  [--db FILE]
 *
 * Game data (Bandai Namco / Dimps) never enters Git, the public VFS, a build artifact or the
 * production PostgreSQL: the output lives under `~/var/dbxv2-db/` (700, file 600) and the
 * script refuses any path inside the repository. `build` reads the dump indexes and calls
 * `identify` of `@shenron/dbxv2` (`SHENRON_DBXV2_SRC`, `SHENRON_DBXV2_LIB`); `embed` calls a
 * local `aphrody-embed serve` (multilingual-e5-small) and must run in tmux under the heavy
 * lock (`plan` prints the command). Never run `rag:build` on the production bot.
 */
import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  embedPending,
  ingestDbxv2,
  openDbxv2Db,
  parseJsonl,
  pendingChunks,
  type AssetRow,
  type CpkRow,
} from "@aphrody/shenron-db/dbxv2";
import { createE5Embedder } from "@aphrody/shenron-db/vfs/rag";

const REPO = resolve(import.meta.dir, "../..");
const HOME = process.env.HOME ?? homedir();

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    assets: { type: "string", default: join(HOME, "apps/dbxv2-assets") },
    "cpk-index": {
      type: "string",
      default: join(HOME, "var/dbxv2-media/2026-10-17/index/cpk-index.jsonl"),
    },
    out: { type: "string", default: join(HOME, "var/dbxv2-db/dbxv2.sqlite") },
    db: { type: "string" },
    "embed-url": { type: "string", default: "http://127.0.0.1:18795/v1" },
    batch: { type: "string", default: "16" },
    limit: { type: "string" },
  },
});

function privatePath(path: string): string {
  const abs = resolve(path);
  if (!relative(REPO, abs).startsWith("..")) {
    throw new Error(`refusing a DBXV2 database inside the repository: ${abs}`);
  }
  return abs;
}

const command = positionals[0] ?? "plan";
const dbPath = privatePath(values.db ?? values.out!);

if (command === "build") {
  const t0 = Date.now();
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  // The DBXV2 FFI (loadDbxv2Ffi) is not part of this repository: name its entry explicitly.
  const src = process.env.SHENRON_DBXV2_SRC;
  if (!src) throw new Error("SHENRON_DBXV2_SRC must name the DBXV2 FFI entry (src/index.ts)");
  const { loadDbxv2Ffi } = (await import(src)) as {
    loadDbxv2Ffi(lib?: string): {
      identify(bytes: Uint8Array, name?: string): { format: string; category: string };
      close(): void;
    };
  };
  const api = loadDbxv2Ffi(process.env.SHENRON_DBXV2_LIB);
  const empty = new Uint8Array(4);
  const assets = parseJsonl<AssetRow>(
    readFileSync(join(values.assets!, "meta/index.jsonl"), "utf8"),
  );
  const cpk = parseJsonl<CpkRow>(readFileSync(values["cpk-index"]!, "utf8"));
  const tmp = `${dbPath}.building`;
  rmSync(tmp, { force: true });
  const db = new Database(tmp, { create: true });
  db.exec("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;");
  const stats = ingestDbxv2(db, assets, cpk, {
    assetsDir: values.assets!,
    identify: (name) => {
      const info = api.identify(empty, name);
      return { format: info.format, category: info.category };
    },
    onProgress: (m) => console.error(m),
  });
  db.close();
  api.close();
  rmSync(dbPath, { force: true });
  renameSync(tmp, dbPath);
  chmodSync(dbPath, 0o600);
  console.log(JSON.stringify({ ...stats, seconds: (Date.now() - t0) / 1000, out: dbPath }));
} else if (command === "embed") {
  if (!existsSync(dbPath)) throw new Error(`no database at ${dbPath}: run build first`);
  const t0 = Date.now();
  const db = new Database(dbPath);
  const embedder = createE5Embedder({ baseUrl: values["embed-url"]!, timeoutMs: 120_000 });
  const done = await embedPending(db, {
    passages: embedder.passages,
    batch: Number(values.batch),
    ...(values.limit ? { limit: Number(values.limit) } : {}),
    onProgress: (d, total) => {
      if (d % 1024 < Number(values.batch)) console.error(`embedded ${d}/${total}`);
    },
  });
  db.close();
  console.log(JSON.stringify({ embedded: done, seconds: (Date.now() - t0) / 1000 }));
} else if (command === "plan") {
  const lock = process.env.SHENRON_BUILD_LOCK?.trim();
  const lines: string[] = [];
  if (existsSync(dbPath)) {
    const db = openDbxv2Db(dbPath);
    const stats = db.stats();
    lines.push(JSON.stringify({ ...stats, pendingEmbeddings: pendingChunks(db.db) }));
    db.close();
  } else lines.push(`no database at ${dbPath}`);
  lines.push(
    `# tmux, ${lock ? "verrou SHENRON_BUILD_LOCK, " : ""}journal durable :`,
    `tmux new-session -d -s dbxv2-embed 'aphrody-embed serve --port 18795 --model-dir $HOME/var/models & sleep 25; ${lock ? `flock ${lock} ` : ""}bun scripts/data/build-dbxv2-db.ts embed --batch 16 > ~/var/dbxv2-db/embed.log 2>&1; echo EXIT_CODE=$? >> ~/var/dbxv2-db/embed.log'`,
  );
  console.log(lines.join("\n"));
} else {
  throw new Error(`unknown command ${command} (build | embed | plan)`);
}
