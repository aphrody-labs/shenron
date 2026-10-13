// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { auditCdnGaps, gapPaths } from "./audit-cdn-gaps";

const paths = Array.from({ length: 120 }, (_, i) => `/wiki/public-${i}.web.mp4`);

test("historical reports pin exactly 120 distinct public routes", () => {
  const reports = {
    media: { failures: paths.slice(0, 75).map((path) => ({ path, status: 404 })) },
    extra: { results: paths.slice(75).map((path) => ({ path, status: 404 })) },
  };
  expect(gapPaths(reports.media, reports.extra)).toEqual(paths.toSorted());
  expect(() =>
    gapPaths(reports.media, { results: [{ path: "/private/../secrets", status: 404 }] }),
  ).toThrow();
});

test("bounded HEAD checks retry once and verify fixed-length media ranges", async () => {
  let inFlight = 0;
  let peak = 0;
  const seen = new Map<string, number>();
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await Promise.resolve();
    inFlight--;
    const path = new URL(String(url)).pathname;
    const n = (seen.get(path) ?? 0) + 1;
    seen.set(path, n);
    if (init?.method === "GET") {
      expect(init.headers).toEqual({ Range: "bytes=0-1023", "Accept-Encoding": "identity" });
      return new Response(new Uint8Array(1024), {
        status: 206,
        headers: { "Content-Length": "1024", "Content-Range": "bytes 0-1023/7922847" },
      });
    }
    return new Response(null, { status: path === paths[0] && n === 1 ? 404 : 200 });
  }) as typeof fetch;
  const result = await auditCdnGaps(paths, {
    fetcher,
    concurrency: 2,
    pause: async () => {},
    rangePaths: ["/media/episodes/beerus-01/optimized-720p.mp4"],
  });
  expect(peak).toBeLessThanOrEqual(2);
  expect(seen.get(paths[0]!)).toBe(2);
  expect(result.headOk).toBe(120);
  expect(result.statuses).toEqual({ "200": 120 });
  expect(result.ranges[0]).toMatchObject({ status: 206, contentLength: 1024 });
  expect(result.success).toBe(true);
});

test("a full response to Range fails qualification without downloading its body", async () => {
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) =>
    init?.method === "HEAD"
      ? new Response(null, { status: 200 })
      : new Response(new ReadableStream<Uint8Array>(), { status: 200 })) as typeof fetch;
  const result = await auditCdnGaps(["/wiki/public.web.mp4"], {
    fetcher,
    attempts: 1,
    rangePaths: ["/media/episodes/beerus-01/optimized-720p.mp4"],
  });
  expect(result.headOk).toBe(1);
  expect(result.ranges[0]?.status).toBe(200);
  expect(result.success).toBe(false);
});
