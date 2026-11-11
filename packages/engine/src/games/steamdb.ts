// SPDX-License-Identifier: Apache-2.0
/**
 * SteamDB and SteamCMD integration module for Dragon Ball games.
 * Generates automated SteamCMD depot extraction scripts, validates
 * licenses and manifests, and parses public SteamDB metadata.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SteamGameMetadata {
  appId: number;
  name: string;
  steamDbUrl: string;
  storeUrl: string;
  launchProtocol: string;
  commonDepots: number[];
  clientIconUrl?: string;
  defaultInstallFolder: string;
}

export const DB_STEAM_METADATA: Record<number, SteamGameMetadata> = {
  // Sparking! ZERO
  1790600: {
    appId: 1790600,
    name: "DRAGON BALL: Sparking! ZERO",
    steamDbUrl: "https://steamdb.info/app/1790600/",
    storeUrl: "https://store.steampowered.com/app/1790600/",
    launchProtocol: "steam://run/1790600",
    commonDepots: [1790601, 1790602],
    defaultInstallFolder: "DRAGON BALL Sparking! ZERO",
  },
  // Xenoverse 2
  454650: {
    appId: 454650,
    name: "DRAGON BALL Xenoverse 2",
    steamDbUrl: "https://steamdb.info/app/454650/",
    storeUrl: "https://store.steampowered.com/app/454650/",
    launchProtocol: "steam://run/454650",
    commonDepots: [454651, 454652, 454653],
    defaultInstallFolder: "DB Xenoverse 2",
  },
  // Kakarot
  851850: {
    appId: 851850,
    name: "DRAGON BALL Z: KAKAROT",
    steamDbUrl: "https://steamdb.info/app/851850/",
    storeUrl: "https://store.steampowered.com/app/851850/",
    launchProtocol: "steam://run/851850",
    commonDepots: [851851, 851852],
    defaultInstallFolder: "DRAGON BALL Z KAKAROT",
  },
  // FighterZ
  678950: {
    appId: 678950,
    name: "DRAGON BALL FighterZ",
    steamDbUrl: "https://steamdb.info/app/678950/",
    storeUrl: "https://store.steampowered.com/app/678950/",
    launchProtocol: "steam://run/678950",
    commonDepots: [678951, 678952],
    defaultInstallFolder: "DRAGON BALL FighterZ",
  },
  // The Breakers
  1276760: {
    appId: 1276760,
    name: "DRAGON BALL: THE BREAKERS",
    steamDbUrl: "https://steamdb.info/app/1276760/",
    storeUrl: "https://store.steampowered.com/app/1276760/",
    launchProtocol: "steam://run/1276760",
    commonDepots: [1276761, 1276762],
    defaultInstallFolder: "DRAGON BALL THE BREAKERS",
  },
  // Xenoverse 1
  323470: {
    appId: 323470,
    name: "DRAGON BALL Xenoverse",
    steamDbUrl: "https://steamdb.info/app/323470/",
    storeUrl: "https://store.steampowered.com/app/323470/",
    launchProtocol: "steam://run/323470",
    commonDepots: [323471, 323472, 323473],
    defaultInstallFolder: "DB Xenoverse",
  },
};

export interface SteamcmdScriptOptions {
  appId: number;
  installDir: string;
  username?: string;
  password?: string;
  validate?: boolean;
}

/**
 * Generates an automated headless SteamCMD synchronization script.
 */
export function generateSteamcmdScript(options: SteamcmdScriptOptions): string {
  const { appId, installDir, username = "anonymous", password, validate = true } = options;
  const login = password ? `login ${username} ${password}` : `login ${username}`;
  const validation = validate ? " validate" : "";

  return (
    [
      `@ShutdownOnFailedCommand 1`,
      `@NoPromptForPassword 1`,
      `force_install_dir ${installDir.replaceAll("\\", "/")}`,
      login,
      `app_update ${appId}${validation}`,
      `quit`,
    ].join("\n") + "\n"
  );
}

/**
 * Resolves local Steam library folder and verifies if a game is installed.
 */
export function detectSteamInstallation(
  appId: number,
  steamLibraries: string[] = ["C:/Program Files (x86)/Steam", "D:/SteamLibrary", "E:/SteamLibrary"],
): { installed: boolean; path?: string; manifestPath?: string } {
  for (const lib of steamLibraries) {
    const manifest = join(lib, "steamapps", `appmanifest_${appId}.acf`);
    if (existsSync(manifest)) {
      const meta = DB_STEAM_METADATA[appId];
      const gameDir = meta
        ? join(lib, "steamapps", "common", meta.defaultInstallFolder)
        : join(lib, "steamapps", "common");
      return {
        installed: true,
        path: gameDir,
        manifestPath: manifest,
      };
    }
  }
  return { installed: false };
}
