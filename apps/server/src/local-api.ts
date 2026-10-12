// SPDX-License-Identifier: Apache-2.0
/**
 * Local APIs of the Shenron server, answered by Bun before the front app:
 *
 *   GET /api/local/health                 liveness, profile, version, capabilities and the
 *                                         availability of each API group (`LocalHealthResponse`
 *                                         of `@aphrody/shenron-api/contract`)
 *   /api/local/koharu/*                   the editor engine of a browser on this machine
 *                                         (./koharu.ts), when the server has one
 *   GET /v1/models, POST /v1/chat/completions
 *                                         loopback-only OpenAI-compatible local chat model
 *   GET /api/local/models                 managed chat models and their state; POST
 *   /api/local/models/{id}/install|import download Gemma 4 E2B, import the adapter (./chat-model.ts)
 *   GET /api/local/ai/catalog              Aphrody's host catalog and installed coding agents
 *   POST /api/local/koharu/candidates      submit a Koharu result to the local Shenron catalog
 *   GET /api/local/rag/search?q=&limit=&kind=
 *                                         offline Shenron corpus (embedded canon and guide, the
 *                                         configured corpus and the local RAG store) through
 *                                         the shenron-ffi C ABI, in process
 *
 * The native library is the one shipped beside the executable (or SHENRON_FFI_LIB), opened
 * through the single `bun:ffi` binding of `@aphrody/shenron-native`. Searches run on its worker pool
 * (`@aphrody/shenron-native/worker`), off the event loop; a client that goes away aborts its search
 * (the request `AbortSignal` cancels the native job).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LocalApiGroups, LocalHealthResponse } from "@aphrody/shenron-api/contract";
import type { ChatModel } from "./chat-model";
import type { KoharuBridge } from "./koharu";
import { SHENRON_FFI_FILE } from "@aphrody/shenron-native/shenron";
import { shenronWorkerPool } from "@aphrody/shenron-native/worker";

import { profileOf, type ServerPaths } from "./config";
import { VERSION } from "./version";
import { openAiApi } from "./openai";

/** The native calls of the local APIs (`@aphrody/shenron-native` by default; a fake in tests). */
export interface LocalNative {
  /** Open the library at `path` and check it (ABI, target, version); throws when it cannot. */
  load(path: string): unknown;
  /** Search the offline corpus; `signal` aborts with the HTTP request. */
  search(
    query: string,
    limit: number,
    kind: string | undefined,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
}

const NATIVE: LocalNative = {
  load: (path) => shenronWorkerPool({ path }),
  search: (query, limit, kind, signal) =>
    shenronWorkerPool().localSearch(query, { limit, kind, signal }),
};

export function libraryPath(paths: ServerPaths, env: NodeJS.ProcessEnv): string | null {
  const candidates = [
    env.SHENRON_FFI_LIB?.trim(),
    join(paths.exeDir, SHENRON_FFI_FILE),
    join(paths.exeDir, "native", SHENRON_FFI_FILE),
  ];
  return (
    candidates.find((candidate): candidate is string =>
      Boolean(candidate && existsSync(candidate)),
    ) ?? null
  );
}

const withoutNul = (text: string) => text.replaceAll("\0", "");

async function submitKoharuCandidate(
  request: Request,
  env: NodeJS.ProcessEnv,
  headers: Record<string, string>,
): Promise<Response> {
  const target = env.SHENRON_API_URL?.trim();
  const token =
    env.API_ADMIN_TOKEN?.trim() ||
    env.SHENRON_API_ADMIN_TOKEN?.trim() ||
    env.SHENRON_ADMIN_TOKEN?.trim();
  if (!target || !token)
    return Response.json({ error: "catalog_unavailable" }, { status: 503, headers });
  const body = await request.text();
  if (body.length > 2 * 1024 * 1024)
    return Response.json({ error: "body_too_large" }, { status: 413, headers });
  try {
    JSON.parse(body);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers });
  }
  try {
    const response = await fetch(new URL("/api/manga/candidates", target), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
      signal: request.signal,
    });
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: "catalog_unavailable" }, { status: 503, headers });
  }
}

async function aphrodyHostCatalog(): Promise<Record<string, unknown>> {
  const aphrody = Bun.which("aphrody");
  const command = aphrody ? [aphrody, "model", "catalog", "--json"] : null;
  let models: unknown[] = [];
  let error: string | null = command ? null : "aphrody CLI introuvable";
  if (command) {
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe", windowsHide: true });
    const timeout = setTimeout(() => child.kill(), 10_000);
    try {
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (code === 0) {
        const parsed = JSON.parse(stdout) as { entries?: unknown };
        models = Array.isArray(parsed.entries) ? parsed.entries : [];
      } else error = stderr.trim() || `aphrody exited ${code}`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(timeout);
    }
  }
  const installed = (names: string[]) =>
    names.flatMap((name) => {
      const path = Bun.which(name);
      return path ? [{ id: name, path }] : [];
    });
  return {
    source: "aphrody",
    models,
    ...(error ? { error } : {}),
    agents: {
      aphrodyCodex: Boolean(Bun.which("aphrody")),
      installed: installed(["claude", "codex", "agy", "agycli", "antigravity"]),
    },
  };
}

/** `peer`: address of the client (`server.requestIP`), for the loopback-only routes. */
export type LocalApi = (
  request: Request,
  url: URL,
  ready: boolean,
  peer?: string | null,
) => Promise<Response | null>;

/** Facts of the running server added to the health answer. */
export interface LocalFacts {
  site?: boolean;
  buildId?: string;
  groups: LocalApiGroups;
}

export function localApi(
  paths: ServerPaths,
  facts: () => LocalFacts,
  env: NodeJS.ProcessEnv = process.env,
  native: LocalNative = NATIVE,
  koharu: KoharuBridge | null = null,
  chatModel: ChatModel | null = null,
): LocalApi {
  const openAi = openAiApi(env, () => chatModel?.url);
  let loaded: boolean | undefined;
  let nativeError: string | null = null;
  const load = (): boolean => {
    if (loaded !== undefined) return loaded;
    const path = libraryPath(paths, env);
    if (!path) {
      nativeError = "shenron-ffi native library not installed beside the server";
      loaded = false;
      return loaded;
    }
    try {
      native.load(path);
      loaded = true;
    } catch (error) {
      nativeError = String(error);
      loaded = false;
    }
    return loaded;
  };

  return async (request, url, ready, peer = null) => {
    // An explicit gateway owns the complete wire contract, including tools and compaction.
    if (env.SHENRON_OPENAI_BASE_URL?.trim()) {
      const response = await openAi(request, url, ready, peer);
      if (response) return response;
    }
    const models = await chatModel?.handle(request, url, peer);
    if (models) return models;
    const response = await openAi(request, url, ready, peer);
    if (response) return response;
    if (!url.pathname.startsWith("/api/local/")) return null;
    const engine = await koharu?.handle(request, url, peer);
    if (engine) return engine;
    const headers = { "cache-control": "no-store", "access-control-allow-origin": "*" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/api/local/health") {
      const localRag = load();
      const body: LocalHealthResponse = {
        ok: ready,
        service: "shenron-server",
        version: VERSION,
        profile: profileOf(env),
        home: paths.home,
        localRag,
        ...(localRag || nativeError === null ? {} : { localRagError: nativeError }),
        ...facts(),
      };
      if (koharu) body.groups = { ...body.groups, koharu: koharu.status() };
      return Response.json(body, { status: ready ? 200 : 503, headers });
    }
    if (url.pathname === "/api/local/ai/catalog" && request.method === "GET") {
      if (peer && !/^127\.0\.0\.1$|^::1$/.test(peer))
        return Response.json({ error: "loopback_only" }, { status: 403, headers });
      return Response.json(await aphrodyHostCatalog(), { headers });
    }
    if (url.pathname === "/api/local/koharu/candidates" && request.method === "POST") {
      if (peer && !/^127\.0\.0\.1$|^::1$/.test(peer))
        return Response.json({ error: "loopback_only" }, { status: 403, headers });
      return submitKoharuCandidate(request, env, headers);
    }
    if (url.pathname === "/api/local/rag/search") {
      const query = url.searchParams.get("q")?.trim() ?? "";
      if (!query || query.length > 600) {
        return Response.json(
          { error: "q must contain between 1 and 600 characters" },
          { status: 400, headers },
        );
      }
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 8) || 8, 1), 50);
      const kind = withoutNul(url.searchParams.get("kind")?.trim() ?? "");
      if (!load()) return Response.json({ error: nativeError }, { status: 503, headers });
      const started = performance.now();
      let value: Record<string, unknown>;
      try {
        value = await native.search(
          withoutNul(query),
          Math.trunc(limit),
          kind || undefined,
          request.signal,
        );
      } catch (error) {
        // The client went away: its search was cancelled, nobody reads this answer.
        if (request.signal.aborted) return new Response(null, { status: 499, headers });
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500, headers },
        );
      }
      return Response.json(
        { ...value, tookMs: Math.round((performance.now() - started) * 10) / 10 },
        { headers },
      );
    }
    return Response.json({ error: "unknown local API" }, { status: 404, headers });
  };
}
