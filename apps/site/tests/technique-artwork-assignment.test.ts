// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  prepareTechniqueArtworkUpdate,
  type TechniqueArtworkAssignment,
} from "../scripts/assign-technique-artwork";
const sha256 = "a".repeat(64);
const iconSha256 = "b".repeat(64);
const entry: TechniqueArtworkAssignment = {
  id: 1,
  slug: "kamehameha",
  name: "Kamehameha",
  expectedImage: null,
  sha256,
  iconSha256,
  image: `https://cdn.dragonballfr.com/media/techniques/kamehameha/${sha256}.webp`,
  icon: `https://cdn.dragonballfr.com/media/techniques/kamehameha/${iconSha256}.svg`,
  sourceUrl: "https://dragonballfr.com/wiki/manga/1421?page=13",
};
const row = {
  id: 1,
  slug: "kamehameha",
  name: "Kamehameha",
  image: null,
  visible: true,
  description: "Preserved editorial text",
};
test("a reviewed immutable attack image uses the complete optimistic snapshot", () => {
  const body = prepareTechniqueArtworkUpdate(entry, row);
  expect(body?.image).toBe(entry.image);
  expect(body?.expected).toEqual(row);
  expect(body?.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(prepareTechniqueArtworkUpdate(entry, { ...row, image: entry.image })).toBeNull();
});
test("new editorial imagery, retired rows and unrelated identities are preserved", () => {
  for (const change of [
    { image: "/editorial.webp" },
    { visible: false },
    { name: "Other" },
    { id: 2 },
  ])
    expect(() => prepareTechniqueArtworkUpdate(entry, { ...row, ...change })).toThrow();
});
test("foreign artifacts and a mismatch between image namespace and technique are rejected", () => {
  for (const change of [
    { image: entry.image.replace("cdn.dragonballfr.com", "google.com") },
    { icon: entry.icon.replace("/kamehameha/", "/kienzan/") },
    { sourceUrl: "https://google.com/wiki/manga/1421" },
  ])
    expect(() => prepareTechniqueArtworkUpdate({ ...entry, ...change }, row)).toThrow();
});
