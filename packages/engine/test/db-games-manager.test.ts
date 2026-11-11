// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  DRAGON_BALL_GAMES_CATALOG,
  findGameBySlug,
  findGamesByPlatform,
  searchGames,
} from "../src/games/catalog";
import { DB_STEAM_METADATA, generateSteamcmdScript } from "../src/games/steamdb";
import {
  LIBRETRO_CORES,
  resolveCoreForGame,
  getCoreDownloadUrl,
  generateRetroarchGameConfig,
} from "../src/games/retroarch";
import { GameStorageManager } from "../src/games/r2-storage";
import { DragonBallGamesManager } from "../src/games/manager";

describe("Dragon Ball Games Catalog & Metadata", () => {
  test("catalog contains iconic Dragon Ball games across all eras", () => {
    expect(DRAGON_BALL_GAMES_CATALOG.length).toBeGreaterThanOrEqual(15);

    const bt3Wii = findGameBySlug("budokai-tenkaichi-3-wii");
    expect(bt3Wii).toBeDefined();
    expect(bt3Wii?.platform).toBe("wii");
    expect(bt3Wii?.serials?.europe).toBe("RDSP64");
    expect(bt3Wii?.serials?.usa).toBe("RDSE64");
    expect(bt3Wii?.libretroCore).toBe("dolphin_libretro");

    const sparkingZero = findGameBySlug("sparking-zero");
    expect(sparkingZero).toBeDefined();
    expect(sparkingZero?.steamAppId).toBe(1790600);
    expect(sparkingZero?.platform).toBe("steam");
  });

  test("search retrieves games by English, Japanese, and partial query", () => {
    const meteorHits = searchGames("Sparking! METEOR");
    expect(meteorHits.length).toBeGreaterThanOrEqual(2); // Wii & PS2 versions

    const kakarotHits = searchGames("kakarot");
    expect(kakarotHits.length).toBe(1);
    expect(kakarotHits[0]?.slug).toBe("kakarot");

    const snesGames = findGamesByPlatform("snes");
    expect(snesGames.length).toBeGreaterThanOrEqual(2);
    expect(snesGames.some((g) => g.slug === "super-butoden-2")).toBe(true);
  });
});

describe("SteamDB & SteamCMD Automation", () => {
  test("Steam metadata contains valid App IDs, store URLs, and launch protocols", () => {
    for (const [appIdStr, meta] of Object.entries(DB_STEAM_METADATA)) {
      const appId = Number(appIdStr);
      expect(meta.appId).toBe(appId);
      expect(meta.launchProtocol).toBe(`steam://run/${appId}`);
      expect(meta.storeUrl).toContain(String(appId));
      expect(meta.steamDbUrl).toContain(String(appId));
      expect(meta.commonDepots.length).toBeGreaterThan(0);
    }
  });

  test("generates compliant headless SteamCMD script", () => {
    const script = generateSteamcmdScript({
      appId: 1790600,
      installDir: "/srv/games/steam/1790600",
      username: "anonymous",
      validate: true,
    });

    expect(script).toContain("@ShutdownOnFailedCommand 1");
    expect(script).toContain("force_install_dir /srv/games/steam/1790600");
    expect(script).toContain("login anonymous");
    expect(script).toContain("app_update 1790600 validate");
    expect(script).toContain("quit");
  });
});

describe("RetroArch & Libretro Core Resolution", () => {
  test("resolves appropriate core for every console platform", () => {
    expect(LIBRETRO_CORES.dolphin_libretro.platform).toBe("wii");
    const bt3Ps2 = findGameBySlug("budokai-tenkaichi-3-ps2");
    expect(bt3Ps2).toBeDefined();
    const ps2Core = resolveCoreForGame(bt3Ps2!);
    expect(ps2Core?.coreId).toBe("pcsx2_libretro");
    expect(ps2Core?.needsBios).toBe(true);

    const legacy2 = findGameBySlug("legacy-of-goku-2");
    expect(legacy2).toBeDefined();
    const gbaCore = resolveCoreForGame(legacy2!);
    expect(gbaCore?.coreId).toBe("mgba_libretro");
    expect(gbaCore?.needsBios).toBe(false);
  });

  test("computes official buildbot download URLs for Windows & Linux", () => {
    const winUrl = getCoreDownloadUrl("dolphin_libretro", "windows");
    expect(winUrl).toBe(
      "https://buildbot.libretro.com/nightly/windows/x86_64/latest/dolphin_libretro.dll.zip",
    );

    const linuxUrl = getCoreDownloadUrl("dolphin_libretro", "linux");
    expect(linuxUrl).toBe(
      "https://buildbot.libretro.com/nightly/linux/x86_64/latest/dolphin_libretro.so.zip",
    );
  });

  test("generates low-latency RetroArch configuration for games", () => {
    const bt3Wii = findGameBySlug("budokai-tenkaichi-3-wii")!;
    const cfg = generateRetroarchGameConfig(bt3Wii);
    expect(cfg).toContain('aspect_ratio_index = "1"'); // 16:9 for Wii
    expect(cfg).toContain('video_vsync = "true"');
    expect(cfg).toContain('video_hard_sync = "true"');
  });
});

describe("Cloudflare R2 Storage & CDN Range Requests", () => {
  const storage = new GameStorageManager({
    publicCdnOrigin: "https://cdn.dragonballfr.com",
    bucket: "shenron-games",
  });

  test("resolves immutable CDN asset URLs", () => {
    const bt3Wii = findGameBySlug("budokai-tenkaichi-3-wii")!;
    const cdnUrl = storage.resolveCdnUrl(bt3Wii);
    expect(cdnUrl).toBe("https://cdn.dragonballfr.com/games/wii/RDSP64/budokai-tenkaichi-3.rvz");
  });

  test("generates complete sync manifest for edge deployments", () => {
    const manifest = storage.generateManifest(DRAGON_BALL_GAMES_CATALOG) as {
      schemaVersion: number;
      gamesCount: number;
      games: Array<{ id: string; cdnUrl: string }>;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.gamesCount).toBe(DRAGON_BALL_GAMES_CATALOG.length);
    expect(manifest.games.every((g) => g.cdnUrl.startsWith("https://cdn.dragonballfr.com/"))).toBe(
      true,
    );
  });
});

describe("Unified Games Manager HTTP Server", () => {
  const manager = new DragonBallGamesManager();
  const server = manager.serve(0); // Random free port

  test("serves healthz with games count and Bun runtime info", async () => {
    const res = await fetch(`http://localhost:${server.port}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; gamesCount: number; engine: string };
    expect(body.status).toBe("ok");
    expect(body.gamesCount).toBe(DRAGON_BALL_GAMES_CATALOG.length);
    expect(body.engine).toContain("Bun");
  });

  test("serves game package resolution over REST API", async () => {
    const res = await fetch(`http://localhost:${server.port}/api/games/xenoverse-2`);
    expect(res.status).toBe(200);
    const pkg = (await res.json()) as {
      game: { id: string; steamAppId: number };
      steam: { metadata: { appId: number } };
      storage: { cdnUrl: string };
    };
    expect(pkg.game.steamAppId).toBe(454650);
    expect(pkg.steam.metadata.appId).toBe(454650);
    expect(pkg.storage.cdnUrl).toBeDefined();
  });

  test("searches games via REST API query parameter", async () => {
    const res = await fetch(`http://localhost:${server.port}/api/games/search?q=tenkaichi`);
    expect(res.status).toBe(200);
    const searchResult = (await res.json()) as { query: string; count: number; results: unknown[] };
    expect(searchResult.count).toBeGreaterThanOrEqual(2);
  });

  test("closes server gracefully", () => {
    server.stop(true);
  });
});
