// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  DbfzDumpConverter,
  CANONICAL_CHARACTERS,
  CANONICAL_STAGES,
} from "../../../scripts/ops/dbfz-full-dump-converter";

describe("Dragon Ball FighterZ Full Dump & Converter", () => {
  it("defines 25 canonical playable characters and 7 tournament stages", () => {
    expect(CANONICAL_CHARACTERS.length).toBe(25);
    expect(CANONICAL_STAGES.length).toBe(7);

    const goku = CANONICAL_CHARACTERS.find((c) => c.code === "GKU");
    expect(goku).toBeDefined();
    expect(goku?.name).toContain("Son Goku");

    const tenkaichi = CANONICAL_STAGES.find((s) => s.code === "TNK");
    expect(tenkaichi).toBeDefined();
    expect(tenkaichi?.name).toContain("Tenkaichi");
  });

  it("executes dump and asset conversion pipeline with dry-run mode", async () => {
    const manifest = await DbfzDumpConverter.execute({ dryRun: true });
    expect(manifest.gameTitle).toBe("DRAGON BALL FighterZ");
    expect(manifest.appId).toBe(678950);
    expect(manifest.assets.length).toBeGreaterThanOrEqual(32);
    expect(manifest.overallCompressionRatio).toBeGreaterThan(1.0);
    expect(manifest.totalOriginalBytes).toBeGreaterThan(0);
    expect(manifest.totalCompressedBytes).toBeLessThan(manifest.totalOriginalBytes);

    for (const asset of manifest.assets) {
      expect(asset.cdnUrl).toContain("https://cdn.dragonballfr.com/games/dbfz");
      expect(asset.sha256).toBeDefined();
      expect(asset.httpHeaders.cacheControl).toContain("immutable");
    }
  });
});
