// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { applyVfsSchema } from "../src/vfs/schema";
import { exportPublicWikiRag } from "../src/vfs/public-wiki-rag";

test("public wiki snapshot becomes searchable without accessing protected stores", () => {
  const db = new Database(":memory:");
  try {
    applyVfsSchema(db);
    db.query("INSERT INTO vfs_meta VALUES ('profile', 'public')").run();
    const insert = db.query("INSERT INTO wiki_entities VALUES (?, ?, ?, ?, ?)");
    insert.run(
      "characters",
      1,
      "goku",
      "goku",
      JSON.stringify({ name: "Goku", biography: "Saiyan warrior" }),
    );
    insert.run(
      "characters",
      2,
      "hidden",
      "hidden",
      JSON.stringify({ name: "Hidden", visible: false }),
    );
    expect(exportPublicWikiRag(db)).toEqual({ docs: 1, chunks: 1 });
    expect(
      db.query("SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH 'Saiyan'").get(),
    ).toEqual({ n: 1 });
    expect(db.query("SELECT visibility FROM rag_doc_attrs").all()).toEqual([
      { visibility: "public" },
    ]);
    expect(exportPublicWikiRag(db)).toEqual({ docs: 1, chunks: 0 });
  } finally {
    db.close();
  }
});

test("rejects a private or unclassified snapshot", () => {
  const db = new Database(":memory:");
  try {
    applyVfsSchema(db);
    expect(() => exportPublicWikiRag(db)).toThrow("public VFS");
    db.query("INSERT INTO vfs_meta VALUES ('profile', 'complet')").run();
    expect(() => exportPublicWikiRag(db)).toThrow("public VFS");
  } finally {
    db.close();
  }
});
