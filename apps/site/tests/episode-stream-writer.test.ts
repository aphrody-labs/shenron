// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { validateCatalogEditorialBody } from "../src/lib/catalog-editorial-contracts";
import { WIKI_TABLE_SPECS } from "../src/lib/wiki-tables";
import {
  assertWikiUpdatePrecondition,
  parseEpisodeUpdateRequest,
  wikiUpdateSnapshotHash,
} from "../src/lib/wiki-update-precondition";

test("the canonical episode writer accepts a qualified stream under full snapshot preconditions", () => {
  const streamUrl = "https://cdn.dragonballfr.com/media/episodes/beerus-01/optimized-720p.mp4";
  expect(WIKI_TABLE_SPECS.db_episodes!.mutableColumns).toContain("streamUrl");
  const expected = { id: 875, streamUrl: "https://source.example/episode.mp4", frames: [] };
  const expectedSha256 = wikiUpdateSnapshotHash(expected);
  const request = parseEpisodeUpdateRequest({ streamUrl, expected, expectedSha256 });
  const validated = validateCatalogEditorialBody("db_episodes", request.data);
  expect(validated).toEqual({ ok: true, value: { streamUrl } });
  expect(request.expected).toBe(expected);
  expect(request.expectedSha256).toBe(expectedSha256);
  expect(() =>
    assertWikiUpdatePrecondition(expected, expected, { complete: true, sha256: expectedSha256 }),
  ).not.toThrow();
  expect(() =>
    assertWikiUpdatePrecondition({ ...expected, frames: [{}] }, expected, {
      complete: true,
      sha256: expectedSha256,
    }),
  ).toThrow("precondition changed");
});

test("stream URL validation rejects credentials, local files and non-HTTP protocols", () => {
  for (const streamUrl of [
    "",
    "/media/episode.mp4",
    "file:///private/episode.mp4",
    "ftp://source.example/episode.mp4",
    "https://user:password@source.example/episode.mp4",
    "javascript:alert(1)",
  ])
    expect(validateCatalogEditorialBody("db_episodes", { streamUrl }).ok).toBe(false);
  expect(validateCatalogEditorialBody("db_episodes", { streamUrl: null })).toEqual({
    ok: true,
    value: { streamUrl: null },
  });
  expect(validateCatalogEditorialBody("db_episodes", { title: "Preserved" })).toEqual({
    ok: true,
    value: { title: "Preserved" },
  });
});
