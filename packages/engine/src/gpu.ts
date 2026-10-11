// SPDX-License-Identifier: Apache-2.0

/**
 * WebGPU hardware initialization, pipeline builders, and buffer allocators.
 */

export interface GpuContext {
  device: GPUDevice;
  format: GPUTextureFormat;
  context?: GPUCanvasContext;
}

/**
 * Detects whether WebGPU is supported in the current runtime environment.
 */
export function isWebGpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && navigator.gpu !== undefined;
}

/**
 * Initializes a WebGPU hardware context for an HTMLCanvasElement or OffscreenCanvas.
 */
export async function initWebGpu(
  canvas?: HTMLCanvasElement | OffscreenCanvas,
): Promise<GpuContext | null> {
  if (!isWebGpuSupported()) {
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) return null;

    const device = await adapter.requestDevice({
      label: "ShenronEngine_WebGpuDevice",
    });

    const format = navigator.gpu.getPreferredCanvasFormat();

    let context: GPUCanvasContext | undefined;
    if (canvas) {
      context = canvas.getContext("webgpu") as GPUCanvasContext;
      if (context) {
        context.configure({
          device,
          format,
          alphaMode: "premultiplied",
        });
      }
    }

    return { device, format, context };
  } catch (err) {
    console.warn("Failed to initialize WebGPU hardware context:", err);
    return null;
  }
}

/**
 * Creates a GPUBuffer initialized with Float32Array or Uint32Array data.
 */
export function createGpuBuffer(
  device: GPUDevice,
  data: Float32Array | Uint32Array | Uint8Array,
  usage: GPUBufferUsageFlags,
  label?: string,
): GPUBuffer {
  const buffer = device.createBuffer({
    label,
    size: (data.byteLength + 3) & ~3, // Aligned to 4 bytes
    usage,
    mappedAtCreation: true,
  });

  if (data instanceof Float32Array) {
    new Float32Array(buffer.getMappedRange()).set(data);
  } else if (data instanceof Uint32Array) {
    new Uint32Array(buffer.getMappedRange()).set(data);
  } else {
    new Uint8Array(buffer.getMappedRange()).set(data);
  }

  buffer.unmap();
  return buffer;
}
