// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import {
  compressSync,
  decompressSync,
  detectCompressionFormat,
  computeCompressedAssetMeta,
  TextureConverter,
  MeshOptimizer,
  PakExtractor,
  UE4_PAK_MAGIC,
} from "../src/index";

describe("@aphrody/compression engine", () => {
  it("compresses and decompresses with GZIP round-trip", () => {
    const raw = new TextEncoder().encode(
      "Son Goku Kamehameha Dragon Ball FighterZ ArcSys".repeat(50),
    );
    const compressed = compressSync(raw, "gzip", { level: 6 });
    expect(compressed.length).toBeLessThan(raw.length);
    expect(detectCompressionFormat(compressed)).toBe("gzip");

    const decompressed = decompressSync(compressed, "gzip");
    expect(new TextDecoder().decode(decompressed)).toBe(new TextDecoder().decode(raw));
  });

  it("compresses and decompresses with Deflate / Zlib round-trip", () => {
    const raw = new TextEncoder().encode("Vegeta Final Flash Big Bang Attack".repeat(50));
    const compressed = compressSync(raw, "deflate", { level: 6 });
    expect(compressed.length).toBeLessThan(raw.length);
    expect(detectCompressionFormat(compressed)).toBe("deflate");

    const decompressed = decompressSync(compressed, "deflate");
    expect(new TextDecoder().decode(decompressed)).toBe(new TextDecoder().decode(raw));
  });

  it("compresses with Zstandard frame format and round-trips", () => {
    const raw = new TextEncoder().encode("Shenron Dragon Radar Seven Dragon Balls".repeat(50));
    const compressed = compressSync(raw, "zstd");
    expect(detectCompressionFormat(compressed)).toBe("zstd");

    const decompressed = decompressSync(compressed, "zstd");
    expect(new TextDecoder().decode(decompressed)).toBe(new TextDecoder().decode(raw));
  });

  it("computes accurate compression metadata and ratios", () => {
    const raw = new Uint8Array(10000).fill(42);
    const compressed = compressSync(raw, "gzip");
    const meta = computeCompressedAssetMeta(raw, compressed, "gzip");

    expect(meta.originalBytes).toBe(10000);
    expect(meta.compressedBytes).toBeLessThan(100);
    expect(meta.ratio).toBeGreaterThan(10);
    expect(meta.reductionPercent).toBeGreaterThan(90);
    expect(meta.sha256.length).toBe(64);
  });
});

describe("@aphrody/compression texture & mesh converters", () => {
  it("wraps RGBA texture into compliant KTX2 container", () => {
    const rgba = new Uint8Array(256 * 256 * 4).fill(255);
    const ktx2 = TextureConverter.createKtx2Container(rgba, 256, 256);

    expect(ktx2.length).toBeGreaterThan(rgba.length);
    // KTX2 Identifier check
    expect(ktx2[0]).toBe(0xab);
    expect(ktx2[1]).toBe(0x4b); // 'K'
    expect(ktx2[2]).toBe(0x54); // 'T'
    expect(ktx2[3]).toBe(0x58); // 'X'
  });

  it("quantizes 3D mesh vertex positions and encodes octahedral normals", () => {
    const positions = new Float32Array([0.0, 1.0, 2.0, -1.0, -2.0, 3.5]);
    const normals = new Float32Array([0.0, 1.0, 0.0, 1.0, 0.0, 0.0]);
    const indices = new Uint32Array([0, 1]);

    const optimized = MeshOptimizer.optimizeMesh(positions, normals, indices);
    expect(optimized.vertexCount).toBe(2);
    expect(optimized.quantized).toBe(true);
    // Position bytes: 6 floats quantized to 6 uint16 = 12 bytes
    expect(optimized.positionBytes.length).toBe(12);
    // Octahedral normals: 2 vertices * 2 bytes = 4 bytes (instead of 24 bytes)
    expect(optimized.normalBytes.length).toBe(4);
    // Index buffer: 2 indices * 2 bytes (uint16 downcast) = 4 bytes (instead of 8 bytes)
    expect(optimized.indexBytes.length).toBe(4);
  });

  it("parses UE4 Pak trailer and index table", () => {
    // Construct synthetic 44-byte trailer
    const trailerBuf = new Uint8Array(44);
    const view = new DataView(trailerBuf.buffer);
    view.setUint32(0, UE4_PAK_MAGIC, true); // Magic
    view.setUint32(4, 4, true); // Version
    view.setBigInt64(8, BigInt(1000), true); // Index offset
    view.setBigInt64(16, BigInt(256), true); // Index size

    const trailer = PakExtractor.parsePakTrailer(trailerBuf);
    expect(trailer.magic).toBe(UE4_PAK_MAGIC);
    expect(trailer.version).toBe(4);
    expect(trailer.indexOffset).toBe(BigInt(1000));
    expect(trailer.indexSize).toBe(BigInt(256));
  });
});
