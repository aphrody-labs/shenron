// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { captureProgress, syncSitemapLimits } from "./sync-beerus-site";
import { sitemapLimits } from "./crawl-beerus-site";

test("sync forwards bounded sitemap overrides and retains crawler defaults", () => {
  expect(syncSitemapLimits([])).toEqual(sitemapLimits);
  expect(
    syncSitemapLimits([
      "--sitemap-urls",
      "50000",
      "--sitemap-document-bytes",
      "8388608",
      "--sitemap-bytes",
      "67108864",
      "--sitemap-documents",
      "64",
    ]),
  ).toEqual({ urls: 50000, documentBytes: 8388608, bytes: 67108864, documents: 64 });
});
test("sync refuses malformed, duplicate and unbounded sitemap flags before crawling", () => {
  for (const argv of [
    ["--sitemap-urls"],
    ["--sitemap-urls", "--out"],
    ["--sitemap-urls", "50001"],
    ["--sitemap-urls", "NaN"],
    ["--sitemap-bytes", "-1"],
    ["--sitemap-documents", "1.5"],
    ["--sitemap-urls", "10", "--sitemap-urls", "20"],
  ])
    expect(() => syncSitemapLimits(argv)).toThrow("Invalid sitemap");
});

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
