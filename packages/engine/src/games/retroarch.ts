// SPDX-License-Identifier: Apache-2.0
/**
 * RetroArch and Libretro cores integration for Dragon Ball emulation.
 * Manages core downloads from official Libretro buildbot, generates
 * RetroArch configs, controller autoconfigs and shader presets.
 */

import type { GamePlatform, GameRelease } from "./catalog";

export interface LibretroCoreInfo {
  coreId: string;
  coreName: string;
  platform: GamePlatform;
  systemName: string;
  authors: string;
  supportedExtensions: string[];
  license: string;
  needsBios: boolean;
  biosFilenames?: string[];
  buildbotSlug: string;
}

export const LIBRETRO_CORES: Record<string, LibretroCoreInfo> = {
  dolphin_libretro: {
    coreId: "dolphin_libretro",
    coreName: "Dolphin (GameCube / Wii)",
    platform: "wii",
    systemName: "Nintendo GameCube / Wii",
    authors: "Dolphin Team",
    supportedExtensions: ["rvz", "iso", "wbfs", "gcm", "dol", "elf"],
    license: "GPLv2+",
    needsBios: false,
    buildbotSlug: "dolphin_libretro",
  },
  pcsx2_libretro: {
    coreId: "pcsx2_libretro",
    coreName: "PCSX2 (PlayStation 2)",
    platform: "ps2",
    systemName: "Sony PlayStation 2",
    authors: "PCSX2 Team",
    supportedExtensions: ["chd", "iso", "cso", "bin", "elf", "gz"],
    license: "GPLv3",
    needsBios: true,
    biosFilenames: ["scph39001.bin", "scph39004.bin", "scph70004.bin"],
    buildbotSlug: "pcsx2_libretro",
  },
  swanstation_libretro: {
    coreId: "swanstation_libretro",
    coreName: "SwanStation (PlayStation 1)",
    platform: "ps1",
    systemName: "Sony PlayStation 1",
    authors: "Stenzek",
    supportedExtensions: ["chd", "cue", "bin", "iso", "pbp"],
    license: "GPLv3",
    needsBios: true,
    biosFilenames: ["scph5500.bin", "scph5501.bin", "scph5502.bin"],
    buildbotSlug: "swanstation_libretro",
  },
  mgba_libretro: {
    coreId: "mgba_libretro",
    coreName: "mGBA (Game Boy Advance)",
    platform: "gba",
    systemName: "Game Boy Advance",
    authors: "Jeffrey Pfau",
    supportedExtensions: ["gba", "zip", "7z"],
    license: "MPLv2",
    needsBios: false,
    biosFilenames: ["gba_bios.bin"],
    buildbotSlug: "mgba_libretro",
  },
  melonds_libretro: {
    coreId: "melonds_libretro",
    coreName: "melonDS (Nintendo DS)",
    platform: "nds",
    systemName: "Nintendo DS",
    authors: "StapleButter",
    supportedExtensions: ["nds", "zip", "7z"],
    license: "GPLv3",
    needsBios: true,
    biosFilenames: ["bios7.bin", "bios9.bin", "firmware.bin"],
    buildbotSlug: "melonds_libretro",
  },
  snes9x_libretro: {
    coreId: "snes9x_libretro",
    coreName: "Snes9x (Super Nintendo)",
    platform: "snes",
    systemName: "Super Nintendo / Super Famicom",
    authors: "Snes9x Team",
    supportedExtensions: ["sfc", "smc", "zip", "7z"],
    license: "Non-commercial",
    needsBios: false,
    buildbotSlug: "snes9x_libretro",
  },
  genesis_plus_gx_libretro: {
    coreId: "genesis_plus_gx_libretro",
    coreName: "Genesis Plus GX (Mega Drive)",
    platform: "megadrive",
    systemName: "Sega Mega Drive / Genesis",
    authors: "Charles MacDonald, Eke-Eke",
    supportedExtensions: ["md", "gen", "bin", "zip"],
    license: "Non-commercial",
    needsBios: false,
    buildbotSlug: "genesis_plus_gx_libretro",
  },
  fbneo_libretro: {
    coreId: "fbneo_libretro",
    coreName: "FinalBurn Neo (Arcade)",
    platform: "arcade",
    systemName: "Arcade (Neo Geo, CPS, Banpresto)",
    authors: "FBNeo Team",
    supportedExtensions: ["zip", "7z"],
    license: "Non-commercial",
    needsBios: false,
    buildbotSlug: "fbneo_libretro",
  },
};

export function resolveCoreForGame(game: GameRelease): LibretroCoreInfo | undefined {
  if (game.libretroCore && LIBRETRO_CORES[game.libretroCore]) {
    return LIBRETRO_CORES[game.libretroCore];
  }
  return Object.values(LIBRETRO_CORES).find((c) => c.platform === game.platform);
}

/**
 * Returns the official Libretro buildbot download URL for a core.
 */
export function getCoreDownloadUrl(
  coreSlug: string,
  targetOs: "windows" | "linux" = process.platform === "win32" ? "windows" : "linux",
  _arch: "x86_64" = "x86_64",
): string {
  const ext = targetOs === "windows" ? ".dll.zip" : ".so.zip";
  const osFolder = targetOs === "windows" ? "windows/x86_64" : "linux/x86_64";
  return `https://buildbot.libretro.com/nightly/${osFolder}/latest/${coreSlug}${ext}`;
}

/**
 * Generates an optimized RetroArch game configuration with proper aspect ratio,
 * fast-forward, vsync, and controller auto-binding.
 */
export function generateRetroarchGameConfig(game: GameRelease): string {
  const isWidescreen = game.platform === "wii" || game.platform === "steam";
  const lines = [
    `# Shenron RetroArch Config for ${game.title} (${game.platform.toUpperCase()})`,
    `aspect_ratio_index = "${isWidescreen ? "1" : "0"}"`, // 1 = 16:9, 0 = 4:3
    `video_vsync = "true"`,
    `video_max_swapchain_images = "3"`,
    `video_hard_sync = "true"`,
    `audio_latency = "64"`,
    `audio_sync = "true"`,
    `rewind_enable = "true"`,
    `rewind_granularity = "1"`,
    `savestate_auto_save = "true"`,
    `savestate_auto_load = "true"`,
    `menu_driver = "ozone"`,
    `input_autodetect_enable = "true"`,
  ];
  return lines.join("\n") + "\n";
}
