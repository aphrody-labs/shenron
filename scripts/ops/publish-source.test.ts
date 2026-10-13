// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  digest,
  nativePageExport,
  projectPage,
  publicAddress,
  publicSource,
  publicationPlan,
  publicationTarget,
  publicationPolicy,
  preserveExistingRegistry,
  publicationIndexBody,
} from "./publish-source";

test("index budget includes actual UTF-8 serialization and indentation bytes", () => {
  expect(publicationIndexBody({ title: "日本語" })).toBe(
    JSON.stringify({ title: "日本語" }, null, 2) + "\n",
  );
  expect(() => publicationIndexBody({ title: "日".repeat(700000) })).toThrow("2 MiB");
  const many = Array.from({ length: 40000 }, () => ({ value: "a".repeat(32) }));
  expect(new TextEncoder().encode(JSON.stringify(many)).length).toBeLessThan(2 * 1024 * 1024);
  expect(() => publicationIndexBody(many)).toThrow("2 MiB");
});
import {
  crawlIngestPolicySchema,
  projectNativeCrawl,
} from "../../packages/pipeline/src/dragon-ball/crawl-ingest";

test("Archive publications retain their canonical classification and never replace existing rich notices", async () => {
  const source = "https://archive.org/details/qualified-item";
  expect(publicationPolicy(source).sources[0]!.kind).toBe("archive");
  const record = projectNativeCrawl(
    nativePageExport(
      {
        url: source,
        title: "Generic HTML shell",
        markdown: "Short shell",
        content_hash: "",
        fetched_at: 1791900000123,
      },
      source,
    ),
    publicationPolicy(source),
  )[0]!;
  let writes = 0;
  const owner = {
    assertReady: async () => {},
    upsert: async () => {
      writes++;
      return "applied" as const;
    },
  };
  const protectedOwner = preserveExistingRegistry(owner, new Set([source]));
  expect(await protectedOwner.upsert(record)).toBe("protected");
  expect(writes).toBe(0);
  const newOwner = preserveExistingRegistry(owner, new Set<string>());
  expect(await newOwner.upsert(record)).toBe("applied");
  expect(writes).toBe(1);
});

test("registry expectations use canonical normalization while public objects retain exact captured bytes", () => {
  const page = {
    url: "https://publisher.example/guide",
    title: " Guide ",
    markdown: "  Body\0 content\n\n",
    content_hash: "native",
    fetched_at: 1791900000123,
  };
  const exported = nativePageExport(page, page.url);
  const policy = crawlIngestPolicySchema.parse({
    version: 1,
    profile: "dbfr",
    sources: [
      {
        domain: "publisher.example",
        kind: "reference",
        reviewed: true,
        evidence: page.url,
        rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: true },
      },
    ],
  });
  const record = projectNativeCrawl(exported, policy)[0]!;
  expect(record.contentHash).toBe(digest("Body content"));
  expect(record.contentHash).not.toBe(digest(page.markdown));
  expect(projectPage(page, "/publications/guide", "publisher.example").body.sha256).toBe(
    digest(page.markdown),
  );
  expect(record.title).toBe("Guide");
  expect(record.fetchedAt).toBe(new Date(page.fetched_at).toISOString());
});

test("publication targets map only to the actual dynamic public namespace", () => {
  expect(publicationTarget("https://dragonballfr.com/publications/official-guide").slug).toBe(
    "official-guide",
  );
  for (const target of [
    "https://example.com/publications/guide",
    "https://dragonballfr.com/admin",
    "https://dragonballfr.com/publications/a?secret=1",
    "https://dragonballfr.com/publications/A",
    "https://dragonballfr.com/publications/a/b",
    `https://dragonballfr.com/publications/${"a".repeat(81)}`,
  ])
    expect(() => publicationTarget(target)).toThrow();
});
test("source identity rejects credentials, private names, IPs and forbidden providers", () => {
  expect(publicSource("https://publisher.example/guide").hostname).toBe("publisher.example");
  for (const source of [
    "http://publisher.example/",
    "https://user:pass@publisher.example/",
    "https://127.0.0.1/",
    "https://private.local/",
    "https://x.fandom.com/",
    "https://publisher.example:8443/",
    "https://publisher.example/#private",
  ])
    expect(() => publicSource(source)).toThrow();
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
  ])
    expect(publicAddress(address)).toBe(false);
  expect(publicAddress("1.1.1.1")).toBe(true);
  expect(publicAddress("2606:4700::1111")).toBe(true);
});
test("plans are deterministic, bounded and use the installed native crawl interface", () => {
  const plan = publicationPlan(
    "https://publisher.example/guide",
    "https://dragonballfr.com/publications/guide",
  );
  expect(plan).toEqual(
    publicationPlan(
      "https://publisher.example/guide",
      "https://dragonballfr.com/publications/guide",
    ),
  );
  expect(plan.crawl).toContain("--obey-robots");
  expect(plan.crawl).toContain("--sitemaps");
  const singlePage = publicationPlan(plan.sourceUrl, plan.targetUrl, {
    requests: 1,
    depth: 0,
    timeout: 90,
  });
  expect(singlePage.crawl).not.toContain("--sitemaps");
  expect(singlePage.limits).toEqual({ requests: 1, depth: 0, timeout: 90 });
  expect(plan.canonicalPromotions).toBe(0);
  expect(() =>
    publicationPlan(plan.sourceUrl, plan.targetUrl, { requests: 257, depth: 5, timeout: 900 }),
  ).toThrow();
});
test("public object identities describe exact bytes and same-source child links", () => {
  const markdown =
    "日本語 body\n[child](https://publisher.example/child)\n[foreign](https://other.example/)";
  const projected = projectPage(
    {
      url: "https://publisher.example/guide",
      title: "Guide",
      markdown,
      content_hash: "ignored-upstream-hash",
      fetched_at: 1,
    },
    "/publications/guide",
    "publisher.example",
  );
  expect(projected.body.sha256).toBe(digest(markdown));
  expect(projected.body.size).toBe(new TextEncoder().encode(markdown).length);
  expect(projected.children).toEqual(["https://publisher.example/child"]);
  expect(projected.media).toEqual([]);
  expect(() =>
    projectPage(
      { url: "https://other.example/", title: "x", markdown, content_hash: "", fetched_at: 1 },
      "/publications/guide",
      "publisher.example",
    ),
  ).toThrow();
});
