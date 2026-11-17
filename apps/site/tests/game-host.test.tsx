// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_GAME_ORIGINS } from "@aphrody/shenron-config/game";
import { GameSurfaceLayout } from "../src/components/GameSurfaceLayout";
import { gameHostRoute } from "../src/lib/game-host";

const play = DEFAULT_GAME_ORIGINS.play;
const site = "https://site.example";
const route = (path: string, method = "GET") =>
  gameHostRoute(new URL(path, play), play, site, method);

test("game root rewrites in place, historical address canonicalizes and library links retain canonical site", () => {
  const root = route("/?stage=BFlbn");
  expect(root.kind).toBe("rewrite");
  if (root.kind === "rewrite") expect(root.url.href).toBe(play + "/games/dragon-pixel?stage=BFlbn");
  const previous = route("/games/dragon-pixel?stage=BFlbn");
  if (previous.kind !== "redirect") throw Error("canonical redirect missing");
  expect(previous.url.href).toBe(play + "/?stage=BFlbn");
  const library = route("/catalog/characters/42");
  if (library.kind !== "redirect") throw Error("canonical library redirect missing");
  expect(library.url.href).toBe(site + "/catalog/characters/42");
  const doubleSlash = gameHostRoute(new URL(play + "//foreign.example/path"), play, site);
  if (doubleSlash.kind !== "redirect") throw Error("canonical redirect missing");
  expect(doubleSlash.url.origin).toBe(site);
});

test("game surface exposes only public reading APIs and required static resources", () => {
  for (const path of [
    "/api/catalog?page=2",
    "/api/public/dbxv2/cpk/data/find",
    "/wasm/shenron_engine_bg.wasm",
    "/_next/static/app.js",
  ])
    expect(route(path).kind).toBe("next");
  for (const path of [
    "/admin",
    "/admin/launch",
    "/workshop/translation",
    "/api/admin/data",
    "/api/local/health",
    "/api/auth/session",
    "/api/public/dbxv2/cpk-private",
  ])
    expect(route(path).kind).toBe("deny");
  expect(route("/api/catalog", "POST").kind).toBe("deny");
  expect(route("/api/public/dbxv2/cpk/data/raw/model", "DELETE").kind).toBe("deny");
});

test("game shell renders the world with locale context and no site navigation or promotional overlays", () => {
  const html = renderToStaticMarkup(
    <GameSurfaceLayout>
      <main data-game-world="true" />
    </GameSurfaceLayout>,
  );
  expect(html).toContain('data-game-world="true"');
  expect(html).toContain("height:100dvh");
  expect(html).toContain("padding:0");
  for (const element of [
    "<nav",
    "<footer",
    "<header",
    "googletagmanager",
    "data-consent",
    "fab-discord",
  ])
    expect(html).not.toContain(element);
});

mock.module("@/lib/env", () => ({ env: { SHENRON_SITE_SURFACE: "game" } }));
mock.module("@/lib/proxy-admin", () => ({
  resolveVisitor: () => {
    throw Error("Game never resolves admin identity");
  },
}));
mock.module("@/lib/admin-ip", () => ({ isAdminIp: () => false }));
mock.module("@/lib/wiki-launch-config", () => ({
  getLaunchConfig: () => {
    throw Error("Game never reads launch administration");
  },
}));
mock.module("@/lib/member-roles", () => ({ getMemberRoleIds: () => [] }));
const { proxy } = await import("../src/proxy");

test("real game proxy rewrites root and denies private routes before any admin or database reader", async () => {
  const request = (path: string, method = "GET") =>
    new NextRequest(new URL(path, play), { method, headers: { host: new URL(play).host } });
  const root = await proxy(request("/?stage=BFlbn"));
  expect(root.headers.get("x-middleware-rewrite")).toBe(play + "/games/dragon-pixel?stage=BFlbn");
  for (const path of ["/admin/launch", "/api/admin/users", "/api/auth/session"])
    expect((await proxy(request(path))).status).toBe(404);
  expect((await proxy(request("/api/catalog"))).headers.get("x-middleware-next")).toBe("1");
  expect((await proxy(request("/api/catalog", "POST"))).status).toBe(404);
});
