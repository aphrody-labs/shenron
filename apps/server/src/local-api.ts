// SPDX-License-Identifier: Apache-2.0
/**
 * Local APIs of the Shenron server, answered by Bun before the front app:
 *
 *   GET /api/local/health                 liveness, profile, version, capabilities and the
 *                                         availability of each API group (`LocalHealthResponse`
 *                                         of `@shenron/api/contract`)
 *   GET /api/local/rag/search?q=&limit=&kind=
 *                                         offline Shenron corpus (embedded canon and guide, the
 *                                         configured corpus and the local RAG store) through
 *                                         the shenron-ffi C ABI, in process
 *
 * The native library is the one shipped beside the executable (or SHENRON_FFI_LIB), opened
 * through the single `bun:ffi` binding of `@shenron/native`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LocalApiGroups, LocalHealthResponse } from "@shenron/api/contract";
import { SHENRON_FFI_FILE, shenronLoad, shenronLocalSearch } from "@shenron/native/shenron";

import { profileOf, type ServerPaths } from "./config";

const VERSION = "1.0.0";

/** The native calls of the local APIs (`@shenron/native` by default; a fake in tests). */
export interface LocalNative {
  /** Open the library at `path` and check its ABI; throws when it cannot. */
  load(path: string): unknown;
  search(query: string, limit: number, kind?: string): Record<string, unknown>;
}

const NATIVE: LocalNative = { load: shenronLoad, search: shenronLocalSearch };

function libraryPath(paths: ServerPaths, env: NodeJS.ProcessEnv): string | null {
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

export type LocalApi = (request: Request, url: URL, ready: boolean) => Promise<Response | null>;

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
): LocalApi {
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

  return async (request, url, ready) => {
    if (!url.pathname.startsWith("/api/local/")) return null;
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
      return Response.json(body, { status: ready ? 200 : 503, headers });
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
        value = native.search(withoutNul(query), Math.trunc(limit), kind || undefined);
      } catch (error) {
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
