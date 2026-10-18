// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "bun:test";
import { atlasMatchesPage } from "../../src/koharu/lib/atlas-source";

test("links only the exact native page source hash and dimensions", () => {
  const hash = "a".repeat(64);
  const size = { width: 1000, height: 1500 };
  const manifest = { source: { sha256: hash, ...size }, image_sha256: "c".repeat(64) };
  expect(atlasMatchesPage(manifest, hash, size)).toBe(true);
  expect(atlasMatchesPage(manifest, "b".repeat(64), size)).toBe(false);
  expect(atlasMatchesPage(manifest, hash, { width: 999, height: 1500 })).toBe(false);
  expect(atlasMatchesPage(manifest, hash, { width: 1000, height: 1499 })).toBe(false);
  expect(atlasMatchesPage({ source: manifest.source }, hash, size)).toBe(false);
  expect(
    atlasMatchesPage(
      { source: { sha256: "invalid", ...size }, image_sha256: "c".repeat(64) },
      "invalid",
      size,
    ),
  ).toBe(false);
  for (const unbound of [null, [], {}, { source: [] }, { source: { ...size } }]) {
    expect(atlasMatchesPage(unbound, hash, size)).toBe(false);
  }
});
