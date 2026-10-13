// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { canvasPreviewParams, isCanvasMemberId } from "../src/lib/canvas-preview";

const first = "100000000000000001";
const second = "100000000000000002";
const selected = "100000000000000003";

test("preview fills member defaults when the asynchronous member list arrives", () => {
  expect(canvasPreviewParams("profile", []).userId).toBe("");
  expect(canvasPreviewParams("profile", [{ id: first }]).userId).toBe(first);
  expect(canvasPreviewParams("scouter", [{ id: first }], { pct: "70" })).toEqual({
    userId: first,
    type: "gay",
    pct: "70",
  });
});

test("preview preserves deliberate selections and ignores placeholder members", () => {
  const members = [{ id: "000" }, { id: ":id" }, { id: first }, { id: second }];
  expect(canvasPreviewParams("profile", members, { userId: selected }).userId).toBe(selected);
  expect(canvasPreviewParams("profile", members, { userId: "" }).userId).toBe("");
  expect(canvasPreviewParams("fusion", members)).toMatchObject({ a: first, b: second });
});

test("placeholder and malformed member IDs never become canvas URL parameters", () => {
  for (const invalid of [":id", "123", "../canvas", "000000000000000001", undefined])
    expect(isCanvasMemberId(invalid)).toBe(false);
  expect(isCanvasMemberId(first)).toBe(true);
  expect(canvasPreviewParams("profile", [{ id: ":id" }]).userId).toBe("");
});
