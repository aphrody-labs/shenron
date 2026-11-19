// SPDX-License-Identifier: Apache-2.0
/**
 * Route prefixes whose pages instantiate WebAssembly (shenron-engine, shenron-re, Gecko, Dragon Pixel).
 * Only these get `'wasm-unsafe-eval'` in the `script-src` policy; every other route compiles no Wasm.
 */
export const WASM_ROUTE_PREFIXES = [
  "/admin/dashboard",
  "/admin/dbxv2",
  "/ask",
  "/canvas",
  "/games/budokai-tenkaichi-3",
  "/games/canon",
  "/games/dragon-pixel",
  "/games/xenoverse-2",
  "/studio",
  "/wiki/manga",
] as const;

export type CspRouteSources = {
  /** Rules that carry the Wasm policy: each prefix and everything below it. */
  wasm: string[];
  /** Rule that carries the policy without Wasm: every path outside the Wasm routes. */
  nonWasm: string;
};

/**
 * Header rules match the incoming path, before the proxy rewrite. The isolated game surface rewrites
 * `/` to the Dragon Pixel world (`GAME_WORLD_PATH`), so there `/` is itself a Wasm route.
 */
export function cspRouteSources(surface: "site" | "game"): CspRouteSources {
  const rootIsWasm = surface === "game";
  const prefixes = WASM_ROUTE_PREFIXES.map((prefix) => prefix.slice(1)).join("|");
  const excluded = rootIsWasm ? `(?:${prefixes})(?:/|$)|$` : `(?:${prefixes})(?:/|$)`;
  return {
    wasm: [
      ...(rootIsWasm ? ["/"] : []),
      ...WASM_ROUTE_PREFIXES.map((prefix) => `${prefix}/:path*`),
    ],
    nonWasm: `/:path((?!${excluded}).*)`,
  };
}
