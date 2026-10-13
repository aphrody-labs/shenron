// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  ARCHIVE_COLLECTIONS,
  archiveSearchUrl,
  projectArchiveItem,
} from "./enrich-internet-archive";
import { projectNativeCrawl } from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
test("archive notices retain attribution, factual metadata and owner rights without copying media or promoting canon", () => {
  const document = projectArchiveItem(
    {
      identifier: "dragon-ball-film",
      title: "Dragon Ball",
      creator: ["Creator"],
      language: ["fr"],
      mediatype: "movies",
      licenseurl: "https://creativecommons.org/licenses/by/4.0/",
    },
    ARCHIVE_COLLECTIONS[0],
    "2026-10-13T00:00:00Z",
    true,
  );
  const policy = {
    version: 1 as const,
    profile: "dbfr" as const,
    sources: [
      {
        domain: "archive.org",
        kind: "archive" as const,
        reviewed: true as const,
        evidence: ARCHIVE_COLLECTIONS[0].evidence,
        rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
      },
    ],
  };
  const records = projectNativeCrawl(document, policy);
  expect(records).toHaveLength(1);
  expect(records[0]!.url).toBe("https://archive.org/details/dragon-ball-film");
  expect(records[0]!.excerpt).toContain("Créateur déclaré : Creator");
  expect(records[0]!.provenance).toMatchObject({
    canonicalEligible: false,
    category: "archive-movies",
    rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
  });
  expect(document.payload.embedded_media).toEqual([]);
});
test("archive search freezes creation cutoff and stable identity order, and rejects wrong media or escaping IDs", () => {
  const url = archiveSearchUrl("image", 3, "2026-10-13T00:00:00Z");
  expect(url.searchParams.get("q")).toContain("mediatype:image");
  expect(url.searchParams.get("sort[]")).toBe("identifier asc");
  expect(url.searchParams.get("page")).toBe("3");
  expect(() =>
    projectArchiveItem(
      { identifier: "../../.env", mediatype: "image" },
      ARCHIVE_COLLECTIONS[1],
      "2026-10-13T00:00:00Z",
      true,
    ),
  ).toThrow();
  expect(() =>
    projectArchiveItem(
      { identifier: "book", mediatype: "texts" },
      ARCHIVE_COLLECTIONS[1],
      "2026-10-13T00:00:00Z",
      true,
    ),
  ).toThrow();
});
