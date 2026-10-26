// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  discoverTechniqueImages,
  eligibleTechniqueImageUrl,
  techniqueDocumentsFromNativeWiki,
  type TechniqueImageDocument,
} from "../../src/dragon-ball/technique-images";

const techniques = [
  { id: 1, slug: "kamehameha", name: "Kamehameha", aliases: ["かめはめ波"] },
  { id: 2, slug: "big-bang-kamehameha", name: "Big Bang Kamehameha" },
  { id: 3, slug: "kienzan", name: "Kienzan" },
];
function document(text: string): TechniqueImageDocument {
  return {
    sourceUrl: "https://dragonballfr.com/wiki/manga/1421?page=13",
    medium: "manga",
    locator: "chapter:1421;page:13",
    text,
    images: [{ url: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol2/013.webp" }],
  };
}
test("OCR spacing and Japanese aliases retain exact native image and page provenance", () => {
  const report = discoverTechniqueImages(techniques, [document("KA ME HA ME HA ! かめはめ波")]);
  expect(report.candidates).toHaveLength(1);
  expect(report.candidates[0]).toMatchObject({
    techniqueId: 1,
    status: "candidate-needs-visual-review",
    locator: "chapter:1421;page:13",
  });
  expect(report.coverage).toHaveLength(3);
  expect(report.coverage[2]).toMatchObject({ candidates: 0, verifiedImages: 0 });
});
test("compound names do not assign a variant scene to the base attack", () => {
  expect(
    discoverTechniqueImages(techniques, [document("BIGBANGKAMEHAMEHA")]).candidates.map(
      (row) => row.techniqueId,
    ),
  ).toEqual([2]);
  expect(
    discoverTechniqueImages(techniques, [document("Big Bang Kamehameha. Puis un Kamehameha.")])
      .candidates.map((row) => row.techniqueId)
      .toSorted(),
  ).toEqual([1, 2]);
});
test("duplicate aliases require an identity decision and hidden entries never get candidates", () => {
  const result = discoverTechniqueImages(
    [
      ...techniques,
      { id: 4, slug: "duplicate", name: "Kamehameha" },
      { id: 5, slug: "hidden", name: "Kienzan", visible: false },
    ],
    [document("Kamehameha Kienzan")],
  );
  expect(result.candidates.map((row) => row.techniqueId)).toEqual([3]);
  expect(result.coverage[0]!.ambiguousAliases).toContain("Kamehameha");
  expect(result.coverage).toHaveLength(4);
});
test("untrusted, signed, game and portrait media are excluded without altering valid URLs", () => {
  for (const url of [
    "https://dragonball.fandom.com/a.webp",
    "https://static.wikia.net/a.webp",
    "https://cdn.dragonballfr.com/xv2/skill.webp",
    "https://cdn.dragonballfr.com/characters/Goku.webp",
    "https://cdn.dragonballfr.com/portrait.webp",
    "https://cdn.dragonballfr.com/a.webp?token=private",
    "javascript:alert(1)",
    "https://user:password@example.com/a.png",
  ])
    expect(eligibleTechniqueImageUrl(url)).toBeNull();
  expect(eligibleTechniqueImageUrl("https://cdn.dragonballfr.com/scene.webp?quality=80")).toBe(
    "https://cdn.dragonballfr.com/scene.webp?quality=80",
  );
});
test("native dossier gallery captions are matched independently, never from the page title", () => {
  const docs = techniqueDocumentsFromNativeWiki(
    {
      url: "https://dragon-ball-official.com/news/scene",
      titre: "Kamehameha",
      revid: 42,
      images: [
        {
          url: "https://dragon-ball-official.com/images/scene.webp",
          caption: "Kienzan",
          width: 640,
          height: 360,
        },
        { url: "https://dragon-ball-official.com/images/unlabelled.webp", width: 640, height: 360 },
      ],
    },
    "anime",
  );
  const result = discoverTechniqueImages(techniques, docs);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    techniqueId: 3,
    matchIn: "caption",
    medium: "anime",
    locator: "revision:42;image:1",
  });
});

test("Japanese voiced kana remain distinct while canonical Unicode equivalents match", () => {
  const identities = [
    { id: 7, slug: "garikku", name: "ガリック砲" },
    { id: 8, slug: "karikku", name: "カリック砲" },
  ];
  const result = discoverTechniqueImages(identities, [document("カ\u3099リック砲")]);
  expect(result.candidates.map((row) => row.techniqueId)).toEqual([7]);
});

test("a forbidden source rejects its entire gallery and repeated image receipts are deduplicated", () => {
  const source = document("Kamehameha");
  const forbidden = { ...source, sourceUrl: "https://dragonball.fandom.com/wiki/Kamehameha" };
  expect(discoverTechniqueImages(techniques, [forbidden]).candidates).toEqual([]);
  expect(discoverTechniqueImages(techniques, [source, source]).candidates).toHaveLength(1);
});
