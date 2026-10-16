// SPDX-License-Identifier: Apache-2.0
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_RELEASES_DIR,
  resolveDataPath,
  type DataPath,
} from "@aphrody/shenron-config/paths";
import { serveSumsFile } from "@/lib/private-downloads";

/**
 * Public releases: `SHENRON_RELEASES_DIR` holds the binaries flat, their `SHA256SUMS` and the
 * `latest.json` manifest written by `scripts/release/publish-downloads.ts`. The page `/download`,
 * `/api/releases/latest` and the updater endpoint read only that manifest, so a deploy of the
 * site never changes what is offered.
 */

export type ReleaseOs = "windows" | "linux";
export type ReleaseKind = "studio" | "server" | "cli" | "mcp" | "bot";

export interface ReleaseAsset {
  name: string;
  os: ReleaseOs;
  arch: "x64";
  kind: ReleaseKind;
  size: number;
  sha256: string;
}

export interface ReleaseManifest {
  version: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

const KINDS: readonly ReleaseKind[] = ["studio", "server", "cli", "mcp", "bot"];
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function releasesDir(env: NodeJS.ProcessEnv = process.env): DataPath {
  return resolveDataPath("releasesDir", { env, legacyDefault: DEFAULT_RELEASES_DIR });
}

/** Validates an untrusted manifest; anything malformed yields `null`, never a partial result. */
export function parseManifest(value: unknown): ReleaseManifest | null {
  if (typeof value !== "object" || value === null) return null;
  const { version, publishedAt, assets } = value as Record<string, unknown>;
  if (typeof version !== "string" || !SEMVER.test(version)) return null;
  if (typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) return null;
  if (!Array.isArray(assets)) return null;
  const parsed: ReleaseAsset[] = [];
  for (const raw of assets as Record<string, unknown>[]) {
    const { name, os, arch, kind, size, sha256 } = raw ?? {};
    if (
      typeof name !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name) ||
      (os !== "windows" && os !== "linux") ||
      arch !== "x64" ||
      !KINDS.includes(kind as ReleaseKind) ||
      typeof size !== "number" ||
      !(size >= 0) ||
      typeof sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(sha256)
    )
      return null;
    parsed.push({ name, os, arch, kind: kind as ReleaseKind, size, sha256 });
  }
  return { version, publishedAt, assets: parsed };
}

export async function latestRelease(): Promise<ReleaseManifest | null> {
  try {
    return parseManifest(
      JSON.parse(await readFile(join(releasesDir().path, "latest.json"), "utf8")),
    );
  } catch {
    return null;
  }
}

/** `-1 | 0 | 1` for two release versions (pre-release sorts below its release). */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core = "", pre] = v.split("-", 2);
    return { nums: core.split(".").map(Number), pre };
  };
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === undefined) return 1;
  if (y.pre === undefined) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** Best guess of the visitor's platform from `User-Agent`; Linux is the fallback for the unknown. */
export function detectOs(userAgent: string | null): ReleaseOs {
  return /windows/i.test(userAgent ?? "") ? "windows" : "linux";
}

/** One asset per kind for an OS, Studio first. */
export function assetsFor(manifest: ReleaseManifest, os: ReleaseOs): ReleaseAsset[] {
  return KINDS.flatMap((kind) =>
    manifest.assets.filter((asset) => asset.os === os && asset.kind === kind),
  );
}

export function assetUrl(name: string): string {
  return `/api/releases/files/${encodeURIComponent(name)}`;
}

export function serveRelease(request: Request, name: string): Promise<Response> {
  return serveSumsFile(request, name, releasesDir().path, {
    "cache-control": "public, max-age=300, stale-while-revalidate=3600",
  });
}
