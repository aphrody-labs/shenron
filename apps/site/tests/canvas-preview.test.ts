// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { canvasPreviewParams } from "../src/lib/canvas-preview";

test("preview fills member defaults when the asynchronous member list arrives", () => {
  expect(canvasPreviewParams("profile", []).userId).toBe("");
  expect(canvasPreviewParams("profile", [{ id: "123" }]).userId).toBe("123");
  expect(canvasPreviewParams("scouter", [{ id: "123" }], { pct: "70" })).toEqual({
    userId: "123",
    type: "gay",
    pct: "70",
  });
});

test("preview preserves deliberate selections and ignores placeholder members", () => {
  const members = [{ id: "000" }, { id: "123" }, { id: "456" }];
  expect(canvasPreviewParams("profile", members, { userId: "789" }).userId).toBe("789");
  expect(canvasPreviewParams("profile", members, { userId: "" }).userId).toBe("");
  expect(canvasPreviewParams("fusion", members)).toMatchObject({ a: "123", b: "456" });
});
