import { expect, test } from "bun:test";
import { pngDimensions, validateNativeRenderBounds } from "./render";
test("rejects invalid capture and reads IHDR dimensions", () => {
  expect(() => pngDimensions(new Uint8Array(24))).toThrow();
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1280);
  view.setUint32(20, 720);
  expect(pngDimensions(bytes)).toEqual({ width: 1280, height: 720 });
});

test("native render rejects unsupported geometry and timing before opening a browser", () => {
  const valid = { width: 1280, height: 720, fps: 24, frames: 288, durationSeconds: 12 };
  expect(() => validateNativeRenderBounds(valid)).not.toThrow();
  for (const invalid of [
    { width: 1279 },
    { width: 1920, height: 1920 },
    { height: 0 },
    { fps: 61 },
    { frames: 1801 },
    { frames: 0 },
    { durationSeconds: 13 },
    { fps: NaN },
  ])
    expect(() => validateNativeRenderBounds({ ...valid, ...invalid })).toThrow();
});
