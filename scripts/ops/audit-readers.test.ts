// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { auditReaders } from "./audit-readers";

const output = resolve(tmpdir(), `shenron-reader-audit-integration-${crypto.randomUUID()}`);
afterAll(async () => {
  if (!output.startsWith(resolve(tmpdir()) + sep)) throw new Error("Invalid audit fixture path");
  await rm(output, { recursive: true, force: true });
});

test("resumed HTTP audit rediscovers catalogues, skips successes and retries failed assets", async () => {
  let assetRequests = 0;
  let pageRequests = 0;
  using server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/manga") return Response.json({ catalog: [{ id: 1 }] });
      if (path === "/api/manga/volume/1") return Response.json({ chapters: [{ id: 1 }] });
      if (path === "/api/manga/chapter/1")
        return Response.json({ pageList: [{ image: "/scan.png" }] });
      if (path === "/api/databooks") return Response.json({ items: [], total: 0 });
      if (path === "/api/episodes") return Response.json({ episodes: [], total: 0 });
      if (path === "/api/movies") return Response.json({ movies: [] });
      if (path === "/scan.png") {
        assetRequests++;
        expect(request.method).toBe("HEAD");
        return new Response(null, {
          status: assetRequests === 1 ? 404 : 200,
          headers: { "content-type": "image/png" },
        });
      }
      pageRequests++;
      return new Response("<main>Reader</main>", { headers: { "content-type": "text/html" } });
    },
  });
  const originalArgs = [...Bun.argv];
  try {
    Bun.argv.splice(2, Bun.argv.length, "--origin", server.url.origin, "--out", output);
    const first = await auditReaders();
    expect(first.failures).toHaveLength(1);
    expect(first.resumedChecks).toBe(0);
    Bun.argv.push("--resume");
    const resumed = await auditReaders();
    expect(resumed.runId).toBe(first.runId);
    expect(resumed.counts.checkedPages).toBe(2);
    expect(resumed.counts.checkedAssets).toBe(1);
    expect(resumed.failures).toEqual([]);
    expect(resumed.resumedChecks).toBe(2);
    expect(pageRequests).toBe(2);
    expect(assetRequests).toBe(2);
  } finally {
    Bun.argv.splice(0, Bun.argv.length, ...originalArgs);
  }
});
