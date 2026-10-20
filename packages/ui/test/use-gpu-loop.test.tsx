// SPDX-License-Identifier: Apache-2.0
import "@aphrody/bun-test-dom";
import { act, cleanup, render } from "@testing-library/react";
import { expect, test, vi } from "bun:test";
import { useRef } from "react";
import { useGpuLoop } from "../src/lib/use-gpu-loop";

test("live GPU motion preference changes stop and resume rendering, then remove listeners and release once", async () => {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const replace = (object: object, key: string, value: unknown, name = key) => {
    originals.set(name, Object.getOwnPropertyDescriptor(object, key));
    Object.defineProperty(object, key, { configurable: true, writable: true, value });
  };
  const restore = (object: object, key: string, name = key) => {
    const descriptor = originals.get(name);
    if (descriptor) Object.defineProperty(object, key, descriptor);
    else Reflect.deleteProperty(object, key);
  };
  const queued = new Map<number, FrameRequestCallback>();
  const listeners = new Set<() => void>();
  let id = 0;
  const motion = {
    matches: false,
    addEventListener: (_type: string, callback: () => void) => listeners.add(callback),
    removeEventListener: (_type: string, callback: () => void) => listeners.delete(callback),
  };
  replace(navigator, "gpu", {});
  replace(globalThis, "matchMedia", () => motion);
  replace(globalThis, "requestAnimationFrame", (callback: FrameRequestCallback) => {
    queued.set(++id, callback);
    return id;
  });
  replace(globalThis, "cancelAnimationFrame", (frame: number) => queued.delete(frame));
  replace(
    globalThis,
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const renderer = {
    frame: vi.fn((...parameters: [number, number, number]) => parameters.every(Number.isFinite)),
    resize: vi.fn(),
    free: vi.fn(),
  };
  function Probe() {
    const canvas = useRef<HTMLCanvasElement>(null);
    useGpuLoop(canvas, { open: async () => renderer, onFallback: vi.fn(), interactive: false }, []);
    return <canvas ref={canvas} />;
  }
  let unmount: (() => void) | undefined;
  try {
    await act(async () => {
      unmount = render(<Probe />).unmount;
    });
    expect(renderer.frame).toHaveBeenCalledTimes(1);
    expect(queued.size).toBe(1);
    motion.matches = true;
    for (const listener of listeners) listener();
    expect(queued.size).toBe(0);
    expect(renderer.frame).toHaveBeenCalledTimes(2);
    expect(renderer.frame.mock.calls.at(-1)).toEqual([0, 0, 0]);
    motion.matches = false;
    for (const listener of listeners) listener();
    expect(queued.size).toBe(1);
    const callbacks = [...queued.values()];
    queued.clear();
    for (const callback of callbacks) callback(100);
    expect(renderer.frame).toHaveBeenCalledTimes(3);
    unmount?.();
    unmount = undefined;
    expect(queued.size).toBe(0);
    expect(listeners.size).toBe(0);
    expect(renderer.free).toHaveBeenCalledTimes(1);
  } finally {
    unmount?.();
    cleanup();
    restore(navigator, "gpu");
    for (const key of [
      "matchMedia",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "IntersectionObserver",
    ])
      restore(globalThis, key);
  }
});
