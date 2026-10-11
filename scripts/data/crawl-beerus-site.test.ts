// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  approvedUrl,
  isPlaybackMedia,
  parseRobots,
  robotsAccess,
  robotsPermits,
  observedUrl,
  compareCaptures,
  approvedSitemap,
  parseSitemap,
  sitemapLimits,
  qualifiedSitemapLimits,
  pendingSitemaps,
  acceptBodyChunk,
  resumableUrls,
} from "./crawl-beerus-site";

test("robots resource status follows RFC 9309 without treating an outage as permission", () => {
  expect(robotsAccess(200)).toBe("rules");
  for (const status of [401, 403, 404, 410]) expect(robotsAccess(status)).toBe("unavailable");
  for (const status of [301, 429, 500, 503]) expect(robotsAccess(status)).toBe("unreachable");
  expect(
    robotsPermits(
      "https://dragonball-super.com/en/private",
      parseRobots("User-agent: *\nDisallow: /en/private").rules,
    ),
  ).toBe(false);
});
test("body budgets reject overshoot chunks while recording consumed and accepted separately", () => {
  expect(acceptBodyChunk(1048000, 8192, 1048576)).toBe(false);
  expect(acceptBodyChunk(0, 1024, 1024)).toBe(true);
  expect(acceptBodyChunk(0, -1, 1024)).toBe(false);
});
test("sitemap limits allow bounded larger documents and reject unbounded overrides", () => {
  expect(qualifiedSitemapLimits({ documentBytes: 8 * 1024 * 1024 }).documentBytes).toBe(8388608);
  for (const overrides of [
    { documents: 65 },
    { bytes: Infinity },
    { urls: -1 },
    { documentBytes: 0 },
  ])
    expect(() => qualifiedSitemapLimits(overrides)).toThrow("Invalid sitemap budget");
});
test("sitemap resumption prioritizes pending URLs and preserves retriable legacy failures", () => {
  expect(
    pendingSitemaps({
      sitemapBudget: {
        remaining: [
          "https://www.db-z.com/post-sitemap5.xml",
          "https://evil.test/a.xml",
          "https://credential@www.db-z.com/a.xml",
        ],
      },
      sitemaps: [
        { url: "https://www.db-z.com/post-sitemap.xml", state: "unavailable_or_invalid" },
        { url: "https://www.db-z.com/post-sitemap5.xml", state: "budget_exceeded" },
        { url: "https://www.db-z.com/bad.xml", state: "invalid" },
      ],
    }),
  ).toEqual(["https://www.db-z.com/post-sitemap5.xml", "https://www.db-z.com/post-sitemap.xml"]);
});
test("sitemap resumption retains transient failures while rejecting robots and malformed XML failures", () => {
  expect(
    pendingSitemaps({
      sitemaps: [
        {
          url: "https://www.db-z.com/post-sitemap4.xml",
          state: "unavailable",
          reason: "request_timeout",
        },
        {
          url: "https://www.db-z.com/post-sitemap5.xml",
          state: "unavailable",
          reason: "request_failed",
        },
        { url: "https://www.db-z.com/bad.xml", state: "invalid", reason: "xml_parse_rejected" },
        { url: "https://dragonball-super.com/sitemap.xml", state: "robots_unavailable" },
        { url: "https://evil.test/sitemap.xml", state: "unavailable", reason: "request_timeout" },
      ],
    }),
  ).toEqual(["https://www.db-z.com/post-sitemap4.xml", "https://www.db-z.com/post-sitemap5.xml"]);
});
test("sitemap documents distinguish indexes and decode URL entities", () => {
  expect(
    parseSitemap(
      '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://dragonball-super.com/sitemap-en.xml</loc></sitemap></sitemapindex>',
    ),
  ).toEqual({ index: true, urls: ["https://dragonball-super.com/sitemap-en.xml"] });
  expect(
    parseSitemap(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://dragonball-super.com/en/updates/detail.html?id=20261011&amp;v=&#49;</loc></url></urlset>',
    ),
  ).toEqual({
    index: false,
    urls: ["https://dragonball-super.com/en/updates/detail.html?id=20261011&v=1"],
  });
});
test("sitemap parsing rejects declarations, malformed roots and budget overflow", () => {
  expect(
    parseSitemap(
      "<urlset><url><loc><![CDATA[https://dragonball-super.com/en/?a=1&b=2]]></loc></url></urlset>",
    ).urls,
  ).toEqual(["https://dragonball-super.com/en/?a=1&b=2"]);
  expect(() =>
    parseSitemap('<!DOCTYPE urlset [<!ENTITY x SYSTEM "file:///secret">]><urlset></urlset>'),
  ).toThrow("declarations");
  expect(() => parseSitemap("<urlset><url><loc>&custom;</loc></url></urlset>")).toThrow("entity");
  expect(() => parseSitemap("<html></html>")).toThrow("root");
  expect(() => parseSitemap("<urlset><loc>a</loc><loc>b</loc></urlset>", 1)).toThrow("URL budget");
  expect(() => parseSitemap(" ".repeat(sitemapLimits.documentBytes + 1))).toThrow("byte budget");
});
test("sitemaps are restricted to approved HTTPS XML origins independently of page scope", () => {
  expect(approvedSitemap("/sitemap.xml", "https://dragonball-super.com/en/")).toBe(
    "https://dragonball-super.com/sitemap.xml",
  );
  expect(approvedSitemap("/sitemap.xml", "https://www.db-z.com/")).toBe(
    "https://www.db-z.com/sitemap.xml",
  );
  for (const url of [
    "https://evil.test/sitemap.xml",
    "http://dragonball-super.com/sitemap.xml",
    "https://token@dragonball-super.com/sitemap.xml",
    "https://dragonball-super.com/movie.mpd",
  ])
    expect(approvedSitemap(url, "https://dragonball-super.com/")).toBeUndefined();
});
test("passive inventory records external HTTPS references without authorizing traversal", () => {
  expect(
    observedUrl(
      "https://www.youtube-nocookie.com/embed/official#play",
      "https://dragonball-super.com/en/",
    ),
  ).toBe("https://www.youtube-nocookie.com/embed/official");
  expect(
    approvedUrl(
      "https://www.youtube-nocookie.com/embed/official",
      "https://dragonball-super.com/en/",
      false,
    ),
  ).toBeUndefined();
  expect(observedUrl("javascript:alert(1)", "https://dragonball-super.com/en/")).toBeUndefined();
  expect(
    observedUrl("https://token@example.com/", "https://dragonball-super.com/en/"),
  ).toBeUndefined();
});
test("capture delta separates content changes, failures and URLs not observed", () => {
  expect(
    compareCaptures(
      [
        { url: "a", sha256: "old", status: 200 },
        { url: "b", sha256: "same", status: 200 },
        { url: "c", sha256: "prior", status: 200 },
      ],
      [
        { url: "a", sha256: "new", status: 200 },
        { url: "b", state: "unavailable" },
        { url: "d", sha256: "added", status: 200 },
      ],
    ),
  ).toEqual({ added: ["d"], changed: ["a"], unobserved: ["c"], unavailable: ["b"] });
});
test("robots applies specific groups, wildcard endings and longest allow rules", () => {
  const { rules, sitemaps } = parseRobots(
    "User-agent: *\nDisallow: /\nUser-agent: Shenron-source-crawl\nDisallow: /en/private*\nAllow: /en/private/public\nDisallow: /*?secret=$\nSitemap: https://dragonball-super.com/sitemap.xml",
  );
  expect(robotsPermits("https://dragonball-super.com/en/", rules)).toBe(true);
  expect(robotsPermits("https://dragonball-super.com/en/private/a", rules)).toBe(false);
  expect(robotsPermits("https://dragonball-super.com/en/private/public/a", rules)).toBe(true);
  expect(robotsPermits("https://dragonball-super.com/en/?secret=", rules)).toBe(false);
  expect(sitemaps).toEqual(["https://dragonball-super.com/sitemap.xml"]);
});
test("source traversal stays on public approved hosts and the requested English subtree", () => {
  expect(approvedUrl("music/index.html#theme", "https://dragonball-super.com/en/", true)).toBe(
    "https://dragonball-super.com/en/music/index.html",
  );
  expect(
    approvedUrl(
      "https://dragonball-super.com.evil.test/en/",
      "https://dragonball-super.com/en/",
      true,
    ),
  ).toBeUndefined();
  expect(
    approvedUrl(
      "https://credential@dragonball-super.com/en/",
      "https://dragonball-super.com/en/",
      true,
    ),
  ).toBeUndefined();
  expect(approvedUrl("/admin/", "https://dragonball-super.com/en/", true)).toBeUndefined();
  expect(
    approvedUrl("https://127.0.0.1/a", "https://dragonball-super.com/en/", false),
  ).toBeUndefined();
});
test("bounded crawl queues resume only deduplicated URLs inside the approved page and asset scopes", () => {
  expect(
    resumableUrls(
      [
        "https://dragonball-super.com/en/updates/detail.html?id=beerus-01",
        "https://dragonball-super.com/en/updates/detail.html?id=beerus-01",
        "https://dragonball-super.com/private/admin",
        "https://evil.test/en/",
        "https://www.db-z.com/another-article/",
      ],
      "https://dragonball-super.com/en/",
      true,
    ),
  ).toEqual(["https://dragonball-super.com/en/updates/detail.html?id=beerus-01"]);
  expect(
    resumableUrls(
      [
        "https://dragonball-super.com/en/assets/site.css",
        "https://dragonball-super.com/en/assets/site.css",
        "https://www.db-z.com/wp-content/site.css",
        "https://www.db-z.com/private/site.css",
      ],
      "https://dragonball-super.com/en/",
      false,
    ),
  ).toEqual([
    "https://dragonball-super.com/en/assets/site.css",
    "https://www.db-z.com/wp-content/site.css",
  ]);
});
test("official update identity survives normalization without tracking parameters", () => {
  for (const id of ["w8dcvq713", "c9501ns2dfyu"])
    expect(
      approvedUrl(
        `https://dragonball-super.com/en/updates/detail.html?id=${id}&utm_source=share`,
        "https://dragonball-super.com/en/",
        true,
      ),
    ).toBe(`https://dragonball-super.com/en/updates/detail.html?id=${id}`);
  expect(
    approvedUrl(
      "detail.html?id=20261008-01&utm_source=share",
      "https://dragonball-super.com/en/updates/",
      true,
    ),
  ).toBe("https://dragonball-super.com/en/updates/detail.html?id=20261008-01");
  expect(
    approvedUrl("detail.html?id=20260903-2", "https://dragonball-super.com/en/updates/", true),
  ).toBe("https://dragonball-super.com/en/updates/detail.html?id=20260903-2");
});
test("official update query identities refuse ambiguity and unsafe values", () => {
  const base = "https://dragonball-super.com/en/updates/";
  for (const query of [
    "id=a&id=b",
    "id=a&id=a",
    "id=",
    "",
    "id=../private",
    "id=%2Fadmin",
    "id=a%20b",
    "id=" + "a".repeat(129),
  ])
    expect(approvedUrl(`detail.html?${query}`, base, true)).toBeUndefined();
  expect(
    approvedUrl(
      "https://credential@dragonball-super.com/en/updates/detail.html?id=w8dcvq713",
      base,
      true,
    ),
  ).toBeUndefined();
  expect(approvedUrl("../music/index.html?id=w8dcvq713&utm_source=share", base, true)).toBe(
    "https://dragonball-super.com/en/music/index.html",
  );
  expect(approvedUrl(`detail.html?id=${"a".repeat(128)}`, base, true)).toBe(
    `${base}detail.html?id=${"a".repeat(128)}`,
  );
});
test("private site capture excludes playback manifests and segments", () => {
  for (const extension of ["m3u8", "mpd", "ts", "m4s", "mp4", "webm", "aac", "key"]) {
    expect(isPlaybackMedia(`https://dragonball-super.com/media.${extension}?v=1`)).toBe(true);
  }
  expect(isPlaybackMedia("https://dragonball-super.com/en/assets/css/style.css")).toBe(false);
});
