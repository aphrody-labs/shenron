// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { crawlJobOutputDirectory } from "../src/aphrody/jobs";
import { createCrawlJobArgs, createCrawlJobIntent } from "../src/workflows";

describe("createCrawlJobArgs", () => {
  test("maps catalogued Shenron sources to the native Dragon Ball worker", () => {
    expect(createCrawlJobArgs({ source: "official" })).toEqual([
      "dragon-ball",
      "crawl",
      "--profile",
      "shenron",
      "--source",
      "official",
      "--max-requests",
      "500",
      "--render",
      "--json",
      "--index",
    ]);
    expect(createCrawlJobArgs({ source: "databooks", maxRequests: 80, depth: 1 })).toEqual([
      "dragon-ball",
      "crawl",
      "--profile",
      "shenron",
      "--source",
      "kanzentai,neoseeker-databooks,databook-other",
      "--max-requests",
      "80",
      "--max-depth",
      "1",
      "--render",
      "--json",
      "--index",
    ]);
  });

  test("leaves the universal catalog selection to Aphrody Web", () => {
    const args = createCrawlJobArgs({ source: "universal", maxRequests: 12 });
    expect(args).not.toContain("--source");
    expect(args).toContain("--render");
    expect(args).toContain("12");
    expect(args[0]).toBe("dragon-ball");
  });

  test("creates a one-attempt idempotent intent for AphrodyWebJobs", () => {
    const key = "catalog-official-20261101";
    const intent = createCrawlJobIntent(key, { source: "official" });
    expect(intent).toEqual({
      key,
      args: [
        ...createCrawlJobArgs({ source: "official" }).slice(0, 6),
        "--output",
        crawlJobOutputDirectory(key),
        ...createCrawlJobArgs({ source: "official" }).slice(6),
      ],
      maxAttempts: 1,
    });
    expect(intent.args).toContain("--render");
  });

  test("catalogue campaigns get job-scoped output while custom crawl-index stays separate", () => {
    const catalog = createCrawlJobIntent("campaign-alpha", { source: "universal" });
    expect(catalog.args).toContain("--output");
    expect(catalog.args[catalog.args.indexOf("--output") + 1]).toBe(
      crawlJobOutputDirectory("campaign-alpha"),
    );
    const custom = createCrawlJobIntent("custom-alpha", {
      source: "custom",
      url: "https://example.org/",
    });
    expect(custom.args[0]).toBe("crawl-index");
    expect(custom.args).not.toContain("--output");
  });

  test("creates a stable, per-seed crawl-index job for a custom host", () => {
    const first = createCrawlJobArgs({
      source: "custom",
      url: "https://example.org/news/",
      maxRequests: 7,
      depth: 1,
    });
    const second = createCrawlJobArgs({
      source: "custom",
      url: "https://example.org/news/",
      maxRequests: 7,
      depth: 1,
    });
    expect(first).toEqual(second);
    expect(first).toEqual([
      "crawl-index",
      "https://example.org/news/",
      "--label",
      expect.stringMatching(/^shenron-custom-example-org-[a-f0-9]{12}$/),
      "--profile",
      "shenron",
      "--max-requests",
      "7",
      "--max-depth",
      "1",
    ]);
    expect(first).not.toContain("--render");
  });

  test("rejects invalid seeds, Fandom, local output paths, and unbounded budgets", () => {
    expect(() => createCrawlJobArgs({ source: "custom" })).toThrow("requires a URL");
    expect(() =>
      createCrawlJobArgs({ source: "custom", url: "https://fandom.com/wiki/Dragon_Ball" }),
    ).toThrow("Fandom is not an allowed");
    expect(() =>
      createCrawlJobArgs({ source: "custom", url: "https://user:pass@example.org/" }),
    ).toThrow("without credentials");
    expect(() =>
      createCrawlJobArgs({ source: "custom", url: "https://example.org/", outDir: "C:/tmp" }),
    ).toThrow("owned by the worker host");
    expect(() => createCrawlJobArgs({ source: "official", maxRequests: 0 })).toThrow(
      "maxRequests must be positive",
    );
    expect(() => createCrawlJobArgs({ source: "official", depth: Number.NaN })).toThrow(
      "Crawl budgets must be non-negative safe integers",
    );
  });
});
