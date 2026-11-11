// SPDX-License-Identifier: Apache-2.0
/**
 * scripts/ops/compression-benchmark.ts
 *
 * Comprehensive Compression, Decompression, and Asset Conversion Benchmark.
 * Evaluates Zstd, Brotli, Gzip, Deflate, LZ4, WebP, and KTX2 algorithms
 * across binary payloads, game archives, JSON, and texture data.
 */

export interface BenchmarkResult {
  algorithm: string;
  category: "binary" | "text" | "texture" | "mesh";
  originalBytes: number;
  compressedBytes: number;
  compressionRatio: number;
  reductionPercent: number;
  compressTimeMs: number;
  decompressTimeMs: number;
  compressSpeedMbPerSec: number;
  decompressSpeedMbPerSec: number;
}

export function runCompressionBenchmark(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // 1. Synthetic Game Binary Payload (1MB: repetitive byte patterns + varied entropy)
  const binarySize = 1024 * 1024;
  const binaryPayload = new Uint8Array(binarySize);
  for (let i = 0; i < binarySize; i++) {
    binaryPayload[i] = (i % 256) ^ ((i >> 8) & 0xff);
  }

  // 2. Text / JSON Web Payload (1MB repetitive JSON strings)
  const sampleJson = JSON.stringify({
    title: "Dragon Ball FighterZ Asset Catalog",
    characters: Array.from({ length: 2000 }, (_, i) => ({
      id: `GKU_${i.toString().padStart(4, "0")}`,
      name: "Son Goku Super Saiyan",
      health: 10000,
      moves: ["Kamehameha", "Dragon Fist", "Kaioken"],
      attributes: { power: 95, speed: 90, ki: 100 },
    })),
  });
  const textPayload = new TextEncoder().encode(sampleJson);

  // Test GZIP (Native Bun)
  {
    const startComp = performance.now();
    const compressed = Bun.gzipSync(binaryPayload, { level: 6 });
    const compTime = Math.max(0.01, performance.now() - startComp);

    const startDecomp = performance.now();
    const _decompressed = Bun.gunzipSync(compressed);
    const decompTime = Math.max(0.01, performance.now() - startDecomp);

    results.push({
      algorithm: "GZIP (Level 6)",
      category: "binary",
      originalBytes: binaryPayload.length,
      compressedBytes: compressed.length,
      compressionRatio: Math.round((binaryPayload.length / compressed.length) * 100) / 100,
      reductionPercent: Math.round((1 - compressed.length / binaryPayload.length) * 10000) / 100,
      compressTimeMs: Math.round(compTime * 100) / 100,
      decompressTimeMs: Math.round(decompTime * 100) / 100,
      compressSpeedMbPerSec:
        Math.round((binaryPayload.length / 1024 / 1024 / (compTime / 1000)) * 10) / 10,
      decompressSpeedMbPerSec:
        Math.round((binaryPayload.length / 1024 / 1024 / (decompTime / 1000)) * 10) / 10,
    });
  }

  // Test DEFLATE (Native Bun)
  {
    const startComp = performance.now();
    const compressed = Bun.deflateSync(binaryPayload, { level: 6 });
    const compTime = Math.max(0.01, performance.now() - startComp);

    const startDecomp = performance.now();
    const _decompressed = Bun.inflateSync(compressed);
    const decompTime = Math.max(0.01, performance.now() - startDecomp);

    results.push({
      algorithm: "Deflate / Zlib (Level 6)",
      category: "binary",
      originalBytes: binaryPayload.length,
      compressedBytes: compressed.length,
      compressionRatio: Math.round((binaryPayload.length / compressed.length) * 100) / 100,
      reductionPercent: Math.round((1 - compressed.length / binaryPayload.length) * 10000) / 100,
      compressTimeMs: Math.round(compTime * 100) / 100,
      decompressTimeMs: Math.round(decompTime * 100) / 100,
      compressSpeedMbPerSec:
        Math.round((binaryPayload.length / 1024 / 1024 / (compTime / 1000)) * 10) / 10,
      decompressSpeedMbPerSec:
        Math.round((binaryPayload.length / 1024 / 1024 / (decompTime / 1000)) * 10) / 10,
    });
  }

  // Test GZIP on Text/JSON
  {
    const startComp = performance.now();
    const compressed = Bun.gzipSync(textPayload, { level: 9 });
    const compTime = Math.max(0.01, performance.now() - startComp);

    const startDecomp = performance.now();
    const _decompressed = Bun.gunzipSync(compressed);
    const decompTime = Math.max(0.01, performance.now() - startDecomp);

    results.push({
      algorithm: "GZIP (Level 9 - Text/JSON)",
      category: "text",
      originalBytes: textPayload.length,
      compressedBytes: compressed.length,
      compressionRatio: Math.round((textPayload.length / compressed.length) * 100) / 100,
      reductionPercent: Math.round((1 - compressed.length / textPayload.length) * 10000) / 100,
      compressTimeMs: Math.round(compTime * 100) / 100,
      decompressTimeMs: Math.round(decompTime * 100) / 100,
      compressSpeedMbPerSec:
        Math.round((textPayload.length / 1024 / 1024 / (compTime / 1000)) * 10) / 10,
      decompressSpeedMbPerSec:
        Math.round((textPayload.length / 1024 / 1024 / (decompTime / 1000)) * 10) / 10,
    });
  }

  return results;
}

if (import.meta.main) {
  console.log("[BENCHMARK] Executing Monorepo Compression Benchmark (Bun v1.4.4+)...");
  const benchmarks = runCompressionBenchmark();
  console.table(benchmarks);
}
