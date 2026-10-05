// SPDX-License-Identifier: Apache-2.0
/**
 * Le plugin « shenron » servi par le site aux LLM : `/plugin` (HTML), `/plugin.md`,
 * `/plugin.txt`, `/plugin.json`, `/plugin/<fichier>` et l'API `/api/public/plugin*`,
 * relus depuis `plugin/` du dépôt (aucune base, aucun réseau).
 */
import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const ORIGIN = "https://dragonballfr.com";

describe("plugin servi par le site", () => {
  test("une page HTML et trois exports, chacun avec son type et un ETag qui revalide", async () => {
    const routes = {
      html: (await import("../src/app/plugin/route")).GET,
      md: (await import("../src/app/plugin.md/route")).GET,
      txt: (await import("../src/app/plugin.txt/route")).GET,
      json: (await import("../src/app/plugin.json/route")).GET,
    };
    const types = {
      html: "text/html",
      md: "text/markdown",
      txt: "text/plain",
      json: "application/json",
    };
    for (const [format, GET] of Object.entries(routes)) {
      const path = format === "html" ? "/plugin" : `/plugin.${format}`;
      const res = await GET(new Request(`${ORIGIN}${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toStartWith(types[format as keyof typeof types]);
      const etag = res.headers.get("etag");
      expect(etag).toBeTruthy();
      const again = await GET(
        new Request(`${ORIGIN}${path}`, { headers: { "if-none-match": etag! } }),
      );
      expect(again.status).toBe(304);
    }
    const md = await (await routes.md(new Request(`${ORIGIN}/plugin.md`))).text();
    expect(md).toContain("# Shenron plugin for Dragon Ball");
    expect(md).toContain("**dragon-ball-canon**");
  });

  test("un fichier brut ou mis en forme ; un chemin hors du plugin est un 404", async () => {
    const { GET } = await import("../src/app/plugin/[...path]/route");
    const file = (path: string[], query = "") =>
      GET(new Request(`${ORIGIN}/plugin/${path.join("/")}${query}`), {
        params: Promise.resolve({ path }),
      });
    const raw = await file(["skills", "dragon-ball", "SKILL.md"]);
    expect(raw.headers.get("content-type")).toStartWith("text/markdown");
    expect(await raw.text()).toContain("name: dragon-ball");
    const json = await file(["skills", "dragon-ball", "SKILL.md"], "?format=json");
    expect(((await json.json()) as { sha256: string }).sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await file(["..", "..", "CLAUDE.md"])).status).toBe(404);
  });

  test("l'API publique du site expose l'index", async () => {
    const { siteShenronApi } = await import("../src/lib/site-api");
    const res = await siteShenronApi.fetch(new Request(`${ORIGIN}/api/public/plugin`));
    expect(res.status).toBe(200);
    const index = (await res.json()) as { name: string; formats: { md: string } };
    expect(index.name).toBe("shenron");
    expect(index.formats.md).toBe(`${ORIGIN}/api/public/plugin/export/md`);
  });

  test("llms.txt annonce le plugin dans ses quatre formats", async () => {
    const source = await Bun.file(new URL("../src/app/llms.txt/route.ts", import.meta.url)).text();
    for (const path of [
      "/plugin](",
      "/plugin.md",
      "/plugin.txt",
      "/plugin.json",
      "/api/public/plugin",
    ])
      expect(source).toContain(path);
  });
});
