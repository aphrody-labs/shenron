// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { assetUrl } from "../src/lib/assets";
import { SITE_URL } from "../src/lib/config";

test("runtime wiki uploads resolve through the site origin", () => {
  const path = "assets/wiki/techniques/55b2d3a4-5c67-4890-8abc-df0123456789.webp";
  for (const prefix of ["", "./", "/"]) {
    expect(assetUrl(`${prefix}${path}`)).toBe(`${SITE_URL}/${path}`);
  }
});

test("the upload route does not rewrite legacy, signed or external media URLs", () => {
  const external =
    "https://google.com/assets/wiki/techniques/55b2d3a4-5c67-4890-8abc-df0123456789.webp?token=example";
  expect(assetUrl(external)).toBe(external);
  expect(assetUrl("/techniques/kamehameha.webp")).toBe("/techniques/kamehameha.webp");
});
