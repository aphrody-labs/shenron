// SPDX-License-Identifier: Apache-2.0
/**
 * Ultimate Dragon Ball Games Package Manager Core Engine.
 * Fuses SteamDB, RetroArch/Libretro cores, community mods, and
 * Cloudflare R2 storage into a high-performance CLI and HTTP service.
 */

import {
  DRAGON_BALL_GAMES_CATALOG,
  findGameBySlug,
  findGamesByPlatform,
  searchGames,
  type GamePlatform,
  type GameRelease,
} from "./catalog";
import { DB_STEAM_METADATA, generateSteamcmdScript, detectSteamInstallation } from "./steamdb";
import { resolveCoreForGame, getCoreDownloadUrl, generateRetroarchGameConfig } from "./retroarch";
import { GameStorageManager } from "./r2-storage";

export interface ResolvedGamePackage {
  game: GameRelease;
  steam?: {
    metadata: (typeof DB_STEAM_METADATA)[number];
    steamcmdScript: string;
    localDetection: ReturnType<typeof detectSteamInstallation>;
  };
  retroarch?: {
    core: NonNullable<ReturnType<typeof resolveCoreForGame>>;
    buildbotDownloadUrl?: string;
    config: string;
  };
  storage: {
    cdnUrl: string;
    r2Key?: string;
  };
}

export class DragonBallGamesManager {
  readonly storage: GameStorageManager;

  constructor(storageConfig = {}) {
    this.storage = new GameStorageManager(storageConfig);
  }

  /**
   * Search games across title, Japanese title, platform, developer.
   */
  search(query: string): GameRelease[] {
    return searchGames(query);
  }

  /**
   * Find game by slug or ID.
   */
  get(slug: string): GameRelease | undefined {
    return findGameBySlug(slug);
  }

  /**
   * List all games by platform.
   */
  byPlatform(platform: GamePlatform): GameRelease[] {
    return findGamesByPlatform(platform);
  }

  /**
   * Get complete resolution package for a game (Steam, Libretro, R2, Config).
   */
  resolvePackage(slug: string): ResolvedGamePackage | undefined {
    const game = this.get(slug);
    if (!game) return undefined;

    let steamData: ResolvedGamePackage["steam"] = undefined;
    if (game.steamAppId && DB_STEAM_METADATA[game.steamAppId]) {
      const meta = DB_STEAM_METADATA[game.steamAppId];
      steamData = {
        metadata: meta,
        steamcmdScript: generateSteamcmdScript({
          appId: game.steamAppId,
          installDir: `/srv/games/steam/${game.steamAppId}`,
        }),
        localDetection: detectSteamInstallation(game.steamAppId),
      };
    }

    let retroarchData: ResolvedGamePackage["retroarch"] = undefined;
    const core = resolveCoreForGame(game);
    if (core) {
      retroarchData = {
        core,
        buildbotDownloadUrl: getCoreDownloadUrl(core.buildbotSlug),
        config: generateRetroarchGameConfig(game),
      };
    }

    return {
      game,
      steam: steamData,
      retroarch: retroarchData,
      storage: {
        cdnUrl: this.storage.resolveCdnUrl(game),
        r2Key: game.r2StorageKey,
      },
    };
  }

  /**
   * Generates R2 deployment catalog manifest.
   */
  buildManifest(): Record<string, unknown> {
    return this.storage.generateManifest(DRAGON_BALL_GAMES_CATALOG);
  }

  /**
   * Starts a high-speed native Bun HTTP server for local or Docker edge service.
   */
  serve(port = 3030) {
    return Bun.serve({
      port,
      fetch: (req) => {
        const url = new URL(req.url);

        // CORS headers for WebAssembly cross-origin isolation
        const headers = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Content-Type": "application/json",
        };

        if (req.method === "OPTIONS") {
          return new Response(null, { headers });
        }

        // Healthz
        if (url.pathname === "/healthz") {
          return Response.json(
            { status: "ok", gamesCount: DRAGON_BALL_GAMES_CATALOG.length, engine: "Bun v1.4.4" },
            { headers },
          );
        }

        // Manifest
        if (url.pathname === "/api/games/manifest") {
          return Response.json(this.buildManifest(), { headers });
        }

        // Search
        if (url.pathname === "/api/games/search") {
          const q = url.searchParams.get("q") ?? "";
          const results = this.search(q);
          return Response.json({ query: q, count: results.length, results }, { headers });
        }

        // Platform filter
        if (url.pathname.startsWith("/api/games/platform/")) {
          const plat = url.pathname.replace("/api/games/platform/", "") as GamePlatform;
          const results = this.byPlatform(plat);
          return Response.json({ platform: plat, count: results.length, results }, { headers });
        }

        // Detail
        if (url.pathname.startsWith("/api/games/")) {
          const slug = url.pathname.replace("/api/games/", "");
          const pkg = this.resolvePackage(slug);
          if (!pkg) {
            return new Response(JSON.stringify({ error: `Game not found: ${slug}` }), {
              status: 404,
              headers,
            });
          }
          return Response.json(pkg, { headers });
        }

        return new Response(JSON.stringify({ error: "Endpoint not found" }), {
          status: 404,
          headers,
        });
      },
    });
  }
}
