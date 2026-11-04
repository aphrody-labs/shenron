// SPDX-License-Identifier: Apache-2.0
/** Public game origins and server surface profile, without global environment access. */
export const DEFAULT_GAME_ORIGINS = {
  play: "https://play.dragonballfr.com",
  api: "https://game-api.dragonballfr.com",
} as const;

type Environment = Readonly<Record<string, string | undefined>>;

function origin(value: string | undefined, fallback: string): string {
  const url = new URL(value?.trim() || fallback);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid game origin");
  return url.origin;
}

export function resolveGameUrl(env: Environment): string {
  return origin(
    env.NEXT_PUBLIC_GAME_URL?.trim() || env.SHENRON_PUBLIC_GAME_URL,
    DEFAULT_GAME_ORIGINS.play,
  );
}

export function resolveGameApiUrl(env: Environment): string {
  return origin(
    env.NEXT_PUBLIC_GAME_API_URL?.trim() || env.SHENRON_PUBLIC_GAME_API_URL,
    DEFAULT_GAME_ORIGINS.api,
  );
}

/** Separate server process profile; site rendering never needs request headers. */
export function resolveSiteSurface(env: Environment): "site" | "game" {
  const surface = env.SHENRON_SITE_SURFACE?.trim() || DEFAULT_SITE_SURFACE;
  if (surface !== "site" && surface !== "game") throw new Error("Invalid site surface");
  return surface;
}

export const GAME_WORLD_PATH = "/games/dragon-pixel";
export const DEFAULT_SITE_SURFACE = "site" as const;
