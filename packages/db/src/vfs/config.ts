// SPDX-License-Identifier: Apache-2.0
/** Environment defaults of the VFS: CDN mirrors, asset cache, offline switch. Runtime class: `server`. */
import { homedir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PUBLIC_ORIGINS } from "@shenron/config/public-urls";
import type { CdnOptions } from "./cdn";

/** Shenron CDN mirrors in fallback order, overridable by `SHENRON_CDN_URL` (comma list). */
export function cdnOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const configured = env.SHENRON_CDN_URL?.split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return configured?.length ? configured : [DEFAULT_PUBLIC_ORIGINS.cdn, DEFAULT_PUBLIC_ORIGINS.api];
}

/** Default asset cache: `SHENRON_VFS_CACHE`, else `$XDG_CACHE_HOME/shenron/vfs`, else `~/.cache/shenron/vfs`. */
export function defaultCacheDir(env: Record<string, string | undefined> = process.env): string {
  if (env.SHENRON_VFS_CACHE?.trim()) return env.SHENRON_VFS_CACHE.trim();
  const base = env.XDG_CACHE_HOME?.trim() || join(env.HOME ?? homedir(), ".cache");
  return join(base, "shenron", "vfs");
}

/** CDN options from the environment (`SHENRON_VFS_OFFLINE=1` disables the network). */
export function defaultCdn(env: Record<string, string | undefined> = process.env): CdnOptions {
  return {
    origins: cdnOrigins(env),
    cacheDir: defaultCacheDir(env),
    offline: env.SHENRON_VFS_OFFLINE === "1",
  };
}
