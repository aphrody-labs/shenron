// SPDX-License-Identifier: Apache-2.0
/** Test fixtures of the server: temporary SHENRON_HOME paths and a small public VFS. */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { ShenronVfs, writeWikiRows } from "@aphrody/shenron-db/vfs";
import { createRagWriter } from "@aphrody/shenron-db/vfs/build";

import type { ServerPaths } from "../src/config";

/** SHENRON_HOME layout under `root`, every directory created. */
export function testPaths(root: string): ServerPaths {
  const home = join(root, "home");
  const paths: ServerPaths = {
    home,
    config: join(home, "config"),
    envFile: join(home, "config", "shenron.env"),
    data: join(home, "data"),
    cache: join(home, "cache"),
    logs: join(home, "logs"),
    exeDir: join(root, "exe"),
  };
  for (const dir of [paths.config, paths.data, paths.cache, paths.logs, paths.exeDir])
    mkdirSync(dir, { recursive: true });
  return paths;
}

export interface TestVfsOptions {
  profile?: string;
  /** Add a private node and a private RAG document (what a `complet` build holds). */
  private?: boolean;
  /** Add a node stored in the binary (`--embed-assets` build). */
  embedded?: boolean;
  /** Add a document of the conversations corpus. */
  conversations?: boolean;
}

/** One RAG passage about the Kamehameha. */
function row(entity: string, content: string, corpus = "shenron") {
  return {
    corpus,
    entity_id: entity,
    title: "Kamehameha",
    url: "https://dragonballfr.com/wiki/techniques/kamehameha",
    content,
    metadata: {
      kind: "wiki",
      originSourceId: corpus === "conversations" ? "conversations" : "wiki_pages",
    },
    updated_at: null,
    embedding: null,
    model: null,
  };
}

/** A VFS database file with an agent home, one asset, one wiki entity and one RAG passage. */
export function writeTestVfs(path: string, o: TestVfsOptions = {}): string {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  const vfs = new ShenronVfs(db);
  vfs.setMeta("profile", o.profile ?? "public");
  vfs.setMeta("generated_at", "2026-10-05T00:00:00.000Z");
  vfs.mkdirAll("/home");
  vfs.write("/home/SOUL.md", '---\nidentity: "Shenron"\ntone: "solennel"\n---\n', {
    visibility: "public",
  });
  vfs.mkdirAll("/assets");
  vfs.write("/assets/logo.txt", "logo du VFS", { visibility: "public" });
  if (o.private) vfs.write("/home/MEMORY.md", "mémoire privée", { visibility: "private" });
  if (o.embedded) vfs.index("/assets/planche.webp", { storage: "embedded", size: 3, sha256: null });
  writeWikiRows(db, [
    {
      category: "characters",
      id: 1,
      slug: "son-goku",
      search: "son goku saiyan",
      data: { id: 1, slug: "son-goku", name: "Son Goku" },
    },
  ]);
  const rag = createRagWriter(db, "none");
  rag.add(
    row("wiki:kamehameha#0", "Le Kamehameha est la technique de la tortue géniale."),
    "public",
  );
  if (o.private) rag.add(row("note:privee#0", "Note interne du Kamehameha."), "private");
  if (o.conversations)
    rag.add(row("conv:1#0", "Question sur le Kamehameha.", "conversations"), "public");
  rag.finish();
  db.close();
  return path;
}
