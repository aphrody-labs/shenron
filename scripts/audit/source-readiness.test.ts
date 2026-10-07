import { describe, expect, test } from "bun:test";
import { assessSoshuhen, auditSourceReadiness, type VolumeEvidence } from "./source-readiness";
const volumes = (): VolumeEvidence[] =>
  Array.from({ length: 18 }, (_, i) => ({
    id: 701 + i,
    status: 200,
    series: "SOSH",
    number: i + 1,
    pages: 400,
    sampledAssets: [{ url: "https://example.com/page.jpg", status: 200, image: true }],
  }));
describe("source corpus readiness evidence", () => {
  test("metadata-only volumes fail even when every volume exists", () => {
    const records = volumes().map((v) => Object.assign(v, { pages: 0, sampledAssets: [] }));
    expect(assessSoshuhen(records).status).toBe("incomplete");
    expect(assessSoshuhen(records).emptyVolumes).toHaveLength(18);
  });
  test("duplicate volume numbers cannot replace a missing eighteenth volume", () => {
    const records = volumes();
    records[17]!.number = 17;
    expect(assessSoshuhen(records).missingVolumes).toEqual([18]);
  });
  test("HTML and missing reader assets fail despite populated page arrays", () => {
    const records = volumes();
    records[0]!.sampledAssets[0]!.image = false;
    records[1]!.sampledAssets = [];
    expect(assessSoshuhen(records).inaccessibleVolumes).toEqual([701, 702]);
  });
  test("successful samples do not assert exhaustive OCR/RAG readiness", () => {
    expect(assessSoshuhen(volumes()).status).toBe("unknown");
  });
});

test("the public API numeric summary is resolved to reader page lists", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/api/health/ready")) return Response.json({ status: "ok" });
    if (url.endsWith("/api/manga/volume/701"))
      return Response.json({
        series: "SOSH",
        volume_number: 1,
        chapters: [{ id: 35001, pages: 381 }],
      });
    if (url.includes("/api/manga/volume/"))
      return Response.json({
        series: "SOSH",
        volume_number: Number(url.split("/").at(-1)) - 700,
        chapters: [],
      });
    if (url.endsWith("/api/manga/chapter/35001"))
      return Response.json({
        pages: 381,
        pageList: [{ image: "https://cdn.example.com/001.jpg" }],
      });
    if (url === "https://cdn.example.com/001.jpg")
      return new Response("image", { status: 206, headers: { "Content-Type": "image/jpeg" } });
    throw new Error("Unexpected request " + url);
  }) as typeof fetch;
  const report = await auditSourceReadiness("https://example.com", fetcher);
  expect(report.soshuhen.volumes[0]?.pages).toBe(1);
  expect(report.soshuhen.volumes[0]?.sampledAssets[0]?.image).toBe(true);
  expect(report.soshuhen.emptyVolumes).toHaveLength(17);
  expect(report.productionReady).toBe(false);
});

test("all-assets probes every listed page with bounded concurrency and range requests", async () => {
  let active = 0;
  let maximum = 0;
  let requests = 0;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/health/ready")) return Response.json({ status: "ok" });
    if (url.endsWith("/api/manga/volume/701"))
      return Response.json({
        series: "SOSH",
        volume_number: 1,
        chapters: [{ id: 35001, pages: 9 }],
      });
    if (url.includes("/api/manga/volume/"))
      return Response.json({
        series: "SOSH",
        volume_number: Number(url.split("/").at(-1)) - 700,
        chapters: [],
      });
    if (url.endsWith("/api/manga/chapter/35001"))
      return Response.json({
        pageList: Array.from({ length: 9 }, (_, i) => ({
          image: "https://cdn.example.com/" + i + ".jpg",
        })),
      });
    expect(new Headers(init?.headers).get("Range")).toBe("bytes=0-511");
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    requests++;
    active++;
    maximum = Math.max(active, maximum);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return new Response("image", { status: 206, headers: { "Content-Type": "image/jpeg" } });
  }) as typeof fetch;
  const report = await auditSourceReadiness("https://example.com", fetcher, {
    allAssets: true,
    concurrency: 3,
  });
  expect(requests).toBe(9);
  expect(maximum).toBe(3);
  expect(report.soshuhen.volumes[0]?.sampledAssets).toHaveLength(9);
  expect(report.assetAudit.mode).toBe("all-listed-assets");
  expect(report.productionReady).toBe(false);
});

test("expired audit deadline prevents later requests", async () => {
  let requests = 0;
  const fetcher = (async (_input: string | URL | Request) => {
    requests++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ series: "SOSH", volume_number: 1, chapters: [] });
  }) as typeof fetch;
  const report = await auditSourceReadiness("https://example.com", fetcher, { deadlineMs: 1 });
  expect(requests).toBeLessThanOrEqual(1);
  expect(report.assetAudit.deadlineExceeded).toBe(true);
  expect(report.productionReady).toBe(false);
});
