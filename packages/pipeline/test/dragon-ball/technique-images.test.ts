// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  discoverTechniqueImages,
  eligibleTechniqueImageUrl,
  techniqueDocumentsFromNativeWiki,
  techniqueDocumentsFromNativeCrawl,
  techniqueDocumentsFromNativeMarkdown,
  techniqueDocumentsFromEditorialArticles,
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

test("curated first-appearance metadata makes a finite review queue when OCR is absent", () => {
  const page = { ...document(""), chapterId: 20014 };
  const result = discoverTechniqueImages(
    [
      { ...techniques[0]!, debutChapterId: 20014 },
      { ...techniques[1]!, debutChapterId: 20015 },
    ],
    [page],
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    techniqueId: 1,
    matchIn: "debut-chapter",
    status: "candidate-needs-visual-review",
  });
  expect(result.verifiedImages).toBe(0);
});

test("native crawl receipts keep their source hash, per-image captions and declared medium", () => {
  const receipt = {
    crawl_id: "crawl-1",
    document_uid: "document-1",
    canonical_url: "https://dragon-ball-official.com/news/scene",
    source_domain: "dragon-ball-official.com",
    category: "reference",
    http_status: 200,
    raw_checksum: "a".repeat(64),
    timestamp_utc: "2026-10-26T12:00:00Z",
    payload: {
      title_raw: "Technique compendium",
      body_markdown: "Source article",
      embedded_media: [
        {
          type: "image",
          url: "https://dragon-ball-official.com/images/scene.webp",
          caption: "Kienzan",
        },
        {
          type: "video",
          url: "https://dragon-ball-official.com/video/scene.mp4",
          caption: "Kamehameha",
        },
      ],
    },
  };
  const docs = techniqueDocumentsFromNativeCrawl(receipt, "anime");
  const result = discoverTechniqueImages(techniques, docs);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    techniqueId: 3,
    medium: "anime",
    matchIn: "caption",
  });
  expect(result.candidates[0]!.locator).toContain("sha256:" + "a".repeat(64));
  expect(techniqueDocumentsFromNativeCrawl({ ...receipt, http_status: 404 }, "anime")).toEqual([]);
});

test("native Markdown image attribution stays within its section and primary label", () => {
  const docs = techniqueDocumentsFromNativeMarkdown({
    url: "https://dragon-ball-official.com/news/scene",
    medium: "manga",
    markdown:
      "## Techniques\n\n**Kienzan**\nCompared to the Kamehameha.\n\n![](https://dragon-ball-official.com/scene.webp)\n\n## Next section\n\nNo attack here.\n\n![](https://dragon-ball-official.com/other.webp)\n\n```html\n<img src='https://dragon-ball-official.com/fake.webp'>\n```",
  });
  const result = discoverTechniqueImages(techniques, docs);
  expect(docs).toHaveLength(2);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    techniqueId: 3,
    matchIn: "context",
    image: "https://dragon-ball-official.com/scene.webp",
  });
});

test("native Markdown keeps an attack heading when its adjacent prose omits the name", () => {
  const docs = techniqueDocumentsFromNativeMarkdown({
    url: "https://dragon-ball-official.com/news/scene",
    medium: "manga",
    markdown:
      "###### Kienzan\n\nA cutting disc of energy.\n\n![](https://dragon-ball-official.com/disc.webp)",
  });
  expect(discoverTechniqueImages(techniques, docs).candidates[0]).toMatchObject({
    techniqueId: 3,
    matchIn: "context",
  });
});

test("editorial references resolve exact inventoried pages and preserve their coordinates", () => {
  const page = { ...document("OCR misses the attack name"), chapterId: 20396, pageIndex: 13 };
  const article = `![Kamehameha](unlisted.webp)\n\n![Kienzan](${page.images[0]!.url})\n\n![Kienzan](https://example.com/databooks/guide.webp)`;
  const entries = [{ ...techniques[2]!, article }];
  const docs = techniqueDocumentsFromEditorialArticles(entries, [page]);
  expect(docs).toHaveLength(1);
  const candidate = discoverTechniqueImages(techniques, docs).candidates[0]!;
  expect(candidate).toMatchObject({
    techniqueId: 3,
    chapterId: 20396,
    pageIndex: 13,
    sourceUrl: page.sourceUrl,
    locator: page.locator,
    matchIn: "context",
    status: "candidate-needs-visual-review",
  });
  expect(candidate.contextSource?.sha256).toBe(
    new Bun.CryptoHasher("sha256").update(article).digest("hex"),
  );
  expect(candidate.documentSha256).toBe(
    new Bun.CryptoHasher("sha256").update(JSON.stringify(docs[0])).digest("hex"),
  );
  expect(discoverTechniqueImages(techniques, docs).verifiedImages).toBe(0);
});

test("editorial context cannot attribute another technique or resurrect hidden entries", () => {
  const page = { ...document(""), chapterId: 20014, pageIndex: 2 };
  const entries = [
    { ...techniques[0]!, article: `![Kienzan](${page.images[0]!.url})` },
    { ...techniques[2]!, visible: false, article: `![Kienzan](${page.images[0]!.url})` },
  ];
  const docs = techniqueDocumentsFromEditorialArticles(entries, [page]);
  expect(discoverTechniqueImages(techniques, docs).candidates).toEqual([]);
  expect(
    techniqueDocumentsFromEditorialArticles(entries, [{ ...page, pageIndex: undefined }]),
  ).toEqual([]);
});

test("editorial and OCR evidence deduplicate the same technique/page without merging variants", () => {
  const page = { ...document("Kamehameha"), chapterId: 20014, pageIndex: 2 };
  const docs = techniqueDocumentsFromEditorialArticles(
    [{ ...techniques[0]!, article: `![Kamehameha](${page.images[0]!.url})` }],
    [page],
  );
  const result = discoverTechniqueImages(techniques, [page, ...docs, ...docs]);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]!.matchIn).toBe("ocr");
  expect(result.candidates[0]!.techniqueId).toBe(1);
});
