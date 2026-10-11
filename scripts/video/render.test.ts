import { expect, test } from "bun:test";
import { pngDimensions } from "./render";
test("rejects invalid capture and reads IHDR dimensions", () => {
  expect(() => pngDimensions(new Uint8Array(24))).toThrow();
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1280);
  view.setUint32(20, 720);
  expect(pngDimensions(bytes)).toEqual({ width: 1280, height: 720 });
});
