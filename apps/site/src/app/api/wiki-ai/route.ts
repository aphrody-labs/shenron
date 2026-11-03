/**
 * /api/wiki-ai — source search and optional grounded editorial draft, admin only.
 *
 * Search returns retrieved passages and an extract draft. Explicit action=draft
 * uses the configured inference provider and the shared citation verifier.
 * Both paths return an unpublished draft for editorial review and insertion.
 */
import { isCurrentUserAdmin } from "@/lib/session";
import { dbUniverse } from "@/lib/db-universe";
import { NextRequest, NextResponse } from "next/server";
import { wikiAiRequestSchema } from "@/lib/wiki-editorial-contracts";
import { buildWikiExtractDraft, wikiSourceUrl } from "@/lib/wiki-ai-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}

function unavailable(error: string): NextResponse {
  return privateJson({ error }, { status: 503, headers: { "Retry-After": "30" } });
}

/** Nettoie un snippet RAG (retire les marqueurs de surbrillance FTS). */
function clean(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

export async function POST(req: NextRequest) {
  let isAdmin = false;
  try {
    isAdmin = await isCurrentUserAdmin();
  } catch (error) {
    console.error("[wiki-ai] admin lookup failed", error);
    return unavailable("auth_unavailable");
  }
  if (!isAdmin) {
    return privateJson({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = wikiAiRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "bad_request" }, { status: 400 });
  const { query, limit, entity, action, lang } = parsed.data;

  let rag: Awaited<ReturnType<typeof dbUniverse.rag>>;
  try {
    rag = await dbUniverse.rag(query, limit, entity ? { entity } : undefined);
  } catch (error) {
    console.error("[wiki-ai] RAG lookup failed", error);
    return unavailable("rag_unavailable");
  }
  if (rag === null) return unavailable("rag_unavailable");

  const results = rag.results.slice(0, limit).flatMap((r) => {
    const url = wikiSourceUrl(r.url);
    return url
      ? [
          {
            title: r.title,
            url,
            snippet: clean(r.snippet).slice(0, 4000),
            score: r.score ?? null,
            kind: r.kind,
          },
        ]
      : [];
  });

  const sources = results.filter((source) => source.url && source.snippet.length > 20);
  let markdown = buildWikiExtractDraft(sources);
  let draftKind: "extracts" | "generated" = "extracts";
  if (action === "draft" && sources.length > 0) {
    try {
      const { generateWikiDraft } = await import("@/lib/wiki-ai-generation");
      const generated = await generateWikiDraft({ query, sources, lang, signal: req.signal });
      if (generated) {
        markdown = generated;
        draftKind = "generated";
      }
    } catch (error) {
      console.error("[wiki-ai] draft generation failed", error);
      return unavailable("generation_unavailable");
    }
  }

  return privateJson({
    query,
    mode: rag?.mode ?? null,
    results,
    markdown: markdown.trim(),
    draftKind,
    reviewRequired: true,
  });
}
