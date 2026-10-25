// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  aphrodyWebCrawl,
  type AphrodyWebCrawlRequest,
  type AphrodyWebCrawlReport,
} from "../../src/aphrody/web";
import type { NativeCommandExecutor } from "../../src/aphrody/native-commands";

const validReport = {
  attempts: 1,
  pages: [{ url: "https://example.com/", title: "Example" }],
  errors: [],
  frontier: { pending: 2, locked: 0, done: 1, failed: 0 },
};
function owner(report: unknown = validReport) {
  const calls: string[][] = [];
  const nativeExecutor: NativeCommandExecutor = async (args) => {
    calls.push([...args]);
    return { code: 0, stdout: JSON.stringify(report), stderr: "" };
  };
  return { calls, nativeExecutor };
}
describe("native crawl policy bridge", () => {
  test("defaults restrict discovered links to seed domains and respect robots with one slot per host", async () => {
    const native = owner();
    await aphrodyWebCrawl({ urls: ["https://example.com/"] }, native);
    const args = native.calls[0]!;
    expect(args.slice(0, 3)).toEqual(["web", "crawl", "https://example.com/"]);
    for (const [flag, value] of [
      ["--max-per-host", "1"],
      ["--per-host-delay", "1000"],
      ["--allowed-domains", "example.com"],
    ])
      expect(args[args.indexOf(flag!) + 1]).toBe(value);
    expect(args).toContain("--obey-robots");
  });
  test("passes the same durable frontier and source-directed native parameters on subsequent runs", async () => {
    const native = owner();
    const request: AphrodyWebCrawlRequest = {
      urls: ["https://example.com/"],
      allowedDomains: ["example.com"],
      maxDepth: 0,
      maxRequests: 17,
      maxConcurrency: 2,
      maxPerHost: 1,
      perHostDelayMs: 2000,
      maxRetries: 0,
      obeyRobots: true,
      sitemaps: true,
      maxSitemaps: 100,
      includeUrlRegex: ["(?i)/anime/", "/catalog/"],
      excludeUrlRegex: ["\\.mp4$"],
      goal: "catalog metadata",
      revisit: true,
      sqlite: "/private/frontier.sqlite",
    };
    await aphrodyWebCrawl(request, native);
    await aphrodyWebCrawl(request, native);
    expect(native.calls[0]).toEqual(native.calls[1]);
    const args = native.calls[0]!;
    for (const [flag, value] of [
      ["--max-depth", "0"],
      ["--max-requests", "17"],
      ["--max-retries", "0"],
      ["--max-sitemaps", "100"],
      ["--sqlite", "/private/frontier.sqlite"],
    ])
      expect(args[args.indexOf(flag!) + 1]).toBe(value);
    expect(args.filter((x) => x === "--include-url-regex")).toHaveLength(2);
    expect(args).toContain("(?i)/anime/");
    expect(args).toContain("--revisit");
    expect(args).toContain("--sitemaps");
  });
  test("explicit robots opt-out omits the positive-only CLI flag", async () => {
    const native = owner();
    await aphrodyWebCrawl({ urls: ["https://example.com/"], obeyRobots: false }, native);
    expect(native.calls[0]).not.toContain("--obey-robots");
  });
  test.each([
    { maxRequests: 0 },
    { maxRequests: null },
    { maxSitemaps: null, sitemaps: true },
    { allowedDomains: null },
    { maxRequests: NaN },
    { maxConcurrency: 0 },
    { maxConcurrency: 1.2 },
    { maxPerHost: -1 },
    { maxDepth: -1 },
    { maxDepth: Infinity },
    { maxRetries: -1 },
    { perHostDelayMs: -1 },
    { maxSitemaps: 200, sitemaps: true },
    { maxSitemaps: 2 },
    { revisit: true },
    { sqlite: "" },
    { includeUrlRegex: [""] },
    { excludeUrlRegex: ["a\0b"] },
    { allowedDomains: ["*.example.com"] },
    { allowedDomains: ["example.com/path"] },
    { allowedDomains: ["example.com:443"] },
    { allowedDomains: ["other.com"] },
    { allowedDomains: [] },
    { urls: ["https://user:pass@example.com/"] },
    { urls: ["file:///local"] },
    { obeyRobots: "true" },
    { sitemaps: 1 },
    { revisit: "yes" },
    { goal: "\0" },
    { includeUrlRegex: "a" },
    { maxRequests: "10" },
  ])("rejects invalid options without invoking the native owner: %j", async (invalid) => {
    const native = owner();
    await expect(
      aphrodyWebCrawl(
        { urls: ["https://example.com/"], ...invalid } as AphrodyWebCrawlRequest,
        native,
      ),
    ).rejects.toThrow();
    expect(native.calls).toHaveLength(0);
  });
  test("rejects native argv overflow before submission", async () => {
    const native = owner();
    await expect(
      aphrodyWebCrawl(
        { urls: ["https://example.com/"], includeUrlRegex: Array(130).fill("a") },
        native,
      ),
    ).rejects.toThrow("argument budget");
    expect(native.calls).toHaveLength(0);
  });
  test("does not expose rejected URL credentials in diagnostics", async () => {
    const native = owner();
    try {
      await aphrodyWebCrawl({ urls: ["https://private-user:private-secret@example.com/"] }, native);
      throw new Error("Expected URL rejection");
    } catch (error) {
      expect(String(error)).not.toContain("private-user");
      expect(String(error)).not.toContain("private-secret");
      expect(String(error)).toContain("without credentials");
    }
    expect(native.calls).toHaveLength(0);
  });
  test.each([
    { ...validReport, attempts: -1 },
    { ...validReport, errors: null },
    { ...validReport, frontier: { pending: -1 } },
    { ...validReport, pages: [{ url: 4 }] },
  ])("rejects malformed native coverage receipts", async (report) => {
    await expect(
      aphrodyWebCrawl({ urls: ["https://example.com/"] }, owner(report)),
    ).rejects.toThrow("invalid crawl report");
  });
  test("accepts the installed native tuple error format", async () => {
    const report: AphrodyWebCrawlReport = {
      ...validReport,
      errors: [["https://example.com/missing", "HTTP 404"]],
    };
    expect(await aphrodyWebCrawl({ urls: ["https://example.com/"] }, owner(report))).toEqual(
      report,
    );
  });
});
