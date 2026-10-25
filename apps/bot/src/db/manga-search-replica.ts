// SPDX-License-Identifier: Apache-2.0
/** Canonical public manga snapshot and atomic SQLite search replica. */
import { Database } from "bun:sqlite";
import type { SQL } from "bun";
import {
  auditMangaIndex,
  rebuildMangaIndex,
} from "../../../../scripts/ops/rebuild-bot-manga-search";

export interface MangaTranscriptRow {
  id: number;
  series: string;
  tome: string;
  planche: number;
  lines: string;
  text: string;
  lang: string;
  has_ja: number;
  line_count: number;
  char_count: number;
}

// Mirrors the reader's OCR edition addressing, restricted to visible publications.
export const PUBLIC_MANGA_SCOPE = `EXISTS (
  SELECT 1 FROM bot.db_manga_chapters c WHERE c.visible IS TRUE AND c.series = p.series
  AND ((p.series = 'DBS' AND p.tome = 'ch' || c.id::text)
    OR (p.series IN ('DB','DBKZ','SOSH','DB_SOSH','DBJP','DBZ_ANIME_COMICS','DB_MOVIES','ARALE')
      AND p.tome = 'vol' || c.chapter_number::text))
)`;

export function validateMangaSnapshot(
  rows: readonly MangaTranscriptRow[],
  expectedCount: number,
): void {
  if (!Number.isSafeInteger(expectedCount) || expectedCount <= 0 || rows.length !== expectedCount) {
    throw new Error("Empty or partial PostgreSQL manga snapshot");
  }
  const identities = new Set<string>();
  const ids = new Set<number>();
  for (const row of rows) {
    let lines: unknown;
    try {
      lines = JSON.parse(row.lines);
    } catch {
      throw new Error("Invalid source transcription lines");
    }
    if (
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      ids.has(row.id) ||
      !Number.isSafeInteger(row.planche) ||
      row.planche < 0 ||
      [row.series, row.tome, row.text, row.lang].some(
        (value) => typeof value !== "string" || !value.trim(),
      ) ||
      !Array.isArray(lines) ||
      lines.length === 0 ||
      lines.some((line) => typeof line !== "string") ||
      ![0, 1].includes(row.has_ja) ||
      !Number.isSafeInteger(row.line_count) ||
      row.line_count <= 0 ||
      !Number.isSafeInteger(row.char_count) ||
      row.char_count <= 0
    ) {
      throw new Error("Incomplete PostgreSQL manga page");
    }
    const key = JSON.stringify([row.series, row.tome, row.planche]);
    if (identities.has(key)) throw new Error("Duplicate PostgreSQL manga page identity");
    ids.add(row.id);
    identities.add(key);
  }
}

export function syncMangaSnapshot(
  db: Database,
  rows: readonly MangaTranscriptRow[],
  expectedCount: number,
) {
  validateMangaSnapshot(rows, expectedCount);
  db.exec("BEGIN IMMEDIATE");
  try {
    // Local IDs, additional fields and out-of-scope rows belong to this replica.
    const upsert = db.query(`INSERT INTO db_manga_pages
      (series,tome,planche,lines,text,lang,has_ja,line_count,char_count)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(series,tome,planche) DO UPDATE SET
      lines=excluded.lines,text=excluded.text,lang=excluded.lang,has_ja=excluded.has_ja,
      line_count=excluded.line_count,char_count=excluded.char_count`);
    const read = db.query<
      MangaTranscriptRow,
      [string, string, number]
    >(`SELECT id,series,tome,planche,lines,text,lang,has_ja,line_count,char_count
      FROM db_manga_pages WHERE series=? AND tome=? AND planche=?`);
    const pageIds: number[] = [];
    const localPages: MangaTranscriptRow[] = [];
    let writtenPages = 0;
    for (const row of rows) {
      const previous = read.get(row.series, row.tome, row.planche);
      const differs =
        !previous ||
        Object.keys(row)
          .filter((key) => key !== "id")
          .some(
            (key) =>
              previous[key as keyof MangaTranscriptRow] !== row[key as keyof MangaTranscriptRow],
          );
      const values = [
        row.series,
        row.tome,
        row.planche,
        row.lines,
        row.text,
        row.lang,
        row.has_ja,
        row.line_count,
        row.char_count,
      ] as const;
      if (differs) {
        upsert.run(...values);
        writtenPages++;
      }
      const local = read.get(row.series, row.tome, row.planche);
      if (
        !local ||
        Object.keys(row)
          .filter((key) => key !== "id")
          .some(
            (key) =>
              local[key as keyof MangaTranscriptRow] !== row[key as keyof MangaTranscriptRow],
          )
      ) {
        throw new Error("Replica transcription content differs from source snapshot");
      }
      pageIds.push(local.id);
      localPages.push(local);
    }
    const snapshot = auditMangaIndex(db, pageIds);
    if (snapshot.sourcePages !== expectedCount)
      throw new Error("Replica public scope is incomplete");
    let indexedChangedPages = 0;
    let removedIndexPages = 0;
    if (!snapshot.indexExists) {
      rebuildMangaIndex(db, snapshot, pageIds);
      indexedChangedPages = localPages.length;
    } else if (!snapshot.healthy) {
      // Membership always comes from the complete public snapshot, never from only changed rows.
      const scope = JSON.stringify(pageIds);
      removedIndexPages = db
        .query<{ count: number }, [string]>(
          "SELECT count(*) AS count FROM manga_pages_fts WHERE rowid NOT IN (SELECT value FROM json_each(?))",
        )
        .get(scope)!.count;
      if (removedIndexPages)
        db.query(
          "DELETE FROM manga_pages_fts WHERE rowid NOT IN (SELECT value FROM json_each(?))",
        ).run(scope);
      const indexed = db.query<
        Pick<MangaTranscriptRow, "text" | "series" | "tome" | "planche" | "lang">,
        [number]
      >("SELECT text,series,tome,planche,lang FROM manga_pages_fts WHERE rowid=?");
      const remove = db.query("DELETE FROM manga_pages_fts WHERE rowid=?");
      const insert = db.query(
        "INSERT INTO manga_pages_fts(rowid,text,series,tome,planche,lang) VALUES(?,?,?,?,?,?)",
      );
      for (const row of localPages) {
        const current = indexed.get(row.id);
        if (
          current &&
          current.text === row.text &&
          current.series === row.series &&
          current.tome === row.tome &&
          Number(current.planche) === row.planche &&
          current.lang === row.lang
        )
          continue;
        if (current) remove.run(row.id);
        insert.run(row.id, row.text, row.series, row.tome, row.planche, row.lang);
        indexedChangedPages++;
      }
      db.exec("INSERT INTO manga_pages_fts(manga_pages_fts) VALUES('integrity-check')");
    }
    const index = auditMangaIndex(db, pageIds);
    if (!index.healthy || index.sourceSha256 !== snapshot.sourceSha256)
      throw new Error("Incremental FTS content or source validation failed");
    db.exec("COMMIT");
    return {
      replicatedPages: rows.length,
      writtenPages,
      unchangedPages: rows.length - writtenPages,
      indexedChangedPages,
      removedIndexPages,
      ...index,
    };
  } catch (error) {
    try {
      if (db.inTransaction) db.exec("ROLLBACK");
    } catch {
      // SQLite may already have rolled back (for example SQLITE_FULL); retain the original failure.
    }
    throw error;
  }
}

export async function readPublicMangaSnapshot(sql: SQL) {
  return sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    const counts = await tx.unsafe(
      `SELECT count(*)::text AS count FROM bot.db_manga_pages p WHERE ${PUBLIC_MANGA_SCOPE}`,
    );
    const raw =
      await tx.unsafe(`SELECT p.id,p.series,p.tome,p.planche,p.lines,p.text,p.lang,p.has_ja,p.line_count,p.char_count
      FROM bot.db_manga_pages p WHERE ${PUBLIC_MANGA_SCOPE} ORDER BY p.series,p.tome,p.planche`);
    const rows = raw.map((row: Record<string, unknown>) => ({
      series: row.series,
      tome: row.tome,
      lines: typeof row.lines === "string" ? row.lines : JSON.stringify(row.lines),
      text: row.text,
      lang: row.lang,
      id: Number(row.id),
      planche: row.planche == null ? Number.NaN : Number(row.planche),
      has_ja: row.has_ja == null ? Number.NaN : Number(row.has_ja),
      line_count: Number(row.line_count),
      char_count: Number(row.char_count),
    })) as MangaTranscriptRow[];
    const expectedCount = Number(counts[0]?.count);
    validateMangaSnapshot(rows, expectedCount);
    return { rows, expectedCount };
  });
}
