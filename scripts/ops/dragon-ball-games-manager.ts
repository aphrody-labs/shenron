#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Ultimate Dragon Ball Games Package Manager CLI.
 *
 * Usage:
 *   bun scripts/ops/dragon-ball-games-manager.ts search <query>
 *   bun scripts/ops/dragon-ball-games-manager.ts info <slug>
 *   bun scripts/ops/dragon-ball-games-manager.ts list [--platform <platform>]
 *   bun scripts/ops/dragon-ball-games-manager.ts steamcmd <slug> [--install-dir <dir>]
 *   bun scripts/ops/dragon-ball-games-manager.ts retroarch <slug>
 *   bun scripts/ops/dragon-ball-games-manager.ts manifest
 *   bun scripts/ops/dragon-ball-games-manager.ts serve [--port 3030]
 */

import { DragonBallGamesManager } from "../../packages/engine/src/games/manager";
import type { GamePlatform } from "../../packages/engine/src/games/catalog";

const manager = new DragonBallGamesManager();
const command = process.argv[2] ?? "help";
const arg = process.argv[3];

function print(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

switch (command) {
  case "search": {
    if (!arg) {
      console.error("Usage: dragon-ball-games-manager search <query>");
      process.exit(1);
    }
    const results = manager.search(arg);
    console.log(`Found ${results.length} game(s) matching "${arg}":`);
    print(results);
    break;
  }

  case "info": {
    if (!arg) {
      console.error("Usage: dragon-ball-games-manager info <slug>");
      process.exit(1);
    }
    const pkg = manager.resolvePackage(arg);
    if (!pkg) {
      console.error(`Error: Game not found with slug "${arg}"`);
      process.exit(1);
    }
    print(pkg);
    break;
  }

  case "list": {
    const platformIdx = process.argv.indexOf("--platform");
    if (platformIdx >= 0 && process.argv[platformIdx + 1]) {
      const plat = process.argv[platformIdx + 1] as GamePlatform;
      const games = manager.byPlatform(plat);
      console.log(`Games for platform "${plat}" (${games.length}):`);
      print(games);
    } else {
      const all = manager.search("");
      console.log(`All Dragon Ball Games in Catalog (${all.length}):`);
      print(all);
    }
    break;
  }

  case "steamcmd": {
    if (!arg) {
      console.error("Usage: dragon-ball-games-manager steamcmd <slug> [--install-dir <dir>]");
      process.exit(1);
    }
    const pkg = manager.resolvePackage(arg);
    if (!pkg?.steam) {
      console.error(`Error: Game "${arg}" does not have Steam/SteamDB metadata`);
      process.exit(1);
    }
    console.log(pkg.steam.steamcmdScript);
    break;
  }

  case "retroarch": {
    if (!arg) {
      console.error("Usage: dragon-ball-games-manager retroarch <slug>");
      process.exit(1);
    }
    const pkg = manager.resolvePackage(arg);
    if (!pkg?.retroarch?.core) {
      console.error(`Error: Game "${arg}" does not have Libretro/RetroArch configuration`);
      process.exit(1);
    }
    console.log(`Core: ${pkg.retroarch.core.coreName} (${pkg.retroarch.core.coreId})`);
    console.log(`Download: ${pkg.retroarch.buildbotDownloadUrl ?? "N/A"}`);
    console.log(`Config:\n${pkg.retroarch.config}`);
    break;
  }

  case "manifest": {
    print(manager.buildManifest());
    break;
  }

  case "serve": {
    const portIdx = process.argv.indexOf("--port");
    const port = portIdx >= 0 ? Number(process.argv[portIdx + 1]) : 3030;
    console.log(`[GAMES-ENGINE] Starting Dragon Ball Games API on port ${port}...`);
    const server = manager.serve(port);
    console.log(`[GAMES-ENGINE] Listening at http://localhost:${server.port}`);
    break;
  }

  default:
    console.log(`Dragon Ball Ultimate Games Package Manager (Bun v1.4.4)

Commands:
  search <query>                       Search games across titles, Japanese, and platforms
  info <slug>                          Resolve complete game package (Steam, Libretro, R2)
  list [--platform <p>]                List all games, optionally filtered by platform
  steamcmd <slug>                      Generate automated SteamCMD script
  retroarch <slug>                     Generate RetroArch core resolution & config
  manifest                             Generate Cloudflare R2 deployment manifest
  serve [--port 3030]                  Start high-speed REST API daemon
`);
    break;
}
