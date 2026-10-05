// SPDX-License-Identifier: Apache-2.0
/**
 * Local APIs of the Shenron server, answered by Bun before the front app:
 *
 *   GET /api/local/health                 liveness, profile, version, capabilities
 *   GET /api/local/rag/search?q=&limit=&kind=
 *                                         offline Shenron corpus (embedded canon and guide, the
 *                                         configured corpus and the local RAG store) through
 *                                         the shenron-ffi C ABI, in process
 *
 * The native library is the one shipped beside the executable (or SHENRON_FFI_LIB).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CString, dlopen, FFIType, suffix, type Pointer } from "bun:ffi";

import type { ServerPaths } from "./config";

const VERSION = "1.0.0";
const SYMBOLS = {
  shenron_abi_version: { args: [], returns: FFIType.u32 },
  shenron_local_search: {
    args: [FFIType.cstring, FFIType.i32, FFIType.cstring],
    returns: FFIType.ptr,
  },
  shenron_string_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;
type Native = ReturnType<typeof dlopen<typeof SYMBOLS>>;

function libraryPath(paths: ServerPaths, env: NodeJS.ProcessEnv): string | null {
  const name = `${process.platform === "win32" ? "" : "lib"}shenron_ffi.${suffix}`;
  const candidates = [
    env.SHENRON_FFI_LIB?.trim(),
    join(paths.exeDir, name),
    join(paths.exeDir, "native", name),
  ];
  return (
    candidates.find((candidate): candidate is string =>
      Boolean(candidate && existsSync(candidate)),
    ) ?? null
  );
}

const encoder = new TextEncoder();
const cstr = (text: string) => encoder.encode(`${text.replaceAll("\0", "")}\0`);

export type LocalApi = (request: Request, url: URL, ready: boolean) => Promise<Response | null>;

export function localApi(
  paths: ServerPaths,
  facts: () => Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): LocalApi {
  let native: Native | null | undefined;
  let nativeError: string | null = null;
  const load = (): Native | null => {
    if (native !== undefined) return native;
    const path = libraryPath(paths, env);
    if (!path) {
      nativeError = "shenron-ffi native library not installed beside the server";
      native = null;
      return native;
    }
    try {
      const lib = dlopen(path, SYMBOLS);
      if (lib.symbols.shenron_abi_version() !== 1) {
        lib.close();
        throw new Error("shenron-ffi ABI mismatch (expected 1)");
      }
      native = lib;
    } catch (error) {
      nativeError = String(error);
      native = null;
    }
    return native;
  };

  return async (request, url, ready) => {
    if (!url.pathname.startsWith("/api/local/")) return null;
    const headers = { "cache-control": "no-store", "access-control-allow-origin": "*" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/api/local/health") {
      const lib = load();
      return Response.json(
        {
          ok: ready,
          service: "shenron-server",
          version: VERSION,
          profile: env.SHENRON_PROFILE ?? "public",
          home: paths.home,
          localRag: lib !== null,
          localRagError: lib ? undefined : nativeError,
          ...facts(),
        },
        { status: ready ? 200 : 503, headers },
      );
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
      const kind = url.searchParams.get("kind")?.trim() ?? "";
      const lib = load();
      if (!lib) return Response.json({ error: nativeError }, { status: 503, headers });
      const started = performance.now();
      const pointer = lib.symbols.shenron_local_search(cstr(query), limit, cstr(kind));
      if (!pointer)
        return Response.json(
          { error: "shenron_local_search returned null" },
          { status: 500, headers },
        );
      let text: string;
      try {
        text = new CString(pointer as Pointer).toString();
      } finally {
        lib.symbols.shenron_string_free(pointer as Pointer);
      }
      const value = JSON.parse(text) as Record<string, unknown>;
      return Response.json(
        { ...value, tookMs: Math.round((performance.now() - started) * 10) / 10 },
        { headers },
      );
    }
    return Response.json({ error: "unknown local API" }, { status: 404, headers });
  };
}
