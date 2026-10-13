// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  frameUploadError,
  MAX_FRAME_IMAGE_BYTES,
  resolveFrameSearchTarget,
} from "../src/lib/frames-map-shared";

test("browser uploads share the API limit and validate image bytes instead of the declared MIME", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(await frameUploadError(new File([png], "image.png", { type: "text/plain" }))).toBeNull();
  expect(
    await frameUploadError(new File(["not an image"], "fake.png", { type: "image/png" })),
  ).toBe("invalid");
  expect(await frameUploadError(new File([], "empty.png"))).toBe("invalid");
  expect(await frameUploadError(new Blob([new Uint8Array(MAX_FRAME_IMAGE_BYTES + 1)]))).toBe(
    "tooLarge",
  );
});

test("a selected thumbnail or typed URL replaces an earlier upload", () => {
  const file = new File(["old uploaded image"], "old.png");
  const current = { file, url: "https://example.com/typed.png" };
  expect(resolveFrameSearchTarget(current)).toEqual(current);
  expect(resolveFrameSearchTarget(current, { url: "https://example.com/thumbnail.png" })).toEqual({
    url: "https://example.com/thumbnail.png",
  });
  expect(
    resolveFrameSearchTarget(current, { url: "https://example.com/new.png" }).file,
  ).toBeUndefined();
  expect(resolveFrameSearchTarget(current, { file })).toEqual({ file });
});
