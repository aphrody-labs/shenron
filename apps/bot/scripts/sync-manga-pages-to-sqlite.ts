#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Public OCR replica: read-only by default; --apply atomically maintains source and FTS deltas. */
import { Database } from "bun:sqlite";
import { SQL } from "bun";
import { join } from "node:path";
import { loadDatabaseUrl } from "@aphrody/shenron-db/env";
import { readPublicMangaSnapshot, syncMangaSnapshot } from "../src/db/manga-search-replica";

if (import.meta.main) {
  const botRoot = join(import.meta.dir, "..");
  const path = process.env.BOT_DB ?? join(botRoot, "data", "bot.db");
  if (!(await Bun.file(path).exists())) throw new Error("SQLite replica must already exist");
  const apply = Bun.argv.includes("--apply") && !Bun.argv.includes("--dry-run");
  const url = loadDatabaseUrl({
    fallbackFiles: [
      { path: join(botRoot, "..", "..", ".env.remote-db"), varName: "REMOTE_DATABASE_URL" },
      { path: join(botRoot, "..", "site", ".env"), varName: "DATABASE_URL" },
    ],
  });
  if (!url.ok) throw new Error("PostgreSQL configuration unavailable");
  const sql = new SQL(url.url);
  const db = new Database(path, { readonly: !apply, strict: true });
  try {
    db.exec("PRAGMA busy_timeout=10000");
    const snapshot = await readPublicMangaSnapshot(sql);
    console.log(
      JSON.stringify(
        apply
          ? syncMangaSnapshot(db, snapshot.rows, snapshot.expectedCount)
          : { mode: "read-only", sourcePages: snapshot.expectedCount },
        null,
        2,
      ),
    );
  } finally {
    db.close();
    await sql.close();
  }
}
