// SPDX-License-Identifier: Apache-2.0

export type CompressionFormat = "gzip" | "deflate" | "zstd" | "brotli" | "lz4" | "raw";

export type TextureFormat = "webp" | "ktx2" | "png" | "jpeg" | "bc7" | "astc";

export interface CompressionOptions {
  level?: number;
  chunkSize?: number;
  dictionary?: Uint8Array;
}

export interface CompressedAssetMeta {
  originalBytes: number;
  compressedBytes: number;
  ratio: number;
  reductionPercent: number;
  format: CompressionFormat;
  sha256: string;
}

export interface TextureConvertOptions {
  format?: TextureFormat;
  quality?: number;
  generateMipmaps?: boolean;
  flipY?: boolean;
}

export interface Ktx2Header {
  identifier: Uint8Array;
  vkFormat: number;
  typeSize: number;
  pixelWidth: number;
  pixelHeight: number;
  pixelDepth: number;
  layerCount: number;
  faceCount: number;
  levelCount: number;
  supercompressionScheme: number;
}

export interface MeshBufferDescriptor {
  vertexCount: number;
  indexCount: number;
  positionBytes: Uint8Array;
  normalBytes: Uint8Array;
  uvBytes: Uint8Array;
  indexBytes: Uint8Array;
  quantized: boolean;
}

export interface PakEntry {
  filename: string;
  offset: number;
  size: number;
  uncompressedSize: number;
  compressionMethod: number; // 0=None, 1=Zlib, 2=Gzip, 3=Oodle, 4=Zstd
  isEncrypted: boolean;
  sha1Hash?: string;
}

export interface PakArchiveInfo {
  pakPath: string;
  pakVersion: number;
  mountPoint: string;
  entryCount: number;
  entries: PakEntry[];
  totalUncompressedBytes: number;
  totalCompressedBytes: number;
}
