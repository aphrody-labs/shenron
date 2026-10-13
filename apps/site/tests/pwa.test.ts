import { describe, expect, it } from "bun:test";
import { serviceWorkerSource } from "../src/lib/pwa-worker";
import { offlineDocument } from "../src/lib/pwa";
import { GET as manifest } from "../src/app/manifest.webmanifest/route";
import { GET as worker } from "../src/app/sw.js/route";

function harness(fetcher: (request: Request) => Promise<Response>) {
  const handlers = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (value: string | Request) => (typeof value === "string" ? value : value.url);
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        async put(request: string | Request, response: Response) {
          store.set(key(request), response.clone());
        },
        async match(request: string | Request) {
          return store.get(key(request))?.clone();
        },
        async keys() {
          return [...store.keys()].map((url) => ({ url }));
        },
        async delete(request: string | Request) {
          return store.delete(key(request));
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
    async match(request: string) {
      for (const store of stores.values())
        if (store.has(request)) return store.get(request)!.clone();
      return undefined;
    },
  };
  const self = {
    location: { origin: "https://dragonballfr.com" },
    clients: { async claim() {} },
    async skipWaiting() {},
    addEventListener(name: string, handler: (event: any) => void) {
      handlers.set(name, handler);
    },
  };
  new Function(
    "self",
    "caches",
    "fetch",
    serviceWorkerSource("fr", "https://cdn.dragonballfr.com"),
  )(self, caches, fetcher);
  async function dispatch(name: string, input: object) {
    const jobs: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(name)!({
      ...input,
      waitUntil: (job: Promise<unknown>) => jobs.push(job),
      respondWith: (job: Promise<Response>) => {
        response = job;
      },
    });
    const result = await response;
    await Promise.all(jobs);
    return result;
  }
  function request(
    path: string,
    mode = "cors",
    headers: Record<string, string> = {},
    method = "GET",
  ) {
    return {
      url: new URL(path, self.location.origin).href,
      mode,
      method,
      headers: new Headers(headers),
    };
  }
  return { stores, dispatch, request };
}

describe("PWA delivery and offline behavior", () => {
  it("serves an installable localized identity with real original icons", async () => {
    for (const lang of ["fr", "en", "ja"]) {
      const response = manifest(
        new Request(`https://dragonballfr.com/manifest.webmanifest?lang=${lang}`),
      );
      expect(response.headers.get("content-type")).toContain("application/manifest+json");
      const value = await response.json();
      expect(value).toMatchObject({
        id: "/",
        scope: "/",
        start_url: "/",
        display: "standalone",
        lang,
      });
      for (const icon of value.icons) {
        const bytes = new DataView(
          await Bun.file(`../../packages/ui/assets${icon.src}`).arrayBuffer(),
        );
        expect(bytes.getUint32(16)).toBe(Number(icon.sizes.split("x")[0]));
        expect(bytes.getUint32(20)).toBe(Number(icon.sizes.split("x")[1]));
      }
    }
    expect(worker(new Request("https://dragonballfr.com/sw.js")).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
  it("renders an offline document without Next chunks, CDN or images", () => {
    for (const lang of ["fr", "en", "ja"] as const) {
      const html = offlineDocument(lang);
      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).not.toContain("_next");
      expect(html).not.toContain("https://");
      expect(html).toContain('onclick="location.reload()"');
    }
  });
  it("provides a translated navigation fallback after a network outage", async () => {
    const h = harness(async () => {
      throw new TypeError("Network offline");
    });
    await h.dispatch("install", {});
    await h.dispatch("activate", {});
    await h.dispatch("message", { data: { type: "DBFR_LOCALE", locale: "ja" } });
    const response = await h.dispatch("fetch", {
      request: h.request("/wiki/episodes/875", "navigate"),
    });
    expect(response!.status).toBe(200);
    expect(await response!.text()).toContain('<html lang="ja">');
    expect([...h.stores.values()][0]!.size).toBe(1);
  });
  it("does not intercept private, API, video, ranged, RSC or third party requests", async () => {
    const h = harness(async () => {
      throw new Error("Should not fetch");
    });
    for (const request of [
      h.request("/api/admin/dashboard"),
      h.request("/api/episodes/875/video"),
      h.request("/_next/static/chunk.js", "cors", { range: "bytes=0-100" }),
      h.request("/_next/static/chunk.js", "cors", { authorization: "test" }),
      h.request("/_next/static/chunk.js", "cors", { RSC: "1" }),
      h.request("/_next/static/chunk.js?token=test"),
      h.request("https://other.example/_next/static/chunk.js"),
      h.request("/api/upload", "cors", {}, "POST"),
    ])
      expect(await h.dispatch("fetch", { request })).toBeUndefined();
    expect(h.stores.size).toBe(0);
  });
  it("keeps asset caching bounded and refuses no-store or private responses", async () => {
    let fetches = 0;
    const h = harness(async (request) => {
      fetches++;
      return new Response("content", {
        headers: {
          "cache-control": request.url.includes("private")
            ? "private, no-store"
            : "public, immutable",
        },
      });
    });
    await h.dispatch("install", {});
    for (let i = 0; i < 65; i++)
      await h.dispatch("fetch", { request: h.request(`/_next/static/${i}.js`) });
    const cache = [...h.stores.values()][0]!;
    expect(cache.size).toBe(61);
    await h.dispatch("fetch", { request: h.request("/_next/static/64.js") });
    expect(fetches).toBe(65);
    await h.dispatch("fetch", { request: h.request("/_next/static/private.js") });
    expect(cache.has("https://dragonballfr.com/_next/static/private.js")).toBe(false);
  });
});
