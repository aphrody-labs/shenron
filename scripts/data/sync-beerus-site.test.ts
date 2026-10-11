// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { captureProgress } from "./sync-beerus-site";

test("sync receipts count sitemap failures and pending discovery without exposing URLs", () => {
  const progress = captureProgress({
    pages: [{ status: 200 }],
    media: [{ state: "unavailable" }],
    sitemaps: [{ status: 200 }, { status: 403 }, { status: 200, state: "invalid" }],
    remainingPages: ["page"],
    remainingAssets: [],
    sitemapBudget: {
      remaining: ["private-source-url"],
      bytes: 123,
      listedUrls: 5,
      consumedBodyBytes: 140,
      storedBytes: 100,
      chunkOvershootBytes: 0,
      limits: { documents: 16, documentBytes: 1024, bytes: 4096, urls: 2048 },
    },
  });
  expect(progress.incompleteRecords).toBe(3);
  expect(progress.remainingSitemaps).toBe(1);
  expect(progress.sitemapBudget?.listedUrls).toBe(5);
  expect(progress.sitemapBudget?.consumedBodyBytes).toBe(140);
  expect(progress.sitemapBudget?.storedBytes).toBe(100);
  expect(progress.sitemapBudget?.chunkOvershootBytes).toBe(0);
  expect(JSON.stringify(progress)).not.toContain("private-source-url");
});

test("old capture manifests retain progress compatibility", () => {
  expect(
    captureProgress({ pages: [], media: [], remainingPages: [], remainingAssets: [] }),
  ).toEqual({
    incompleteRecords: 0,
    remainingPages: 0,
    remainingAssets: 0,
    remainingSitemaps: 0,
    sitemapBudget: undefined,
  });
});

test("legacy sitemap budgets retain unknown byte measurements", () => {
  const progress = captureProgress({
    pages: [],
    media: [],
    remainingPages: [],
    remainingAssets: [],
    sitemapBudget: {
      remaining: [],
      bytes: 123,
      listedUrls: 1,
      limits: { documents: 16, documentBytes: 1024, bytes: 4096, urls: 2048 },
    },
  });
  expect(progress.sitemapBudget?.consumedBodyBytes).toBeUndefined();
  expect(progress.sitemapBudget?.storedBytes).toBeUndefined();
  expect(progress.sitemapBudget?.chunkOvershootBytes).toBeUndefined();
  expect(JSON.stringify(progress)).not.toContain("consumedBodyBytes");
});
