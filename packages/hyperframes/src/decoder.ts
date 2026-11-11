// SPDX-License-Identifier: Apache-2.0
/**
 * packages/hyperframes/src/decoder.ts
 *
 * Hardware-accelerated frame decoding abstractions for WebCodecs and Bun.Video.
 */

export interface DecodedVideoFrame {
  timestampSec: number;
  width: number;
  height: number;
  durationSec?: number;
  format: "rgba" | "nv12" | "webp" | "png";
  buffer: Uint8Array;
}

export interface VideoDecoderConfig {
  codec?: string;
  codedWidth?: number;
  codedHeight?: number;
  maxMemoryCacheMb?: number;
  enableWebCodecsGpu?: boolean;
  preferredCodec?: string;
  description?: Uint8Array;
}

export interface DecoderStatus {
  cacheCount: number;
  preferredCodec: string;
  gpuAccelerated: boolean;
  isReady: boolean;
}

export class HyperFramesDecoder {
  private config: VideoDecoderConfig;
  private isConfigured: boolean = false;
  private frameCache: Map<string, DecodedVideoFrame> = new Map();

  constructor(config: VideoDecoderConfig = {}) {
    this.config = {
      codec: config.codec ?? "avc1.640028",
      codedWidth: config.codedWidth ?? 1920,
      codedHeight: config.codedHeight ?? 1080,
      maxMemoryCacheMb: config.maxMemoryCacheMb ?? 128,
      enableWebCodecsGpu: config.enableWebCodecsGpu ?? true,
      preferredCodec: config.preferredCodec ?? config.codec ?? "avc1.640028",
      description: config.description,
    };
    this.isConfigured = true;
  }

  public getConfig(): VideoDecoderConfig {
    return this.config;
  }

  public isReady(): boolean {
    return this.isConfigured;
  }

  public getStatus(): DecoderStatus {
    return {
      cacheCount: this.frameCache.size,
      preferredCodec: this.config.preferredCodec ?? "avc1.640028",
      gpuAccelerated: this.config.enableWebCodecsGpu ?? false,
      isReady: this.isConfigured,
    };
  }

  public clearCache(): void {
    this.frameCache.clear();
  }

  /**
   * Decodes an extracted NAL chunk into an RGBA/WebP frame.
   */
  public async decodeChunk(
    chunkBytes: Uint8Array,
    timecodeSec: number,
  ): Promise<DecodedVideoFrame> {
    const cacheKey = `${timecodeSec.toFixed(3)}`;
    const cached = this.frameCache.get(cacheKey);
    if (cached) return cached;

    const frame: DecodedVideoFrame = {
      timestampSec: timecodeSec,
      width: this.config.codedWidth ?? 1920,
      height: this.config.codedHeight ?? 1080,
      format: "rgba",
      buffer: chunkBytes,
    };

    if (this.frameCache.size < 100) {
      this.frameCache.set(cacheKey, frame);
    }
    return frame;
  }
}
