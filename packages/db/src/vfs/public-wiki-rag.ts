// SPDX-License-Identifier: Apache-2.0
import type { Database } from "bun:sqlite";
import { DEFAULT_PUBLIC_ORIGINS } from "@shenron/config/public-urls";
import { createRagWriter } from "./build";

/** Index only the public wiki snapshot already selected by the public read repository. */
export function exportPublicWikiRag(db: Database): { docs: number; chunks: number } {
  if (
    (db.query("SELECT value FROM vfs_meta WHERE key = 'profile'").get() as { value: string } | null)
      ?.value !== "public"
  ) {
    throw new Error("Wiki-derived public RAG requires a public VFS snapshot");
  }
  const writer = createRagWriter(db, "none");
  try {
    const rows = db.query(
      "SELECT category, id, slug, search, data FROM wiki_entities ORDER BY category, id",
    );
    for (const row of rows.iterate() as Iterable<{
      category: string;
      id: number;
      slug: string | null;
      search: string;
      data: string;
    }>) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (data.visible === false) continue;
      const title = [data.nameFr, data.name, data.titleFr, data.title, row.slug, row.search].find(
        (value) => typeof value === "string" && value.trim(),
      ) as string | undefined;
      // Snapshot fields have already passed the public wiki repository's column policy.
      const content = Object.entries(data)
        .filter(([, value]) => typeof value === "string" && value.trim())
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
      if (!content.trim()) continue;
      for (let offset = 0, chunk = 0; offset < content.length; offset += 1400, chunk++) {
        writer.add(
          {
            corpus: "wiki",
            entity_id: `shenron:public-wiki:${row.category}:${row.id}:${chunk}`,
            title: title ?? `${row.category} ${row.id}`,
            url: `${DEFAULT_PUBLIC_ORIGINS.site}/api/public/wiki/${encodeURIComponent(row.category)}/${encodeURIComponent(row.slug ?? String(row.id))}`,
            content: content.slice(offset, offset + 1400),
            metadata: { kind: "wiki", lang: "fr", originSourceId: "wiki_pages" },
            updated_at: null,
            embedding: null,
            model: null,
          },
          "public",
        );
      }
    }
  } finally {
    writer.finish();
  }
  return { docs: writer.docs, chunks: writer.chunks };
}
