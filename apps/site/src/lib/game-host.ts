// SPDX-License-Identifier: Apache-2.0
import { GAME_WORLD_PATH } from "@aphrody/shenron-config/game";

export type GameHostRoute = { kind: "rewrite" | "redirect"; url: URL } | { kind: "deny" | "next" };

/** The isolated game process serves its world and static files; public reading stays canonical. */
export function gameHostRoute(
  url: URL,
  gameOrigin: string,
  siteOrigin: string,
  method = "GET",
): GameHostRoute {
  if (url.pathname.startsWith("/api/")) {
    const publicRead =
      url.pathname === "/api/catalog" ||
      url.pathname === "/api/public/dbxv2/cpk" ||
      url.pathname.startsWith("/api/public/dbxv2/cpk/");
    return { kind: publicRead && ["GET", "HEAD"].includes(method) ? "next" : "deny" };
  }
  if (
    url.pathname === "/admin" ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/workshop/")
  )
    return { kind: "deny" };
  if (url.pathname === "/") {
    const target = new URL(url);
    target.pathname = GAME_WORLD_PATH;
    return { kind: "rewrite", url: target };
  }
  if (url.pathname === GAME_WORLD_PATH || url.pathname === GAME_WORLD_PATH + "/") {
    const target = new URL(gameOrigin);
    target.search = url.search;
    return { kind: "redirect", url: target };
  }
  if (
    (/^\/(?:_next|wasm|assets|fonts|wiki)\//.test(url.pathname) &&
      /\.[a-z0-9]+$/i.test(url.pathname)) ||
    /^\/(?:favicon[^/]*|icon\.svg|apple-touch-icon\.png|manifest\.webmanifest)$/.test(url.pathname)
  )
    return { kind: "next" };
  const target = new URL(siteOrigin);
  target.pathname = url.pathname;
  target.search = url.search;
  return { kind: "redirect", url: target };
}
