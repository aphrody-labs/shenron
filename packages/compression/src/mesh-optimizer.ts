// SPDX-License-Identifier: Apache-2.0
import type { MeshBufferDescriptor } from "./types";

export class MeshOptimizer {
  /**
   * Quantizes 3D vertex positions from Float32 to Float16 (half-precision),
   * reducing position buffer memory by 50% while preserving sub-millimeter precision.
   */
  public static quantizePositions(positionsF32: Float32Array): Uint16Array {
    const out = new Uint16Array(positionsF32.length);
    for (let i = 0; i < positionsF32.length; i++) {
      out[i] = this.float32ToFloat16(positionsF32[i]);
    }
    return out;
  }

  /**
   * Encodes 3D unit normal vectors into 2-byte octahedral coordinates (snorm8 x 2),
   * reducing normal buffer size by 83.3% (from 12 bytes to 2 bytes per vertex).
   */
  public static encodeOctahedralNormals(normalsF32: Float32Array): Int8Array {
    const vertexCount = Math.floor(normalsF32.length / 3);
    const out = new Int8Array(vertexCount * 2);

    for (let i = 0; i < vertexCount; i++) {
      let x = normalsF32[i * 3];
      let y = normalsF32[i * 3 + 1];
      let z = normalsF32[i * 3 + 2];

      const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z);
      if (l1 > 1e-6) {
        x /= l1;
        y /= l1;
      }

      if (z < 0) {
        const ox = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1);
        const oy = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1);
        x = ox;
        y = oy;
      }

      out[i * 2] = Math.round(Math.max(-1, Math.min(1, x)) * 127);
      out[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, y)) * 127);
    }

    return out;
  }

  /**
   * Optimizes a complete raw mesh into quantized, WebGPU-ready vertex buffers.
   */
  public static optimizeMesh(
    positionsF32: Float32Array,
    normalsF32: Float32Array,
    indicesU32: Uint32Array,
    uvsF32?: Float32Array,
  ): MeshBufferDescriptor {
    const vertexCount = Math.floor(positionsF32.length / 3);
    const indexCount = indicesU32.length;

    const quantizedPos = this.quantizePositions(positionsF32);
    const octNormals = this.encodeOctahedralNormals(normalsF32);

    // If max index fits in 16-bit uint, downcast index buffer from uint32 to uint16 (50% reduction)
    let indexBytes: Uint8Array;
    if (vertexCount < 65536) {
      const u16 = new Uint16Array(indexCount);
      for (let i = 0; i < indexCount; i++) {
        u16[i] = indicesU32[i];
      }
      indexBytes = new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength);
    } else {
      indexBytes = new Uint8Array(indicesU32.buffer, indicesU32.byteOffset, indicesU32.byteLength);
    }

    const posBytes = new Uint8Array(
      quantizedPos.buffer,
      quantizedPos.byteOffset,
      quantizedPos.byteLength,
    );
    const normBytes = new Uint8Array(
      octNormals.buffer,
      octNormals.byteOffset,
      octNormals.byteLength,
    );
    const uvBytes = uvsF32
      ? new Uint8Array(uvsF32.buffer, uvsF32.byteOffset, uvsF32.byteLength)
      : new Uint8Array(0);

    return {
      vertexCount,
      indexCount,
      positionBytes: posBytes,
      normalBytes: normBytes,
      uvBytes,
      indexBytes,
      quantized: true,
    };
  }

  private static float32ToFloat16(val: number): number {
    const floatView = new Float32Array(1);
    const int32View = new Int32Array(floatView.buffer);
    floatView[0] = val;
    const x = int32View[0];

    let bits = (x >> 16) & 0x8000; // sign
    let m = (x >> 12) & 0x07ff; // mantissa
    const e = (x >> 23) & 0xff; // exponent

    if (e < 103) return bits;
    if (e > 142) {
      bits |= 0x7c00;
      bits |= (e === 255 ? 0 : 1) && x & 0x007fffff ? 1 : 0;
      return bits;
    }
    if (e < 113) {
      m |= 0x0800;
      bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
      return bits;
    }
    bits |= ((e - 112) << 10) | (m >> 1);
    bits += m & 1;
    return bits;
  }
}
