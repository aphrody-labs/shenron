// SPDX-License-Identifier: Apache-2.0
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";

export const userHome = (): string => homedir();
export const homePath = (...parts: string[]): string => resolve(homedir(), ...parts);

/** Temporary files: SHENRON_TMP_DIR, else the OS temp directory. */
export const tempPath = (...parts: string[]): string =>
  resolve(process.env.SHENRON_TMP_DIR?.trim() || tmpdir(), ...parts);

/** Persistent state: SHENRON_HOME, else ~/.shenron. */
export const statePath = (...parts: string[]): string =>
  resolve(process.env.SHENRON_HOME?.trim() || homePath(".shenron"), ...parts);

/** Cache: SHENRON_CACHE_DIR, else the platform cache directory. */
export function cachePath(...parts: string[]): string {
  const explicit = process.env.SHENRON_CACHE_DIR?.trim();
  if (explicit) return resolve(explicit, ...parts);
  if (process.platform === "win32")
    return resolve(
      process.env.LOCALAPPDATA || homePath("AppData", "Local"),
      "Shenron",
      "cache",
      ...parts,
    );
  if (process.platform === "darwin") return homePath("Library", "Caches", "Shenron", ...parts);
  return resolve(process.env.XDG_CACHE_HOME || homePath(".cache"), "shenron", ...parts);
}
