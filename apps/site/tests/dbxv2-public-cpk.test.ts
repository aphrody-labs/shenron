// SPDX-License-Identifier: Apache-2.0
import { describe, expect, spyOn, test } from "bun:test";
import { relayPublicCpk } from "../src/app/api/public/dbxv2/cpk/_relay";
import * as catalogueRoute from "../src/app/api/public/dbxv2/cpk/route";
import * as entryRoute from "../src/app/api/public/dbxv2/cpk/[...path]/route";

const env = {
  DBXV2_PUBLIC_CPK: "1",
  DBXV2_SERVER_URL: "http://127.0.0.1:8788",
  DBXV2_TOKEN: "private-token-that-never-leaves-server",
};

describe("relais public CPK", () => {
  test("la route catalogue sans suffixe et la route entrée exposent des handlers Next valides", async () => {
    for (const route of [catalogueRoute, entryRoute]) {
      expect(Object.keys(route).toSorted()).toEqual(["GET", "HEAD", "dynamic", "runtime"]);
    }
    const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    const upstream = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([{ name: "data" }]),
    );
    try {
      const response = await catalogueRoute.GET(
        new Request("https://dragonballfr.com/api/public/dbxv2/cpk"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ name: "data" }]);
      expect(String(upstream.mock.calls[0]?.[0])).toBe("http://127.0.0.1:8788/cpk");
    } finally {
      upstream.mockRestore();
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("préserve les paramètres de conversion pour les fichiers dans des sous-dossiers", async () => {
    for (const [action, query] of [
      ["png", "index=2"],
      ["wav", "cue=3"],
      ["mp4", "t=10&d=5"],
    ]) {
      let seen = "";
      await relayPublicCpk(
        new Request(
          `https://dragonballfr.com/api/public/dbxv2/cpk/data/${action}/chara/file?${query}&token=ignored`,
        ),
        ["data", action!, "chara", "file"],
        env,
        async (input) => {
          seen = String(input);
          return new Response("ok");
        },
      );
      expect(seen).toBe(`http://127.0.0.1:8788/cpk/data/${action}/chara/file?${query}`);
    }
  });

  test("interdit aussi au CDN de cacher une erreur upstream", async () => {
    const response = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk/data/raw/missing.bac"),
      ["data", "raw", "missing.bac"],
      env,
      async () => new Response("missing", { status: 404 }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
  });

  test("reste fermé tant que la fonction publique n'est pas activée", async () => {
    let called = false;
    const response = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk"),
      [],
      { ...env, DBXV2_PUBLIC_CPK: "0" },
      async () => {
        called = true;
        return new Response("unexpected");
      },
    );
    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });

  test("relaye l'index et n'expose que les réponses publiques", async () => {
    let seen: { url: string; authorization: string | null } | undefined;
    const response = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk"),
      [],
      env,
      async (input, init) => {
        seen = {
          url: String(input),
          authorization: new Headers(init?.headers).get("authorization"),
        };
        return Response.json([{ name: "data", size: 123 }], {
          headers: { "cache-control": "private", "set-cookie": "never-forward" },
        });
      },
    );
    expect(seen).toEqual({
      url: "http://127.0.0.1:8788/cpk",
      authorization: `Bearer ${env.DBXV2_TOKEN}`,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual([{ name: "data", size: 123 }]);
    expect(JSON.stringify(seen)).not.toContain("never-forward");
  });

  test("préserve Range pour les grandes entrées binaires sans mettre le jeton en réponse", async () => {
    let seen: { url: string; authorization: string | null; range: string | null } | undefined;
    const response = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk/data/raw/chara/a.bac", {
        headers: { range: "bytes=4-7", cookie: "admin=session" },
      }),
      ["data", "raw", "chara", "a.bac"],
      env,
      async (input, init) => {
        seen = {
          url: String(input),
          authorization: new Headers(init?.headers).get("authorization"),
          range: new Headers(init?.headers).get("range"),
        };
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: {
            "content-type": "application/octet-stream",
            "content-range": "bytes 4-7/10",
            "accept-ranges": "bytes",
            etag: '"archive-v1"',
          },
        });
      },
    );
    expect(seen).toEqual({
      url: "http://127.0.0.1:8788/cpk/data/raw/chara/a.bac",
      authorization: `Bearer ${env.DBXV2_TOKEN}`,
      range: "bytes=4-7",
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 4-7/10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(await response.bytes()).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect([...response.headers.values()].join(" ")).not.toContain(env.DBXV2_TOKEN);
  });

  test("refuse les traversées de chemin et les méthodes d'écriture", async () => {
    const traversal = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk/data/raw/%2E%2E/etc/passwd"),
      ["data", "raw", "..", "etc", "passwd"],
      env,
    );
    expect(traversal.status).toBe(404);
    const post = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk", { method: "POST" }),
      [],
      env,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });

  test("borne les chemins de fichiers publics", async () => {
    const tooManySegments = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk/data/raw/a"),
      ["data", "raw", ...Array.from({ length: 17 }, () => "a")],
      env,
    );
    const tooLongSegment = await relayPublicCpk(
      new Request("https://dragonballfr.com/api/public/dbxv2/cpk/data/raw/a"),
      ["data", "raw", "a".repeat(256)],
      env,
    );
    expect(tooManySegments.status).toBe(404);
    expect(tooLongSegment.status).toBe(404);
  });
});
