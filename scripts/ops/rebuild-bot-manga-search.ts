#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";

interface SourcePage {
  id: number;
  series: string;
  tome: string;
  planche: number;
  text: string;
  lang: string;
}

export interface MangaIndexAudit {
  sourcePages: number;
  sourceSha256: string;
  indexExists: boolean;
  indexedPages: number | null;
  matchingPages: number | null;
  healthy: boolean;
}

function readSource(db: Database, pageIds?: readonly number[]): SourcePage[] {
  if (
    pageIds &&
    (pageIds.length === 0 ||
      new Set(pageIds).size !== pageIds.length ||
      pageIds.some((id) => !Number.isSafeInteger(id) || id <= 0))
  ) {
    throw new Error("Invalid public page scope");
  }
  const pages = db
    .query<SourcePage, [string | null]>(
      `SELECT id, series, tome, planche, text, lang FROM db_manga_pages
       WHERE (?1 IS NULL OR id IN (SELECT value FROM json_each(?1))) ORDER BY id`,
    )
    .all(pageIds ? JSON.stringify(pageIds) : null);
  if (pageIds && pages.length !== pageIds.length)
    throw new Error("Public page scope is incomplete");
  if (pages.length === 0) throw new Error("Empty manga corpus: replication is required first");
  const identities = new Set<string>();
  const ids = new Set<number>();
  for (const page of pages) {
    if (
      !Number.isSafeInteger(page.id) ||
      page.id <= 0 ||
      ids.has(page.id) ||
      !Number.isSafeInteger(page.planche) ||
      page.planche < 0 ||
      [page.series, page.tome, page.text, page.lang].some(
        (value) => typeof value !== "string" || value.trim().length === 0,
      )
    )
      throw new Error("Incomplete manga corpus: invalid or empty source page");
    const identity = JSON.stringify([page.series, page.tome, page.planche]);
    if (identities.has(identity))
      throw new Error("Incomplete manga corpus: duplicate page identity");
    identities.add(identity);
    ids.add(page.id);
  }
  return pages;
}

export function auditMangaIndex(db: Database, pageIds?: readonly number[]): MangaIndexAudit {
  const pages = readSource(db, pageIds);
  const sourceSha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(pages)).digest("hex");
  const indexExists = !!db
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'manga_pages_fts'")
    .get();
  let indexedPages: number | null = null;
  let matchingPages: number | null = null;
  if (indexExists) {
    indexedPages = db
      .query<{ count: number }, []>("SELECT count(*) AS count FROM manga_pages_fts")
      .get()!.count;
    matchingPages = db
      .query<{ count: number }, [string | null]>(`
      SELECT count(*) AS count FROM db_manga_pages p JOIN manga_pages_fts f ON f.rowid = p.id
      WHERE f.text IS p.text AND f.series IS p.series AND f.tome IS p.tome
        AND CAST(f.planche AS INTEGER) = p.planche AND f.lang IS p.lang
        AND (?1 IS NULL OR p.id IN (SELECT value FROM json_each(?1)))
    `)
      .get(pageIds ? JSON.stringify(pageIds) : null)!.count;
  }
  return {
    sourcePages: pages.length,
    sourceSha256,
    indexExists,
    indexedPages,
    matchingPages,
    healthy: indexedPages === pages.length && matchingPages === pages.length,
  };
}

export function rebuildMangaIndex(
  db: Database,
  expected: { sourcePages: number; sourceSha256: string },
  pageIds?: readonly number[],
): MangaIndexAudit {
  if (
    !Number.isSafeInteger(expected.sourcePages) ||
    expected.sourcePages <= 0 ||
    !/^[a-f0-9]{64}$/.test(expected.sourceSha256)
  )
    throw new Error("Invalid expected source snapshot");
  const nested = db.inTransaction;
  db.exec(nested ? "SAVEPOINT manga_search_rebuild" : "BEGIN IMMEDIATE");
  try {
    const before = auditMangaIndex(db, pageIds);
    if (
      before.sourcePages !== expected.sourcePages ||
      before.sourceSha256 !== expected.sourceSha256
    ) {
      throw new Error("Source snapshot differs from the reviewed authoritative corpus");
    }
    db.exec(`
      DROP TABLE IF EXISTS manga_pages_fts;
      CREATE VIRTUAL TABLE manga_pages_fts USING fts5(
        text, series UNINDEXED, tome UNINDEXED, planche UNINDEXED, lang UNINDEXED,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    db.query(`INSERT INTO manga_pages_fts(rowid, text, series, tome, planche, lang)
      SELECT id, text, series, tome, planche, lang FROM db_manga_pages
      WHERE (?1 IS NULL OR id IN (SELECT value FROM json_each(?1)))`).run(
      pageIds ? JSON.stringify(pageIds) : null,
    );
    db.exec("INSERT INTO manga_pages_fts(manga_pages_fts) VALUES('integrity-check')");
    const after = auditMangaIndex(db, pageIds);
    if (!after.healthy || after.sourceSha256 !== before.sourceSha256) {
      throw new Error("FTS content or source identity validation failed");
    }
    db.exec(nested ? "RELEASE manga_search_rebuild" : "COMMIT");
    return after;
  } catch (error) {
    try {
      if (db.inTransaction)
        db.exec(
          nested ? "ROLLBACK TO manga_search_rebuild; RELEASE manga_search_rebuild" : "ROLLBACK",
        );
    } catch {
      // Cleanup must never replace the original failure, including an automatic SQLite rollback.
    }
    throw error;
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const path = value("--db");
  if (!path || !(await Bun.file(path).exists())) {
    throw new Error("Provide --db with an existing SQLite replica; no database is created");
  }
  const apply = args.includes("--apply");
  const scopePath = value("--public-scope");
  if (apply && !scopePath) throw new Error("--apply requires a reviewed --public-scope manifest");
  const pageIds = scopePath ? (await Bun.file(scopePath).json()).pageIds : undefined;
  if (scopePath && !Array.isArray(pageIds))
    throw new Error("Public scope manifest requires pageIds");
  const db = new Database(path, { readonly: !apply, strict: true });
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    const result = apply
      ? rebuildMangaIndex(
          db,
          {
            sourcePages: Number(value("--expected-pages")),
            sourceSha256: value("--expected-sha") ?? "",
          },
          pageIds,
        )
      : auditMangaIndex(db, pageIds);
    console.log(JSON.stringify({ mode: apply ? "rebuilt" : "read-only", ...result }, null, 2));
  } finally {
    db.close();
  }
}
