// SPDX-License-Identifier: Apache-2.0
/**
 * Rust artifacts are built in the sibling repository aphrody-labs/wiki, never here. This module
 * resolves where a Bun script finds them:
 *
 * - `SHENRON_WIKI_DIR`: the wiki checkout (default `../wiki`, next to this repository).
 * - `SHENRON_NATIVE_DIR`: a directory holding the native outputs (`shenron-mcp`, `libshenron_ffi.so`,
 *   `koharu-sdk`, and the Windows `.exe`/`.dll`), flat or laid out as cargo does
 *   (`<triple>/<profile>/<file>`); it wins over the wiki checkout.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

/** Sibling checkout of aphrody-labs/wiki (the Rust workspace). */
export const WIKI_DIR = resolve(process.env.SHENRON_WIKI_DIR ?? join(ROOT, "..", "wiki"));

/** Cargo profiles a native artifact may come from, shipped first. */
const PROFILES = ["production", "release"] as const;

/**
 * A directory produced by the wiki build: `$<envName>` when set, else the first of
 * `<wiki>/<defaults…>` that exists. Fails with the way to produce it, never builds it.
 */
export function wikiDir(envName: string, ...defaults: string[]): string {
  const override = process.env[envName];
  if (override) {
    if (!existsSync(override)) throw new Error(`${envName}=${override} does not exist`);
    return resolve(override);
  }
  const candidates = defaults.map((path) => join(WIKI_DIR, path));
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  throw new Error(
    `${envName} is unset and none of ${candidates.join(", ")} exists: build it in aphrody-labs/wiki ` +
      "(Rust is not built in this repository) and point " +
      `${envName} (or SHENRON_WIKI_DIR) at the output`,
  );
}

/** Path of one native artifact of a Rust target triple, or undefined when it is not built. */
export function nativeArtifact(triple: string, file: string): string | undefined {
  const roots = [process.env.SHENRON_NATIVE_DIR, join(WIKI_DIR, "target")].filter(
    (root): root is string => Boolean(root),
  );
  for (const root of roots) {
    const candidates = [
      join(root, file),
      ...PROFILES.flatMap((profile) => [
        join(root, triple, profile, file),
        join(root, profile, file),
      ]),
    ];
    const found = candidates.find((path) => existsSync(path));
    if (found) return found;
  }
  return undefined;
}

/**
 * Where the native GPUI theme files (`shenron.json`, `compose-m3-springs.json`) are written, in the
 * wiki checkout: `$SHENRON_THEME_DIR`, else `<wiki>/crates/shenron-theme/themes` when that crate
 * exists. Undefined when there is no wiki checkout: the generators then skip those outputs.
 */
export function themeDir(): string | undefined {
  const override = process.env.SHENRON_THEME_DIR;
  if (override) return resolve(override);
  const crate = join(WIKI_DIR, "crates", "shenron-theme");
  return existsSync(crate) ? join(crate, "themes") : undefined;
}
