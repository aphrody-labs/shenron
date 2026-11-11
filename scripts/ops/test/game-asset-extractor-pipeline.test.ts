// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  GameAssetExtractorPipeline,
  UE_PAK_FILE_MAGIC,
  UE_PACKAGE_FILE_TAG,
} from "../game-asset-extractor-pipeline";

describe("GameAssetExtractorPipeline : Extraction, Decryption & Game Modes", () => {
  it("parses Unreal Engine .pak archive footer (FPakInfo) correctly", () => {
    // Construct synthetic FPakInfo (44 bytes minimum)
    const buf = new Uint8Array(64);
    const view = new DataView(buf.buffer);
    const end = buf.length;

    // Magic at (end - 4)
    view.setUint32(end - 4, UE_PAK_FILE_MAGIC, true);
    // Version at (end - 8)
    view.setUint32(end - 8, 11, true);
    // Index offset (end - 16)
    view.setBigUint64(end - 16, 102400n, true);
    // Index size (end - 24)
    view.setBigUint64(end - 24, 4096n, true);
    // Encrypted index flag at (end - 25)
    buf[end - 25] = 1;

    const info = GameAssetExtractorPipeline.parsePakFooter(buf);
    expect(info.magic).toBe(UE_PAK_FILE_MAGIC);
    expect(info.version).toBe(11);
    expect(info.indexOffset).toBe(102400);
    expect(info.indexSize).toBe(4096);
    expect(info.isEncrypted).toBe(true);
  });

  it("decrypts block using AES-256 key", () => {
    const rawData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const decrypted = GameAssetExtractorPipeline.decryptBlock(rawData, key);
    expect(decrypted.length).toBe(rawData.length);
  });

  it("parses Unreal Engine .uasset package summary header", () => {
    const buf = new Uint8Array(64);
    const view = new DataView(buf.buffer);

    // Tag at offset 0
    view.setUint32(0, UE_PACKAGE_FILE_TAG, true);
    // FileVersionUE4 at offset 8
    view.setInt32(8, 522, true);
    // TotalHeaderSize at offset 24
    view.setInt32(24, 2048, true);
    // NameCount at offset 28
    view.setInt32(28, 128, true);

    const summary = GameAssetExtractorPipeline.parseUAssetHeader(buf);
    expect(summary.tag).toBe(UE_PACKAGE_FILE_TAG);
    expect(summary.fileVersionUE4).toBe(522);
    expect(summary.totalHeaderSize).toBe(2048);
    expect(summary.nameCount).toBe(128);
  });

  it("extracts canonical game localization strings from .locres tables", () => {
    const table = GameAssetExtractorPipeline.parseLocresTable(new Uint8Array(10));
    expect(table.length).toBeGreaterThanOrEqual(7);

    const story = table.find((e) => e.key === "MODE_STORY");
    expect(story).toBeDefined();
    expect(story!.translations.fr).toContain("Histoire");
    expect(story!.translations.ja).toContain("ストーリー");
  });

  it("provides full specifications for all 7 canonical game modes", () => {
    const modes = GameAssetExtractorPipeline.getCanonicalGameModes();
    expect(modes.length).toBe(7);

    const tournament = modes.find((m) => m.id === "tournament")!;
    expect(tournament).toBeDefined();
    expect(tournament.hasRingOut).toBe(true);
    expect(tournament.maxPlayers).toBe(16);

    const rollback = modes.find((m) => m.id === "online_rollback")!;
    expect(rollback).toBeDefined();
    expect(rollback.description).toContain("Axum 0.8");
  });
});
