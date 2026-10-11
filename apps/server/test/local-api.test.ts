// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHealthResponse } from "@aphrody/shenron-api/contract";
import { SHENRON_FFI_FILE } from "@aphrody/shenron-native/shenron";
import { closeShenronWorkerPool } from "@aphrody/shenron-native/worker";

import { unavailableGroups } from "../src/backend";
import type { ChatModel } from "../src/chat-model";
import type { ServerPaths } from "../src/config";
import { type LocalFacts, localApi, type LocalNative } from "../src/local-api";
import { VERSION } from "../src/version";

const root = mkdtempSync(join(tmpdir(), "shenron-local-api-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let counter = 0;
function serverPaths(): ServerPaths {
  const exeDir = join(root, `exe-${++counter}`);
  mkdirSync(exeDir, { recursive: true });
  return {
    home: join(root, "home"),
    config: join(root, "home", "config"),
    envFile: join(root, "home", "config", "shenron.env"),
    data: join(root, "home", "data"),
    cache: join(root, "home", "cache"),
    logs: join(root, "home", "logs"),
    exeDir,
  };
}

function libraryAt(path: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "fake library");
  return path;
}

interface FakeNative extends LocalNative {
  loads: string[];
  searches: { query: string; limit: number; kind?: string }[];
}

function fakeNative(
  over: { load?: (path: string) => void; search?: LocalNative["search"] } = {},
): FakeNative {
  const loads: string[] = [];
  const searches: FakeNative["searches"] = [];
  return {
    loads,
    searches,
    load(path) {
      loads.push(path);
      over.load?.(path);
    },
    search(query, limit, kind, signal) {
      searches.push({ query, limit, ...(kind === undefined ? {} : { kind }) });
      return over.search?.(query, limit, kind, signal) ?? { q: query, mode: "fake", results: [] };
    },
  };
}

const call = (api: ReturnType<typeof localApi>, path: string, init?: RequestInit, ready = true) => {
  const request = new Request(`http://127.0.0.1${path}`, init);
  return api(request, new URL(request.url), ready);
};

/** JSON body of a local API answer. */
async function read(response: Response | null): Promise<Record<string, unknown>> {
  return (await response!.json()) as Record<string, unknown>;
}

const GROUPS = unavailableGroups("API locale indisponible");
const NO_FACTS = (): LocalFacts => ({ groups: GROUPS });

const NOT_INSTALLED = "shenron-ffi native library not installed beside the server";

describe("local API routing", () => {
  test("paths outside /api/local/ are left to the front app", async () => {
    const api = localApi(serverPaths(), NO_FACTS, {}, fakeNative());
    expect(await call(api, "/api/public/wiki/categories")).toBeNull();
    expect(await call(api, "/api/local")).toBeNull();
  });

  test("routes the OpenAI model catalog through the loopback chat model before the front app", async () => {
    const seen: string[] = [];
    const chatModel = {
      async handle(_request: Request, url: URL, peer?: string | null) {
        if (url.pathname !== "/v1/models") return null;
        seen.push(`${url.pathname} ${peer}`);
        return Response.json({ object: "list", data: [] });
      },
    } as ChatModel;
    const api = localApi(serverPaths(), NO_FACTS, {}, fakeNative(), null, chatModel);
    const url = new URL("http://127.0.0.1/v1/models");
    const response = await api(new Request(url.href), url, true, "127.0.0.1");
    expect(response?.status).toBe(200);
    expect(seen).toEqual(["/v1/models 127.0.0.1"]);
  });

  test("OPTIONS → 204 with CORS and no-store; unknown → 404", async () => {
    const api = localApi(serverPaths(), NO_FACTS, {}, fakeNative());
    const options = (await call(api, "/api/local/rag/search", { method: "OPTIONS" }))!;
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
    expect(options.headers.get("cache-control")).toBe("no-store");
    const unknown = (await call(api, "/api/local/nothing"))!;
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown local API" });
  });
});

describe("/api/local/health", () => {
  test("without a library: localRag false with the reason; 503 until the site is ready", async () => {
    const paths = serverPaths();
    const native = fakeNative();
    const api = localApi(paths, () => ({ site: true, buildId: "b1", groups: GROUPS }), {}, native);
    const starting = (await call(api, "/api/local/health", undefined, false))!;
    expect(starting.status).toBe(503);
    const body = await read(starting);
    expect(body).toEqual({
      ok: false,
      service: "shenron-server",
      version: VERSION,
      profile: "public",
      home: paths.home,
      localRag: false,
      localRagError: NOT_INSTALLED,
      site: true,
      buildId: "b1",
      groups: GROUPS,
    });
    expect(LocalHealthResponse.parse(body)).toEqual(body as LocalHealthResponse);
    const ready = (await call(api, "/api/local/health"))!;
    expect(ready.status).toBe(200);
    expect((await read(ready)).ok).toBe(true);
    expect(native.loads).toEqual([]);
  });

  test("reports the editor engine group and routes /api/local/koharu to it", async () => {
    const seen: string[] = [];
    const koharu = {
      status: () => ({ available: true }),
      setServerUrl() {},
      async handle(_request: Request, url: URL, peer: string | null) {
        if (!url.pathname.startsWith("/api/local/koharu")) return null;
        seen.push(`${url.pathname} ${peer}`);
        return Response.json({ result: null });
      },
      stop() {},
    };
    const api = localApi(serverPaths(), NO_FACTS, {}, fakeNative(), koharu);
    const body = await read((await call(api, "/api/local/health"))!);
    expect(LocalHealthResponse.parse(body).groups.koharu).toEqual({ available: true });
    const url = new URL("http://127.0.0.1/api/local/koharu/invoke");
    const routed = await api(new Request(url.href, { method: "POST" }), url, true, "127.0.0.1");
    expect(routed!.status).toBe(200);
    expect(seen).toEqual(["/api/local/koharu/invoke 127.0.0.1"]);
  });

  test("library found: localRag true, profile from the environment, opened once", async () => {
    const paths = serverPaths();
    const lib = libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const native = fakeNative();
    const api = localApi(paths, NO_FACTS, { SHENRON_PROFILE: "desktop" }, native);
    for (let i = 0; i < 3; i++) {
      const body = await read(await call(api, "/api/local/health"));
      expect(body.localRag).toBe(true);
      expect(body.localRagError).toBeUndefined();
      expect(body.profile).toBe("desktop");
    }
    expect(native.loads).toEqual([lib]);
  });

  test("a library that fails to open is reported once, with the binding's error", async () => {
    const paths = serverPaths();
    libraryAt(join(paths.exeDir, "native", SHENRON_FFI_FILE));
    const native = fakeNative({
      load: () => {
        throw new Error("Shenron ABI mismatch at x: expected 1, found 2");
      },
    });
    const api = localApi(paths, NO_FACTS, {}, native);
    const body = await read(await call(api, "/api/local/health"));
    expect(body.localRag).toBe(false);
    expect(body.localRagError).toBe("Error: Shenron ABI mismatch at x: expected 1, found 2");
    const search = (await call(api, "/api/local/rag/search?q=Goku"))!;
    expect(search.status).toBe(503);
    expect(await search.json()).toEqual({
      error: "Error: Shenron ABI mismatch at x: expected 1, found 2",
    });
    expect(native.loads).toHaveLength(1);
  });
});

describe("library location", () => {
  test("SHENRON_FFI_LIB (trimmed) wins over the executable directory", async () => {
    const paths = serverPaths();
    libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const override = libraryAt(join(root, "payload", "native", SHENRON_FFI_FILE));
    const native = fakeNative();
    const api = localApi(paths, NO_FACTS, { SHENRON_FFI_LIB: `  ${override} ` }, native);
    await call(api, "/api/local/health");
    expect(native.loads).toEqual([override]);
  });

  test("a missing SHENRON_FFI_LIB falls back to the executable directory, then native/", async () => {
    const paths = serverPaths();
    const nested = libraryAt(join(paths.exeDir, "native", SHENRON_FFI_FILE));
    const native = fakeNative();
    const env = { SHENRON_FFI_LIB: join(root, "absent", SHENRON_FFI_FILE) };
    await call(localApi(paths, NO_FACTS, env, native), "/api/local/health");
    expect(native.loads).toEqual([nested]);
    const beside = libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    await call(localApi(paths, NO_FACTS, env, native), "/api/local/health");
    expect(native.loads).toEqual([nested, beside]);
  });
});

describe("/api/local/rag/search", () => {
  test("q must hold 1 to 600 characters", async () => {
    const native = fakeNative();
    const api = localApi(serverPaths(), NO_FACTS, {}, native);
    for (const query of ["", "?q=", "?q=%20%20", `?q=${"a".repeat(601)}`]) {
      const res = (await call(api, `/api/local/rag/search${query}`))!;
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "q must contain between 1 and 600 characters" });
    }
    expect(native.loads).toEqual([]);
  });

  test("without a library → 503 with the reason", async () => {
    const api = localApi(serverPaths(), NO_FACTS, {}, fakeNative());
    const res = (await call(api, "/api/local/rag/search?q=Goku"))!;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: NOT_INSTALLED });
  });

  test("forwards the cleaned query, the clamped limit and the kind; adds tookMs", async () => {
    const paths = serverPaths();
    libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const native = fakeNative({
      search: (query) => ({ q: query, mode: "aphrody_local_naive", results: [{ title: "Goku" }] }),
    });
    const api = localApi(paths, NO_FACTS, {}, native);
    const res = (await call(api, "/api/local/rag/search?q=%20Go%00ku%20&kind=wi%00ki"))!;
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await read(res);
    expect(body).toMatchObject({
      q: "Goku",
      mode: "aphrody_local_naive",
      results: [{ title: "Goku" }],
    });
    expect(typeof body.tookMs).toBe("number");
    for (const [limit, expected] of [
      ["", 8],
      ["abc", 8],
      ["0", 8],
      ["-3", 1],
      ["2.7", 2],
      ["500", 50],
    ] as const) {
      await call(api, `/api/local/rag/search?q=Goku&limit=${limit}`);
      expect(native.searches.at(-1)).toEqual({ query: "Goku", limit: expected });
    }
    expect(native.searches[0]).toEqual({ query: "Goku", limit: 8, kind: "wiki" });
  });

  test("a failing native search → 500 with its message", async () => {
    const paths = serverPaths();
    libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const native = fakeNative({
      search: () => {
        throw new Error("shenron_local_search returned null");
      },
    });
    const res = (await call(
      localApi(paths, NO_FACTS, {}, native),
      "/api/local/rag/search?q=Goku",
    ))!;
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "shenron_local_search returned null" });
  });

  test("the request signal reaches the search; a client gone away gets no 500", async () => {
    const paths = serverPaths();
    libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const native = fakeNative({
      search: async (_query, _limit, _kind, signal) => {
        received = signal;
        controller.abort();
        throw signal.reason;
      },
    });
    const res = (await call(localApi(paths, NO_FACTS, {}, native), "/api/local/rag/search?q=Goku", {
      signal: controller.signal,
    }))!;
    expect(received?.aborted).toBe(true);
    expect(res.status).toBe(499);
  });
});

describe("default binding: @aphrody/shenron-native", () => {
  test("an invalid library file is reported by the shared loader", async () => {
    const paths = serverPaths();
    const junk = libraryAt(join(paths.exeDir, SHENRON_FFI_FILE));
    const api = localApi(paths, NO_FACTS, {});
    const body = await read(await call(api, "/api/local/health"));
    expect(body.localRag).toBe(false);
    expect(body.localRagError).toContain(`Unable to load shenron-ffi at ${junk}`);
  });

  // Opt-in: only where a shenron-ffi build is present (the test never builds it); the most
  // recent build, as @aphrody/shenron-native resolves it (a stale release is refused by its ABI check).
  const built = ["release", "debug"]
    .map((profile) => join(import.meta.dir, "../../../target", profile, SHENRON_FFI_FILE))
    .filter((path) => existsSync(path))
    .toSorted((x, y) => statSync(y).mtimeMs - statSync(x).mtimeMs)[0];
  test.if(built !== undefined)("the built library answers the local search", async () => {
    const api = localApi(serverPaths(), NO_FACTS, { SHENRON_FFI_LIB: built });
    const health = await read(await call(api, "/api/local/health"));
    expect(health.localRag).toBe(true);
    const res = (await call(api, "/api/local/rag/search?q=Goku&limit=2"))!;
    expect(res.status).toBe(200);
    const body = await read(res);
    expect(Array.isArray(body.results)).toBe(true);
    expect((body.results as unknown[]).length).toBeLessThanOrEqual(2);
    expect(typeof body.tookMs).toBe("number");
    await closeShenronWorkerPool();
  });
});
