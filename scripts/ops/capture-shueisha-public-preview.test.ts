import { expect, test } from "bun:test";
import {
  previewIdentity,
  previewPosition,
  visiblePageClip,
} from "./capture-shueisha-public-preview";
test("only exact anonymous publisher ISBN readers qualify", () => {
  expect(
    previewIdentity("https://www.shueisha.co.jp/books/reader/main.php?cid=9784088844930"),
  ).toBe("9784088844930");
  for (const u of [
    "https://evil.com/books/reader/main.php?cid=9784088844930",
    "https://www.shueisha.co.jp/books/reader/main.php?cid=9784088844930&paid=1",
    "https://www.shueisha.co.jp/books/reader/main.php?cid=9784088844930#x",
  ])
    expect(() => previewIdentity(u)).toThrow();
});
test("the public position denominator and explicit budget cannot drift", () => {
  expect(previewPosition("2/33", 33)).toBe(2);
  for (const [label, total] of [
    ["2/32", 33],
    ["0/33", 33],
    ["34/33", 33],
    ["2/99", 99],
  ] as const)
    expect(() => previewPosition(label, total)).toThrow();
});
const image = (y: number, h: number, x = 218) => ({
  src: "blob:https://www.shueisha.co.jp/a",
  w: 764,
  h,
  rect: { x, y, width: 764, height: h, right: x + 764, bottom: y + h },
});
test("capture uses only a whole visible rendered page and rejects partial or undecoded bands", () => {
  const bands = [image(0, 408), image(400, 408), image(800, 400)];
  expect(visiblePageClip(bands)).toEqual({ x: 218, y: 0, width: 764, height: 1200, scale: 1 });
  expect(() => visiblePageClip(bands.slice(0, 2))).toThrow();
  // oxlint-disable-next-line oxc/no-map-spread -- immutable copy intended
  expect(() => visiblePageClip(bands.map((i) => ({ ...i, w: 0 })))).toThrow();
  expect(() =>
    visiblePageClip([image(0, 408, -200), image(400, 408, -200), image(800, 400, -200)]),
  ).toThrow();
});
