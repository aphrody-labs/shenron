// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { parseGlbSummary } from "../src/dbxv2/glb";
import { placePixels } from "../src/dbxv2/pixel";

function glb(json: unknown): Uint8Array {
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4) text += " ";
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(20 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.length, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

describe("placePixels", () => {
  test("integer scale, centred on the physical grid", () => {
    const p = placePixels(64, 32, { width: 400, height: 300 });
    expect(p.scale).toBe(6);
    expect(p.cssWidth).toBe(384);
    expect(p.cssX).toBe(8);
    expect(Number.isInteger(p.cssY)).toBe(true);
    expect(p.overflow).toBe(false);
  });
  test("device pixel ratio gives a whole number of physical pixels", () => {
    const p = placePixels(10, 10, { width: 55, height: 55 }, { dpr: 1.5 });
    expect(p.scale).toBe(8);
    expect(p.cssWidth * 1.5).toBe(80);
    expect((p.cssX * 1.5) % 1).toBe(0);
  });
  test("never below 1:1, reports overflow, honours maxScale", () => {
    const small = placePixels(200, 200, { width: 100, height: 100 });
    expect(small.scale).toBe(1);
    expect(small.overflow).toBe(true);
    expect(placePixels(8, 8, { width: 800, height: 800 }, { maxScale: 4 }).scale).toBe(4);
  });
  test("rejects non-integer dimensions", () => {
    expect(() => placePixels(1.5, 2, { width: 10, height: 10 })).toThrow(RangeError);
  });
});

describe("parseGlbSummary", () => {
  test("counts the parts of a model", () => {
    const bytes = glb({
      asset: { version: "2.0" },
      meshes: [{ primitives: [{}, {}] }, { primitives: [{}] }],
      nodes: [{}, {}],
      materials: [{}],
    });
    const s = parseGlbSummary(bytes);
    expect(s).toMatchObject({
      version: 2,
      meshes: 2,
      primitives: 3,
      nodes: 2,
      materials: 1,
      skins: 0,
    });
  });
  test("refuses anything that is not a GLB", () => {
    expect(parseGlbSummary(new Uint8Array(4))).toBeNull();
    expect(parseGlbSummary(new Uint8Array(40))).toBeNull();
    const bad = glb({});
    new DataView(bad.buffer).setUint32(8, 9999, true);
    expect(parseGlbSummary(bad)).toBeNull();
  });
});
