import { describe, expect, test } from "bun:test";

const categories = [
  "characters",
  "databooks",
  "episodes",
  "games",
  "movies",
  "races",
  "sagas",
  "techniques",
  "transformations",
];
const routeFile = (path: string) => Bun.file(new URL(`../src/app/wiki/${path}`, import.meta.url));

test("arc details reach their own page instead of redirecting to the saga catalogue", async () => {
  const config = await Bun.file(new URL("../next.config.ts", import.meta.url)).text();
  expect(config).toContain('source: "/wiki/arcs", destination: "/wiki/sagas"');
  expect(config).not.toContain('source: "/wiki/arcs/:path*"');
});

test("catalogue loading boundaries are isolated from entity details", async () => {
  for (const category of categories) {
    expect(await routeFile(`${category}/page.tsx`).exists()).toBe(false);
    expect(await routeFile(`${category}/loading.tsx`).exists()).toBe(false);
    expect(await routeFile(`${category}/(index)/page.tsx`).exists()).toBe(true);
    if (category !== "episodes")
      expect(await routeFile(`${category}/(index)/loading.tsx`).exists()).toBe(true);
  }
  for (const path of [
    "arcs/loading.tsx",
    "episodes/[id]/loading.tsx",
    "databooks/[id]/loading.tsx",
    "movies/[slug]/loading.tsx",
  ])
    expect(await routeFile(path).exists()).toBe(false);
});

test("unknown entity metadata calls notFound before detail content can stream", async () => {
  for (const category of [...categories, "arcs"]) {
    const parameter = category === "episodes" || category === "databooks" ? "id" : "slug";
    const source = await routeFile(`${category}/[${parameter}]/page.tsx`).text();
    const metadataStart = source.indexOf("export async function generateMetadata");
    const metadataEnd = source.indexOf("export default", metadataStart);
    const metadata = source.slice(metadataStart, metadataEnd);
    expect(metadata).toMatch(/if \(!\w+\) notFound\(\)/);
    expect(metadata).not.toMatch(/if \(!\w+\) return \{ title:/);
  }
});

test("series metadata distinguishes an empty result from a database outage", async () => {
  const source = await routeFile("episodes/series/[series]/page.tsx").text();
  const metadata = source.slice(
    source.indexOf("export async function generateMetadata"),
    source.indexOf("export default"),
  );
  expect(metadata).toContain("getEpisodesCached(series, 1, 0).catch(() => null)");
  expect(metadata).toContain(
    "available && available.episodes.length === 0 && series !== DBS_BEERUS_SERIES_CODE",
  );
  expect(metadata).toContain("notFound()");
});

test("streaming catalogue retains the compact loading boundary", async () => {
  expect(await routeFile("episodes/(index)/page.tsx").text()).toContain(
    "@/components/streaming/StreamingCatalogue",
  );
  const source = await routeFile("episodes/(index)/loading.tsx").text();
  expect(source).not.toContain("BillboardSkeleton");
  expect(source).toContain("min-h-11");
});

const describeLive = process.env.SITE_TEST_LIVE === "1" ? describe : describe.skip;
const origin = (process.env.SITE_URL ?? "https://dragonballfr.com").replace(/\/+$/, "");
describeLive("unknown wiki records return real HTTP 404 responses", () => {
  for (const category of [...categories, "arcs"]) {
    const missing =
      category === "episodes" || category === "databooks"
        ? "2147483647"
        : "__shenron_missing_20261013__";
    test(category, async () => {
      const response = await fetch(`${origin}/wiki/${category}/${missing}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      expect(response.status).toBe(404);
    });
  }
  for (const path of [
    "episodes/series/__shenron_missing_20261013__",
    "episodes/series/__shenron_missing_20261013__/1",
  ]) {
    test(path, async () => {
      const response = await fetch(`${origin}/wiki/${path}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      expect(response.status).toBe(404);
    });
  }
});
