// SPDX-License-Identifier: Apache-2.0
/**
 * Cloudflare Worker AI + Vectorize + MCP edge server for Shenron (`ai.dragonballfr.com`).
 * Replaces VPS `shenron-embed` (127.0.0.1:8085), `shenron-chat` (127.0.0.1:8799), and `shenron-compute`.
 */

export interface WorkersAiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorizeBinding {
  query(
    vector: number[],
    options?: {
      topK?: number;
      filter?: Record<string, unknown>;
      returnMetadata?: "none" | "indexed" | "all";
    },
  ): Promise<{ matches: VectorizeMatch[] }>;
  upsert(
    vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>,
  ): Promise<{ mutationId?: string }>;
  describe?(): Promise<{ vectorCount?: number; vectorsCount?: number }>;
  getByIds?(ids: string[]): Promise<Array<{ id: string; metadata?: Record<string, unknown> }>>;
}

export interface AiWorkerEnv {
  AI: WorkersAiBinding;
  RAG_INDEX?: VectorizeBinding;
  RAG_INDEX_M3?: VectorizeBinding;
  SHENRON_AI_HTTP_TOKEN?: string;
  EMBED_MODEL?: string;
  RAG_EMBED_MODEL?: string;
  CHAT_MODEL?: string;
}

const DEFAULT_EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";
const DEFAULT_RAG_EMBED_MODEL = "@cf/baai/bge-m3";
const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function activeRag(env: AiWorkerEnv): {
  index: VectorizeBinding | undefined;
  model: string;
} {
  if (env.RAG_INDEX_M3) {
    return { index: env.RAG_INDEX_M3, model: env.RAG_EMBED_MODEL || DEFAULT_RAG_EMBED_MODEL };
  }
  return { index: env.RAG_INDEX, model: env.EMBED_MODEL || DEFAULT_EMBED_MODEL };
}

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function timingSafeTokenEqual(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const subtle = crypto.subtle as unknown as {
    timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  let diff = viewA.length ^ viewB.length;
  for (let i = 0; i < viewA.length; i += 1) diff |= viewA[i]! ^ viewB[i]!;
  return diff === 0;
}

async function authorized(request: Request, env: AiWorkerEnv): Promise<boolean> {
  const token = env.SHENRON_AI_HTTP_TOKEN?.trim();
  if (!token) return true;
  const auth = request.headers.get("Authorization")?.trim() ?? "";
  return await timingSafeTokenEqual(auth, `Bearer ${token}`);
}

function extractChatContent(out: {
  response?: string;
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
}): string {
  const msg = out.choices?.[0]?.message;
  return (msg?.content || out.response || msg?.reasoning_content || "").trim();
}

function resolveWorkerChatModel(requested: unknown, env: AiWorkerEnv): string {
  if (typeof requested === "string" && requested.startsWith("@cf/")) return requested;
  return env.CHAT_MODEL || DEFAULT_CHAT_MODEL;
}

function buildMetadataFilter(params: {
  kind?: string | null;
  lang?: string | null;
  originSourceId?: string | null;
}): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};
  if (params.kind?.trim()) filter.kind = params.kind.trim();
  if (params.lang?.trim()) filter.lang = params.lang.trim();
  if (params.originSourceId?.trim()) filter.originSourceId = params.originSourceId.trim();
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function formatRagHit(match: VectorizeMatch) {
  const meta = match.metadata ?? {};
  const snippet = String(meta.snippet ?? meta.content ?? "");
  return {
    id: match.id,
    sourceId: typeof meta.sourceId === "string" ? meta.sourceId : match.id,
    title: typeof meta.title === "string" ? meta.title : "Shenron",
    url: typeof meta.url === "string" ? meta.url : "https://dragonballfr.com",
    snippet,
    content: typeof meta.content === "string" ? meta.content : snippet,
    score: match.score,
    kind: typeof meta.kind === "string" ? meta.kind : "canon",
    lang: typeof meta.lang === "string" ? meta.lang : null,
    originSourceId: typeof meta.originSourceId === "string" ? meta.originSourceId : null,
    entity: typeof meta.entity === "string" ? meta.entity : null,
  };
}

async function runRagSearch(
  env: AiWorkerEnv,
  input: {
    q: string;
    limit?: number;
    kind?: string | null;
    lang?: string | null;
    originSourceId?: string | null;
  },
): Promise<{ q: string; mode: "hybrid"; results: ReturnType<typeof formatRagHit>[] }> {
  const query = input.q.trim();
  const { index, model } = activeRag(env);
  if (!query || !index) return { q: query, mode: "hybrid", results: [] };
  const topK = Math.min(20, Math.max(1, Number(input.limit ?? 6) || 6));
  const text = model.includes("e5") ? `query: ${query}` : query;
  const embedded = (await env.AI.run(model, { text: [text] })) as { data?: number[][] };
  const vector = embedded.data?.[0];
  if (!vector) return { q: query, mode: "hybrid", results: [] };
  const filter = buildMetadataFilter(input);
  let matches: { matches: VectorizeMatch[] };
  try {
    matches = await index.query(vector, {
      topK,
      returnMetadata: "all",
      ...(filter ? { filter } : {}),
    });
  } catch {
    matches = filter ? await index.query(vector, { topK, returnMetadata: "all" }) : { matches: [] };
  }
  return { q: query, mode: "hybrid", results: matches.matches.map(formatRagHit) };
}

export async function handleAiWorker(request: Request, env: AiWorkerEnv): Promise<Response> {
  try {
    return await handleAiWorkerInner(request, env);
  } catch (err) {
    return json(
      { error: "worker_error", detail: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}

async function handleAiWorkerInner(request: Request, env: AiWorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  const url = new URL(request.url);
  const { index: ragIndex, model: ragEmbedModel } = activeRag(env);
  if (
    url.pathname === "/health" ||
    url.pathname === "/api/health" ||
    url.pathname === "/api/v1/shenron/health"
  ) {
    return json({
      status: "ok",
      capabilities: { rag: Boolean(ragIndex), llm: true, ocr: false },
      service: "shenron-ai",
      runtime: "cloudflare-workers",
      embedModel: env.EMBED_MODEL || DEFAULT_EMBED_MODEL,
      ragEmbedModel,
      chatModel: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
      vectorize: Boolean(ragIndex),
    });
  }
  if (url.pathname === "/.well-known/mcp.json") {
    return json({
      name: "shenron-edge-mcp",
      version: "1.4.5",
      transport: { type: "streamable-http", url: `${url.origin}/mcp` },
      capabilities: { tools: true },
    });
  }
  if (!(await authorized(request, env))) {
    return json({ error: "unauthorized" }, 401);
  }

  if (request.method === "GET" && url.pathname === "/api/v1/shenron/rag/search") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    const q = url.searchParams.get("q") ?? "";
    const limit = Number(url.searchParams.get("limit") ?? 6) || 6;
    return json(
      await runRagSearch(env, {
        q,
        limit,
        kind: url.searchParams.get("kind"),
        lang: url.searchParams.get("lang"),
        originSourceId: url.searchParams.get("sourceId"),
      }),
    );
  }

  if (request.method === "GET" && url.pathname === "/api/v1/shenron/rag/stats") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    const info = (await ragIndex.describe?.()) ?? {};
    const count = Number(info.vectorsCount ?? info.vectorCount ?? 0);
    return json({ chunks: count, vectors: count, vectorsStored: count });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/shenron/rag/document") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    const sourceId = url.searchParams.get("sourceId")?.trim() ?? "";
    if (!sourceId) return json({ error: "missing_source_id" }, 400);
    const found = (await ragIndex.getByIds?.([sourceId])) ?? [];
    const hit = found[0];
    if (!hit) return json({ error: "not_found" }, 404);
    const formatted = formatRagHit({ id: hit.id, score: 1, metadata: hit.metadata });
    return json({ document: formatted });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (url.pathname === "/v1/embeddings") {
    const raw = payload.input;
    const text = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")];
    const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
    const out = (await env.AI.run(model, { text })) as { data?: number[][] };
    const vectors = out.data ?? [];
    return json({
      object: "list",
      model,
      data: vectors.map((embedding, index) => ({ object: "embedding", index, embedding })),
    });
  }

  if (url.pathname === "/api/v1/shenron/embed") {
    const texts = Array.isArray(payload.texts) ? payload.texts.map(String) : [];
    const prefix = payload.kind === "query" ? "query: " : "passage: ";
    const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
    const prefixed = texts.map((t) => `${prefix}${t}`.slice(0, 8192));
    const out = prefixed.length
      ? ((await env.AI.run(model, { text: prefixed })) as { data?: number[][] })
      : { data: [] };
    return json({ vectors: out.data ?? [], model });
  }

  if (url.pathname === "/v1/chat/completions") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const model = resolveWorkerChatModel(payload.model, env);
    const out = (await env.AI.run(model, {
      messages,
      max_tokens: typeof payload.max_tokens === "number" ? payload.max_tokens : 1024,
      temperature: typeof payload.temperature === "number" ? payload.temperature : 0.3,
    })) as { response?: string; choices?: Array<{ message?: { content?: string } }> };
    const content = extractChatContent(out);
    return json({
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    });
  }

  if (url.pathname === "/api/v1/shenron/llm/chat") {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const model = resolveWorkerChatModel(payload.model, env);
    const out = (await env.AI.run(model, {
      messages,
      max_tokens: typeof payload.maxOutputTokens === "number" ? payload.maxOutputTokens : 1024,
      temperature: 0.3,
    })) as { response?: string; choices?: Array<{ message?: { content?: string } }> };
    return json({ answer: extractChatContent(out), model });
  }

  if (url.pathname === "/api/v1/shenron/rag/search") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    return json(
      await runRagSearch(env, {
        q: String(payload.query ?? payload.q ?? ""),
        limit: Number(payload.limit ?? 6) || 6,
        kind: typeof payload.kind === "string" ? payload.kind : null,
        lang: typeof payload.lang === "string" ? payload.lang : null,
        originSourceId: typeof payload.sourceId === "string" ? payload.sourceId : null,
      }),
    );
  }

  if (url.pathname === "/api/v1/shenron/rag/ingest") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    const sourceId = String(payload.sourceId ?? "").trim();
    const title = String(payload.title ?? "").trim();
    const urlStr = String(payload.url ?? "https://dragonballfr.com").trim();
    const content = String(payload.content ?? "");
    if (!sourceId || !title || !content.trim()) return json({ error: "invalid_document" }, 400);
    const prefix = ragEmbedModel.includes("e5") ? "passage: " : "";
    const text = `${prefix}${title}\n${content}`.slice(0, 8192);
    const embedded = (await env.AI.run(ragEmbedModel, {
      text: [text],
    })) as { data?: number[][] };
    const values = embedded.data?.[0] ?? [];
    if (values.length === 0) return json({ error: "embed_unavailable" }, 503);
    await ragIndex.upsert([
      {
        id: sourceId.slice(0, 64),
        values,
        metadata: {
          sourceId,
          title,
          url: urlStr,
          snippet: content.slice(0, 800),
          content: content.slice(0, 1500),
          kind: typeof payload.kind === "string" ? payload.kind : "canon",
          ...(typeof payload.lang === "string" ? { lang: payload.lang } : {}),
          ...(typeof payload.originSourceId === "string"
            ? { originSourceId: payload.originSourceId }
            : {}),
          ...(typeof payload.entity === "string" ? { entity: payload.entity } : {}),
        },
      },
    ]);
    return json({
      id: sourceId,
      sourceId,
      indexed: true,
      vectorIndexed: true,
      retrieval: "hybrid",
    });
  }

  if (url.pathname === "/api/v1/shenron/rag/upsert") {
    if (!ragIndex) return json({ error: "vectorize_not_bound" }, 503);
    const items = Array.isArray(payload.items)
      ? (payload.items as Array<{ id: string; text: string; metadata?: Record<string, unknown> }>)
      : [];
    if (items.length === 0) return json({ upserted: 0 });
    const prefix = ragEmbedModel.includes("e5") ? "passage: " : "";
    const embedded = (await env.AI.run(ragEmbedModel, {
      text: items.map((item) => `${prefix}${item.text}`.slice(0, 8192)),
    })) as { data?: number[][] };
    const vectors = items
      .map((item, idx) => ({
        id: item.id,
        values: embedded.data?.[idx] ?? [],
        metadata: item.metadata ?? {},
      }))
      .filter((v) => v.values.length > 0);
    const result = await ragIndex.upsert(vectors);
    return json({ upserted: vectors.length, mutationId: result.mutationId ?? null });
  }

  if (url.pathname === "/mcp") {
    const rpcId = payload.id ?? null;
    const method = String(payload.method ?? "");
    if (method === "initialize") {
      return json({
        jsonrpc: "2.0",
        id: rpcId,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "shenron-edge-mcp", version: "1.4.5" },
        },
      });
    }
    if (method === "tools/list") {
      return json({
        jsonrpc: "2.0",
        id: rpcId,
        result: {
          tools: [
            {
              name: "shenron_rag_search",
              description: "Search Shenron Dragon Ball knowledge base via Cloudflare Vectorize",
              inputSchema: {
                type: "object",
                properties: { query: { type: "string" }, limit: { type: "number" } },
                required: ["query"],
              },
            },
          ],
        },
      });
    }
    if (method === "tools/call") {
      const params = (payload.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      if (params.name === "shenron_rag_search") {
        if (!ragIndex) {
          return json({
            jsonrpc: "2.0",
            id: rpcId,
            result: { content: [{ type: "text", text: "Vectorize unavailable" }] },
          });
        }
        const query = String(params.arguments?.query ?? "").trim();
        const topK = Math.min(10, Math.max(1, Number(params.arguments?.limit ?? 5) || 5));
        const res = await runRagSearch(env, { q: query, limit: topK });
        return json({
          jsonrpc: "2.0",
          id: rpcId,
          result: { content: [{ type: "text", text: JSON.stringify(res.results) }] },
        });
      }
    }
    return json(
      { jsonrpc: "2.0", id: rpcId, error: { code: -32601, message: "Method not found" } },
      404,
    );
  }

  return json({ error: "not_found" }, 404);
}

export default {
  fetch(request: Request, env: AiWorkerEnv): Promise<Response> {
    return handleAiWorker(request, env);
  },
};
