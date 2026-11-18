#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Serverless migration & verification helper:
 * 1. Verifies Neon PostgreSQL core table row parity against a source Postgres URL.
 * 2. Streams precomputed 384-d embeddings + truncated metadata from Postgres into Cloudflare Vectorize.
 *
 * All credentials come strictly from environment variables (never hardcoded or printed).
 */
import { SQL } from "bun";

export const EXCLUDED_HEAVY_TABLES = [
  "shenron_compute.aphrody_shenron_vectors",
  "shenron_compute.aphrody_rag_documents",
  "public.external_source_records",
  "public.external_source_provenance",
  "public.wiki_revisions",
  "bot.action_logs",
  "public.site_events",
  "bot.backup_db_wiki_sections",
  "bot.backup_db_characters_full",
  "bot.backup_db_character_variants",
  "bot.backup_db_assets",
  "bot.backup_db_transformations",
] as const;

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: Record<string, string | number | boolean>;
}

export function buildVectorizeMetadata(row: {
  entity_id: string;
  title: string;
  url: string | null;
  content: string;
  corpus: string;
  metadata: Record<string, unknown> | null;
}): Record<string, string | number | boolean> {
  const meta = row.metadata ?? {};
  const kind = typeof meta.kind === "string" && meta.kind ? meta.kind : row.corpus || "canon";
  const out: Record<string, string | number | boolean> = {
    sourceId: row.entity_id.slice(0, 255),
    title: row.title.slice(0, 256),
    url: (row.url || "https://dragonballfr.com").slice(0, 512),
    snippet: row.content.slice(0, 600),
    content: row.content.slice(0, 1400),
    kind: kind.slice(0, 64),
  };
  if (typeof meta.lang === "string" && meta.lang) out.lang = meta.lang.slice(0, 16);
  if (typeof meta.originSourceId === "string" && meta.originSourceId) {
    out.originSourceId = meta.originSourceId.slice(0, 128);
  }
  if (typeof meta.entity === "string" && meta.entity) {
    out.entity = meta.entity.slice(0, 128);
  }
  return out;
}

export async function upsertVectorizeBatch(options: {
  accountId: string;
  indexName: string;
  apiToken: string;
  vectors: VectorRecord[];
  fetcher?: typeof fetch;
}): Promise<{ mutationId?: string; count: number }> {
  if (options.vectors.length === 0) return { count: 0 };
  const fetcher = options.fetcher ?? fetch;
  const ndjson = options.vectors.map((v) => JSON.stringify(v)).join("\n");
  const res = await fetcher(
    `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/vectorize/v2/indexes/${options.indexName}/upsert`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/x-ndjson",
      },
      body: ndjson,
    },
  );
  const body = (await res.json()) as {
    success?: boolean;
    result?: { mutationId?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !body.success) {
    throw new Error(
      `Vectorize upsert failed (${res.status}): ${(body.errors ?? []).map((e) => e.message).join("; ")}`,
    );
  }
  return { mutationId: body.result?.mutationId, count: options.vectors.length };
}

async function verifyParity(sourceUrl: string, targetUrl: string) {
  const src = new SQL(sourceUrl);
  const dst = new SQL(targetUrl);
  try {
    const query = `
      SELECT
        (SELECT count(*) FROM public."User")::int AS users,
        (SELECT count(*) FROM public.ba_user)::int AS ba_users,
        (SELECT count(*) FROM public."Post")::int AS posts,
        (SELECT count(*) FROM public."WikiPage")::int AS wikipages,
        (SELECT count(*) FROM bot.db_characters)::int AS chars,
        (SELECT count(*) FROM bot.db_episodes)::int AS episodes,
        (SELECT count(*) FROM bot.db_databooks)::int AS databooks,
        (SELECT count(*) FROM bot.db_manga_chapters)::int AS manga_chapters,
        (SELECT count(*) FROM bot.db_manga_pages)::int AS manga_pages
    `;
    const [a, b] = await Promise.all([src.unsafe(query), dst.unsafe(query)]);
    console.log(
      JSON.stringify(
        { source: a[0], target: b[0], equal: JSON.stringify(a[0]) === JSON.stringify(b[0]) },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([src.close(), dst.close()]);
  }
}

if (import.meta.main) {
  const mode = process.argv[2] ?? "--help";
  if (mode === "--verify-parity") {
    const src = process.env.SOURCE_DATABASE_URL;
    const dst = process.env.TARGET_DATABASE_URL;
    if (!src || !dst) throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
    await verifyParity(src, dst);
  } else {
    console.log("Usage: bun scripts/deploy/migrate-to-cloud.ts --verify-parity");
  }
}
