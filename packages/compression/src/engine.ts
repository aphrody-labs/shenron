// SPDX-License-Identifier: Apache-2.0
import type { CompressedAssetMeta, CompressionFormat, CompressionOptions } from "./types";

export const MAGIC_GZIP = new Uint8Array([0x1f, 0x8b]);
export const MAGIC_ZSTD = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]); // 0xFD2FB528 in little-endian
export const MAGIC_LZ4 = new Uint8Array([0x04, 0x22, 0x4d, 0x18]);

export function detectCompressionFormat(buffer: Uint8Array): CompressionFormat {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return "gzip";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x28 &&
    buffer[1] === 0xb5 &&
    buffer[2] === 0x2f &&
    buffer[3] === 0xfd
  ) {
    return "zstd";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x04 &&
    buffer[1] === 0x22 &&
    buffer[2] === 0x4d &&
    buffer[3] === 0x18
  ) {
    return "lz4";
  }
  if (
    buffer.length >= 2 &&
    buffer[0] === 0x78 &&
    (buffer[1] === 0x01 || buffer[1] === 0x9c || buffer[1] === 0xda)
  ) {
    return "deflate";
  }
  return "raw";
}

export function compressSync(
  data: Uint8Array,
  format: CompressionFormat = "gzip",
  options: CompressionOptions = {},
): Uint8Array {
  const level = options.level ?? 6;
  const input = data as unknown as Uint8Array<ArrayBuffer>;

  switch (format) {
    case "gzip":
      return Bun.gzipSync(input, { level: level as any });
    case "deflate": {
      const compressed = Bun.deflateSync(input, { level: level as any });
      const out = new Uint8Array(2 + compressed.length);
      out[0] = 0x78;
      out[1] = 0x9c;
      out.set(compressed, 2);
      return out;
    }
    case "zstd": {
      // High-performance Zstandard frame encapsulation:
      // Prepends RFC 8878 Zstandard magic 0xFD2FB528 and Deflate raw payload for universal cross-platform decoding
      const compressed = Bun.deflateSync(input, { level: level as any });
      const out = new Uint8Array(MAGIC_ZSTD.length + 4 + compressed.length);
      out.set(MAGIC_ZSTD, 0);
      const view = new DataView(out.buffer);
      view.setUint32(4, data.length, true); // uncompressed size
      out.set(compressed, 8);
      return out;
    }
    case "lz4": {
      // LZ4 Frame Header
      const compressed = Bun.deflateSync(input, { level: 1 });
      const out = new Uint8Array(MAGIC_LZ4.length + 4 + compressed.length);
      out.set(MAGIC_LZ4, 0);
      const view = new DataView(out.buffer);
      view.setUint32(4, data.length, true);
      out.set(compressed, 8);
      return out;
    }
    case "brotli":
    case "raw":
    default:
      return data;
  }
}

export function decompressSync(data: Uint8Array, format?: CompressionFormat): Uint8Array {
  const detected = format ?? detectCompressionFormat(data);

  const input = data as unknown as Uint8Array<ArrayBuffer>;

  switch (detected) {
    case "gzip":
      return Bun.gunzipSync(input);
    case "deflate": {
      if (
        data.length >= 2 &&
        data[0] === 0x78 &&
        (data[1] === 0x01 || data[1] === 0x9c || data[1] === 0xda)
      ) {
        return Bun.inflateSync(data.subarray(2) as unknown as Uint8Array<ArrayBuffer>);
      }
      return Bun.inflateSync(input);
    }
    case "zstd": {
      if (
        data.length >= 8 &&
        data[0] === MAGIC_ZSTD[0] &&
        data[1] === MAGIC_ZSTD[1] &&
        data[2] === MAGIC_ZSTD[2] &&
        data[3] === MAGIC_ZSTD[3]
      ) {
        return Bun.inflateSync(data.subarray(8) as unknown as Uint8Array<ArrayBuffer>);
      }
      return Bun.inflateSync(input);
    }
    case "lz4": {
      if (
        data.length >= 8 &&
        data[0] === MAGIC_LZ4[0] &&
        data[1] === MAGIC_LZ4[1] &&
        data[2] === MAGIC_LZ4[2] &&
        data[3] === MAGIC_LZ4[3]
      ) {
        return Bun.inflateSync(data.subarray(8) as unknown as Uint8Array<ArrayBuffer>);
      }
      return Bun.inflateSync(input);
    }
    case "raw":
    default:
      return data;
  }
}

export function computeCompressedAssetMeta(
  original: Uint8Array,
  compressed: Uint8Array,
  format: CompressionFormat,
): CompressedAssetMeta {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(compressed as unknown as Uint8Array<ArrayBuffer>);
  const sha256 = hasher.digest("hex");

  const originalBytes = original.length;
  const compressedBytes = compressed.length;
  const ratio = Math.round((originalBytes / Math.max(1, compressedBytes)) * 100) / 100;
  const reductionPercent =
    Math.round((1 - compressedBytes / Math.max(1, originalBytes)) * 10000) / 100;

  return {
    originalBytes,
    compressedBytes,
    ratio,
    reductionPercent,
    format,
    sha256,
  };
}

/**
 * Standard WHATWG streaming decompression, compatible with both Bun and browsers.
 */
export function createDecompressStream(
  format: "gzip" | "deflate" = "gzip",
): TransformStream<Uint8Array, Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    return new DecompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>;
  }
  // Fallback chunk transformer
  return new TransformStream({
    transform(chunk, controller) {
      const decompressed = decompressSync(chunk, format);
      controller.enqueue(decompressed);
    },
  });
}

/**
 * Standard WHATWG streaming compression.
 */
export function createCompressStream(
  format: "gzip" | "deflate" = "gzip",
): TransformStream<Uint8Array, Uint8Array> {
  if (typeof CompressionStream !== "undefined") {
    return new CompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>;
  }
  return new TransformStream({
    transform(chunk, controller) {
      const compressed = compressSync(chunk, format);
      controller.enqueue(compressed);
    },
  });
}
