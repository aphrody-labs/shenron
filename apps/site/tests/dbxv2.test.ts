// SPDX-License-Identifier: Apache-2.0
/** Outils privés DBXV2 du site : garde, service, signatures sans jeton, i18n. */
import { describe, expect, mock, test } from "bun:test";
import fr from "../messages/dbxv2/fr.json";
import en from "../messages/dbxv2/en.json";
import ja from "../messages/dbxv2/ja.json";

mock.module("server-only", () => ({}));
const { dbxv2SiteGate } = await import("../src/lib/dbxv2-gate");
const { createDbxv2Service, previewKindOf, Dbxv2SiteError } = await import("../src/lib/dbxv2");
const { ImmersionMapSchema } = await import("../src/lib/dbxv2-immersion");

const TOKEN = "t".repeat(32);
const ENV = {
  DBXV2_SERVER_URL: "http://127.0.0.1:9",
  DBXV2_TOKEN: TOKEN,
} as unknown as NodeJS.ProcessEnv;

describe("garde du site", () => {
  test("désactivé par défaut", () => {
    expect(dbxv2SiteGate({})).toEqual({ enabled: false, reason: "unconfigured" });
  });
  test("actif seulement avec URL http(s) et jeton assez long, hors production", () => {
    expect(dbxv2SiteGate({ ...ENV, NODE_ENV: "development" }).enabled).toBe(true);
    expect(dbxv2SiteGate({ ...ENV, DBXV2_TOKEN: "court" }).enabled).toBe(false);
    expect(dbxv2SiteGate({ ...ENV, DBXV2_SERVER_URL: "ftp://x" }).enabled).toBe(false);
  });
  test("jamais en rendu public ni en production", () => {
    expect(dbxv2SiteGate({ ...ENV, NODE_ENV: "production" })).toEqual({
      enabled: false,
      reason: "production",
    });
    for (const flag of ["SHENRON_PUBLIC_RENDER", "SHENRON_PUBLIC_BUILD"])
      expect(dbxv2SiteGate({ ...ENV, [flag]: "1" })).toEqual({ enabled: false, reason: "public" });
    expect(dbxv2SiteGate({ ...ENV, SHENRON_PROFILE: "public" }).enabled).toBe(false);
  });
});

function fakeModule(enabled = true) {
  return {
    dbxv2Status: () => ({ enabled }),
    openDbxv2DbFromEnv: () => ({
      search: async (q: string) => ({
        mode: "lexical",
        hits: [{ title: q, kind: "msg", lang: "fr", heading: null, snippet: "s", score: 1 }],
      }),
      files: () => [],
      characters: () => [],
      messages: () => [{ lang: "fr", base: "b", nameId: "n", text: "Bonjour" }],
      stats: () => ({ files: 1, characters: 2, messages: 3 }),
    }),
    createDbxv2Proxy: () => ({
      origin: PROXY_ORIGIN,
      sign: (kind: string, ref: { cpk: string; path: string }) =>
        `http://127.0.0.1:5555/r/${kind}/${ref.cpk}/${ref.path}?exp=1&sig=ab`,
    }),
    parseRef: (input: string | { cpk: string; path: string }) => {
      const text = typeof input === "string" ? input : `${input.cpk}/${input.path}`;
      const [cpk, ...rest] = text.split("/");
      if (!cpk || rest.length === 0 || rest.includes("..")) throw new Error("bad");
      return { cpk, path: rest.join("/") };
    },
  };
}

let PROXY_ORIGIN = "http://127.0.0.1:5555";

describe("service", () => {
  test("refuse un module désactivé", () => {
    expect(() => createDbxv2Service(fakeModule(false), ENV)).toThrow(Dbxv2SiteError);
  });
  test("l'aperçu est une URL signée de même origine, sans jeton ni proxy", () => {
    const service = createDbxv2Service(fakeModule(), ENV);
    const preview = service.preview({ ref: "CHARA/a/b.emb", kind: "png", index: 0 });
    expect(preview.url).toBe("/admin/dbxv2/media/png/CHARA/a/b.emb?exp=1&sig=ab");
    expect(preview.url).not.toContain("127.0.0.1");
    expect(JSON.stringify(preview)).not.toContain(TOKEN);
    expect(preview.expiresInSeconds).toBeLessThanOrEqual(3600);
  });
  test("le relais transmet Range, filtre les en-têtes amont et refuse le reste", async () => {
    const seen: { url: string; range: string | null; auth: string | null }[] = [];
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const u = new URL(req.url);
        seen.push({
          url: u.pathname + u.search,
          range: req.headers.get("range"),
          auth: req.headers.get("authorization"),
        });
        if (u.pathname.includes("missing")) return new Response("x", { status: 404 });
        return new Response("DATA", {
          status: 206,
          headers: {
            "content-type": "audio/wav",
            "content-range": "bytes 0-3/10",
            "accept-ranges": "bytes",
            "set-cookie": "leak=1",
            "x-secret": "no",
          },
        });
      },
    });
    PROXY_ORIGIN = `http://127.0.0.1:${upstream.port}`;
    try {
      const service = createDbxv2Service(fakeModule(), ENV);
      const headers = new Headers({ range: "bytes=0-3", cookie: "dbfr_admin=s" });
      const res = await service.relay(["wav", "CHARA", "a", "b é.acb"], "?exp=1&sig=ab", {
        method: "GET",
        headers,
      });
      expect(res.status).toBe(206);
      expect(await res.text()).toBe("DATA");
      expect(res.headers.get("content-range")).toBe("bytes 0-3/10");
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("x-secret")).toBeNull();
      expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(seen[0]).toEqual({
        url: "/r/wav/CHARA/a/b%20%C3%A9.acb?exp=1&sig=ab",
        range: "bytes=0-3",
        auth: null,
      });
      expect((await service.relay(["wav", "x"], "", { method: "GET", headers })).status).toBe(404);
      const post = await service.relay(["wav", "CHARA", "missing"], "", {
        method: "POST",
        headers,
      });
      expect(post.status).toBe(405);
      const missing = await service.relay(["wav", "CHARA", "missing"], "", {
        method: "GET",
        headers,
      });
      expect(missing.status).toBe(404);
      expect(JSON.stringify([...res.headers])).not.toContain(TOKEN);
    } finally {
      void upstream.stop(true);
      PROXY_ORIGIN = "http://127.0.0.1:5555";
    }
  });
  test("le relais retente une fois un 502 du proxy, pas un 403", async () => {
    let calls = 0;
    const upstream = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        calls += 1;
        if (new URL(req.url).pathname.includes("forbidden"))
          return new Response("x", { status: 403 });
        return calls === 1
          ? new Response("x", { status: 502 })
          : new Response("OK", { status: 200 });
      },
    });
    PROXY_ORIGIN = `http://127.0.0.1:${upstream.port}`;
    try {
      const service = createDbxv2Service(fakeModule(), ENV);
      const request = { method: "GET", headers: new Headers() };
      const ok = await service.relay(["png", "CHARA", "a"], "", request);
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe("OK");
      expect(calls).toBe(2);
      calls = 10;
      const denied = await service.relay(["png", "CHARA", "forbidden"], "", request);
      expect(denied.status).toBe(403);
      expect(calls).toBe(11);
    } finally {
      void upstream.stop(true);
      PROXY_ORIGIN = "http://127.0.0.1:5555";
    }
  });
  test("référence invalide et recherche trop courte : code stable", async () => {
    const service = createDbxv2Service(fakeModule(), ENV);
    expect(() => service.preview({ ref: "CHARA/../x", kind: "png" })).toThrow(
      expect.objectContaining({ code: "invalid" }),
    );
    await expect(service.search({ q: "a" })).rejects.toMatchObject({ code: "invalid" });
    expect((await service.search({ q: "Goku" })).hits).toHaveLength(1);
    expect(service.messages("n")).toEqual([{ lang: "fr", text: "Bonjour" }]);
  });
  test("formats aperçus", () => {
    expect(previewKindOf("EMB")).toBe("png");
    expect(previewKindOf("acb")).toBe("wav");
    expect(previewKindOf("usm")).toBe("video");
    expect(previewKindOf("emd")).toBe("model.glb");
    expect(previewKindOf("bin")).toBeNull();
  });
});

describe("carte d'immersion", () => {
  test("accepte des références nommées, refuse le reste", () => {
    const ok = ImmersionMapSchema.safeParse({
      slots: { "hit-1": { ref: "SE/a.acb", kind: "wav", cue: 3 } },
    });
    expect(ok.success).toBe(true);
    expect(
      ImmersionMapSchema.safeParse({ slots: { "Bad Name": { ref: "SE/a", kind: "wav" } } }).success,
    ).toBe(false);
    expect(
      ImmersionMapSchema.safeParse({ slots: { x: { ref: "SE/a", kind: "exe" } } }).success,
    ).toBe(false);
  });
});

describe("i18n fr/en/ja", () => {
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
      : [prefix];
  test("mêmes clés, aucune valeur vide", () => {
    expect(keys(en)).toEqual(keys(fr));
    expect(keys(ja)).toEqual(keys(fr));
    const values = (v: unknown): string[] =>
      v && typeof v === "object" ? Object.values(v).flatMap(values) : [String(v)];
    for (const dict of [fr, en, ja])
      expect(values(dict).every((s) => s.trim().length > 0)).toBe(true);
  });
});
