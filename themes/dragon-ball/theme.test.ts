// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;
const root = join(dir, "..", "..");
const LICENSE = "LicenseRef-DBFR-Rights-Holder-Authorized-2026-11-05";
const CDN = "https://cdn.dragonballfr.com/";
const toml = Bun.TOML.parse(readFileSync(join(dir, "theme.toml"), "utf8")) as Record<string, any>;

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
// CDN path -> repository file that the CDN serves byte for byte.
function repoFile(url: string): string | null {
  const path = url.slice(CDN.length);
  for (const base of ["apps/site/public", "packages/ui/assets"]) {
    const f = join(root, base, path);
    if (existsSync(f)) return f;
  }
  return null;
}

describe("dragon-ball theme pack", () => {
  test("seed only: no pinned colour role", () => {
    expect(toml.color.seed).toBe("#fcf03a");
    expect(toml.color.overrides).toBeUndefined();
  });
  test("every referenced licence is the owner-decision LicenseRef", () => {
    const all = [...toml.wallpapers, ...Object.values<any>(toml.assets)];
    for (const a of all) expect(a.license).toBe(LICENSE);
    expect(readFileSync(join(dir, "PROVENANCE.md"), "utf8")).toContain("2026-11-05");
  });
  test("light and dark wallpapers exist", () => {
    const modes = new Set(toml.wallpapers.map((w: any) => w.mode));
    expect(modes.has("light") && modes.has("dark")).toBe(true);
  });
  test("pack-local files exist", () => {
    for (const f of [toml.logo.mark, toml.logo.monochrome, toml.logo.wordmark, ...Object.values<string>(toml.pet.files)])
      expect(existsSync(join(dir, f))).toBe(true);
  });
  test("sha256 matches the repository copy served by the CDN", () => {
    let checked = 0;
    for (const a of [...toml.wallpapers, ...Object.values<any>(toml.assets)]) {
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      const f = repoFile(a.file);
      if (f) {
        expect(sha(f)).toBe(a.sha256);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});
