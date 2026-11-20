// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Dragon Ball FighterZ : Byte-Exact R2 CDN Manifest", () => {
  const candidate1 = resolve("docs/games/dbfz-r2-manifest.json");
  const candidate2 = resolve("../../docs/games/dbfz-r2-manifest.json");
  const manifestPath = existsSync(candidate1) ? candidate1 : candidate2;

  it("loads the cryptographic manifest and validates totals", () => {
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.game).toBe("DRAGON BALL FighterZ");
    expect(manifest.totalFiles).toBe(63);
    expect(manifest.totalBytes).toBe(6951922626);
    expect(manifest.cdnPrefix).toBe("https://cdn.dragonballfr.com/games/dbfz");
    expect(manifest.r2Bucket).toBe("shenron-cdn");
    expect(manifest.files.length).toBe(63);
  });

  it("verifies byte-exact checksums and content-addressed storage keys", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    const pak0 = manifest.files.find((f: any) =>
      f.relativePath.endsWith("pakchunk0-WindowsNoEditor.pak"),
    );
    expect(pak0).toBeDefined();
    expect(pak0.sizeBytes).toBe(5414923132);
    expect(pak0.sha256.length).toBe(64);
    expect(pak0.r2ObjectKey).toBe(`_objects/${pak0.sha256}`);
    expect(pak0.cacheControl).toContain("immutable");

    const pak1 = manifest.files.find((f: any) =>
      f.relativePath.endsWith("pakchunk1-WindowsNoEditor.pak"),
    );
    expect(pak1).toBeDefined();
    expect(pak1.sizeBytes).toBe(881949120);
    expect(pak1.sha256.length).toBe(64);

    const monolith = manifest.files.find((f: any) =>
      f.relativePath.endsWith("RED-Win64-Shipping.exe"),
    );
    expect(monolith).toBeDefined();
    expect(monolith.sizeBytes).toBe(184261120);

    const launcher = manifest.files.find((f: any) => f.relativePath === "DBFighterZ.exe");
    expect(launcher).toBeDefined();
    expect(launcher.sizeBytes).toBe(1518192);
  });
});
