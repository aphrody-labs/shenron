// SPDX-License-Identifier: Apache-2.0
/**
 * Public wiki read port over the `wiki_categories` / `wiki_entities` tables of a VFS database:
 * the same contract as `createWikiReadRepository` (`@shenron/db/repos/wiki`), so the public
 * API (`WikiReadPort` of `@shenron/api/server`) runs offline in the desktop and in the
 * compiled binaries. Rows are the visible rows exported at build time, `visible` and the
 * other omitted columns already stripped. Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { WIKI_CATEGORIES, type WikiCategoryName } from "../constants";
import { WIKI_LIST_DEFAULT_LIMIT, WIKI_LIST_MAX_LIMIT } from "../repos/wiki";

export interface VfsWikiRow {
  category: WikiCategoryName;
  id: number;
  slug: string | null;
  /** Lowercased concatenation of the category's search columns. */
  search: string;
  data: Record<string, unknown>;
}

function clamp(limit: number): number {
  if (!Number.isFinite(limit)) return WIKI_LIST_DEFAULT_LIMIT;
  return Math.min(WIKI_LIST_MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function createVfsWikiReadPort(db: Database) {
  return {
    async categories(): Promise<{ name: WikiCategoryName; label: string; total: number }[]> {
      const totals = new Map(
        (
          db.query("SELECT name, total FROM wiki_categories").all() as {
            name: string;
            total: number;
          }[]
        ).map((row) => [row.name, row.total]),
      );
      return WIKI_CATEGORIES.map(({ name, label }) => ({
        name,
        label,
        total: totals.get(name) ?? 0,
      }));
    },
    async list(input: {
      category: WikiCategoryName;
      limit: number;
      offset: number;
      q?: string;
    }): Promise<{ items: Record<string, unknown>[]; total: number }> {
      const q = input.q?.trim().toLowerCase();
      const where = q ? "category = ? AND search LIKE ? ESCAPE '\\'" : "category = ?";
      const params = q ? [input.category, `%${escapeLike(q)}%`] : [input.category];
      const total = (
        db.query(`SELECT COUNT(*) AS n FROM wiki_entities WHERE ${where}`).get(...params) as {
          n: number;
        }
      ).n;
      const rows = db
        .query(`SELECT data FROM wiki_entities WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`)
        .all(...params, clamp(input.limit), Math.max(0, Math.trunc(input.offset) || 0)) as {
        data: string;
      }[];
      return { items: rows.map((row) => JSON.parse(row.data) as Record<string, unknown>), total };
    },
    async get(input: {
      category: WikiCategoryName;
      idOrSlug: string;
    }): Promise<Record<string, unknown> | null> {
      const key = input.idOrSlug.trim();
      const row = (
        /^\d+$/.test(key)
          ? db
              .query("SELECT data FROM wiki_entities WHERE category = ? AND id = ?")
              .get(input.category, Number(key))
          : key
            ? db
                .query("SELECT data FROM wiki_entities WHERE category = ? AND slug = ?")
                .get(input.category, key)
            : null
      ) as { data: string } | null;
      return row ? (JSON.parse(row.data) as Record<string, unknown>) : null;
    },
  };
}

export type VfsWikiReadPort = ReturnType<typeof createVfsWikiReadPort>;

/** Insert or replace exported wiki rows and refresh the category totals. */
export function writeWikiRows(db: Database, rows: Iterable<VfsWikiRow>): number {
  const insert = db.query(
    `INSERT INTO wiki_entities (category, id, slug, search, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(category, id) DO UPDATE SET slug = excluded.slug, search = excluded.search, data = excluded.data`,
  );
  let written = 0;
  db.transaction(() => {
    for (const row of rows) {
      insert.run(row.category, row.id, row.slug, row.search, JSON.stringify(row.data));
      written++;
    }
    db.exec("DELETE FROM wiki_categories");
    const label = new Map(WIKI_CATEGORIES.map((c) => [c.name as string, c.label]));
    for (const r of db
      .query("SELECT category, COUNT(*) AS n FROM wiki_entities GROUP BY category")
      .all() as {
      category: string;
      n: number;
    }[]) {
      db.query("INSERT INTO wiki_categories (name, label, total) VALUES (?, ?, ?)").run(
        r.category,
        label.get(r.category) ?? r.category,
        r.n,
      );
    }
  })();
  return written;
}
