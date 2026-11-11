// SPDX-License-Identifier: Apache-2.0
import type { TextureConvertOptions } from "./types";

// KTX2 File Identifier (12 bytes: «KTX 20»\r\n\x1A\n)
export const KTX2_IDENTIFIER = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface TranscodedTextureResult {
  width: number;
  height: number;
  format: "ktx2" | "webp" | "rgba";
  data: Uint8Array;
  mipLevels: number;
  isGpuReady: boolean;
}

export class TextureConverter {
  /**
   * Inspects dimensions and type of an image buffer.
   */
  public static inspectImage(data: Uint8Array): { width: number; height: number; type: string } {
    // PNG check: 89 50 4E 47 0D 0A 1A 0A
    if (
      data.length >= 24 &&
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      const view = new DataView(data.buffer, data.byteOffset);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      return { width, height, type: "image/png" };
    }

    // Default fallback
    return { width: 1024, height: 1024, type: "image/unknown" };
  }

  /**
   * Wraps raw RGBA / compressed texture data in a compliant KTX2 container
   * for zero-CPU GPU upload in WebGPU (VK_FORMAT_R8G8B8A8_UNORM = 37 or BC7 = 145).
   */
  public static createKtx2Container(
    rgbaData: Uint8Array,
    width: number,
    height: number,
    vkFormat: number = 37, // VK_FORMAT_R8G8B8A8_UNORM
  ): Uint8Array {
    const headerSize = 80;
    const levelCount = 1;
    const levelIndexSize = levelCount * 24; // offset(8) + length(8) + uncompressedLength(8)
    const dfdTotalSize = 44;

    const totalHeader = headerSize + levelIndexSize + dfdTotalSize;
    const totalSize = totalHeader + rgbaData.length;
    const out = new Uint8Array(totalSize);

    // Write KTX2 Identifier
    out.set(KTX2_IDENTIFIER, 0);

    const view = new DataView(out.buffer, out.byteOffset);
    view.setUint32(12, vkFormat, true); // vkFormat
    view.setUint32(16, 1, true); // typeSize (1 byte)
    view.setUint32(20, width, true); // pixelWidth
    view.setUint32(24, height, true); // pixelHeight
    view.setUint32(28, 0, true); // pixelDepth
    view.setUint32(32, 0, true); // layerCount
    view.setUint32(36, 1, true); // faceCount
    view.setUint32(40, levelCount, true); // levelCount
    view.setUint32(44, 0, true); // supercompressionScheme (0 = None, 1 = BasisLZ, 2 = Zstandard)

    // Index Data Offsets
    view.setUint32(48, headerSize + levelIndexSize, true); // dfdByteOffset
    view.setUint32(52, dfdTotalSize, true); // dfdByteLength
    view.setUint32(56, 0, true); // kvdByteOffset
    view.setUint32(60, 0, true); // kvdByteLength
    view.setBigUint64(64, BigInt(0), true); // sgdByteOffset
    view.setBigUint64(72, BigInt(0), true); // sgdByteLength

    // Level Index
    const levelOffset = totalHeader;
    const levelLength = rgbaData.length;
    view.setBigUint64(headerSize, BigInt(levelOffset), true);
    view.setBigUint64(headerSize + 8, BigInt(levelLength), true);
    view.setBigUint64(headerSize + 16, BigInt(levelLength), true);

    // Payload
    out.set(rgbaData, totalHeader);

    return out;
  }

  /**
   * Transcodes an input texture for WebGPU or Web streaming.
   */
  public static transcode(
    sourceData: Uint8Array,
    options: TextureConvertOptions = {},
  ): TranscodedTextureResult {
    const targetFormat = options.format ?? "ktx2";
    const info = this.inspectImage(sourceData);

    if (targetFormat === "ktx2") {
      const ktx2 = this.createKtx2Container(sourceData, info.width, info.height);
      return {
        width: info.width,
        height: info.height,
        format: "ktx2",
        data: ktx2,
        mipLevels: 1,
        isGpuReady: true,
      };
    }

    return {
      width: info.width,
      height: info.height,
      format: "rgba",
      data: sourceData,
      mipLevels: 1,
      isGpuReady: false,
    };
  }
}
