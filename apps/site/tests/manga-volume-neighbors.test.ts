// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mangaVolumeNeighbors } from "../src/lib/manga-volume-neighbors";

const legacy = {
  id: 601,
  series: "ARALE",
  volume_number: 1,
  title: "Dr. Slump Vol. 1",
  isbn: null,
};
const perfect = {
  id: 740,
  series: "ARALE",
  volume_number: 1,
  title: "Docteur Slump perfect edition - Tome 01",
  isbn: "9782723472272",
};
const original = {
  id: 755,
  series: "ARALE",
  volume_number: 1,
  title: "Dr.スランプ 1",
  isbn: "9784088511818",
};
const volumes = [
  legacy,
  perfect,
  original,
  { ...legacy, id: 602, volume_number: 2 },
  { ...perfect, id: 741, volume_number: 2, isbn: "9782723472289" },
  { ...original, id: 756, volume_number: 2, isbn: "9784088511825" },
];

test("a scanned Slump volume continues to volume two without entering a metadata-only publication", () => {
  expect(mangaVolumeNeighbors(legacy, volumes)).toMatchObject({ prev: null, next: { id: 602 } });
});

test("French perfect and Japanese original publications keep their own sequence", () => {
  expect(mangaVolumeNeighbors(perfect, volumes).next?.id).toBe(741);
  expect(mangaVolumeNeighbors(original, volumes).next?.id).toBe(756);
  expect(mangaVolumeNeighbors(volumes[4]!, volumes).prev?.id).toBe(740);
});

test("unordered inputs and duplicate volume numbers never link to the same printed number", () => {
  expect(mangaVolumeNeighbors(legacy, volumes.toReversed()).next?.id).toBe(602);
  expect(mangaVolumeNeighbors(legacy, [{ ...legacy, id: 999 }])).toEqual({
    prev: null,
    next: null,
  });
  expect(
    mangaVolumeNeighbors(legacy, [{ ...legacy, id: 99, series: "DB", volume_number: 2 }]),
  ).toEqual({ prev: null, next: null });
});
