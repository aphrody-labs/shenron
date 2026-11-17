// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyVfsSchema } from "@aphrody/shenron-db/vfs/schema";
import { exportPublicWikiRag } from "@aphrody/shenron-db/vfs/public-wiki-rag";
import { requireProductionVfs } from "./server-vfs-policy";

test("production rejects disabled, missing, private and empty knowledge snapshots", () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-production-vfs-"));
  const path = join(dir, "public.sqlite");
  try {
    expect(() => requireProductionVfs(path, true)).toThrow("--no-vfs");
    expect(() => requireProductionVfs(path, false)).toThrow("missing");
    const db = new Database(path);
    applyVfsSchema(db);
    db.query("INSERT INTO vfs_meta VALUES ('profile', 'public')").run();
    db.close();
    expect(() => requireProductionVfs(path, false)).toThrow("wiki rows");
    const populated = new Database(path);
    populated
      .query("INSERT INTO wiki_entities VALUES ('characters', 1, 'goku', 'goku', ?)")
      .run(JSON.stringify({ name: "Goku" }));
    populated.close();
    expect(() => requireProductionVfs(path, false)).toThrow("RAG chunks");
    const ready = new Database(path);
    exportPublicWikiRag(ready);
    ready.close();
    expect(() => requireProductionVfs(path, false)).not.toThrow();
    const privateDb = new Database(path);
    privateDb.query("UPDATE vfs_meta SET value = 'complet' WHERE key = 'profile'").run();
    privateDb.close();
    expect(() => requireProductionVfs(path, false)).toThrow("not public");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
