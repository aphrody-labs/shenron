import { expect, test } from "bun:test";
import { smokeCanvas } from "../src/lib/canvas-smoke";

test("runtime smoke refuses the canvas shim instead of qualifying empty images", async () => {
  const globals = globalThis as Record<string, unknown>;
  const previous = globals.shenronCanvasNativeOk;
  try {
    globals.shenronCanvasNativeOk = false;
    await expect(smokeCanvas()).rejects.toThrow("a shim cannot qualify");
  } finally {
    globals.shenronCanvasNativeOk = previous;
  }
});

test.skipIf((globalThis as Record<string, unknown>).shenronCanvasNativeOk !== true)(
  "runtime smoke encodes a real PNG using the loaded native binding",
  async () => {
    expect(await smokeCanvas()).toBeGreaterThan(8);
  },
);
