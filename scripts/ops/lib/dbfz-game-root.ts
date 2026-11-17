// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";

/**
 * DRAGON BALL FighterZ install directory: `DBFZ_GAME_ROOT` (or `UE_GAME_ROOT`), else the default
 * Steam library under `ProgramFiles(x86)`.
 */
export function dbfzGameRoot(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.DBFZ_GAME_ROOT ||
    env.UE_GAME_ROOT ||
    join(env["ProgramFiles(x86)"] ?? "", "Steam", "steamapps", "common", "DRAGON BALL FighterZ")
  );
}
