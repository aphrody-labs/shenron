// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  runSourceImport,
  verifyInsertedSources,
} from "../../../scripts/data/import-voiranime-sources";
import { externalSourceImportSchema } from "../src/lib/external-source-import";

const records = externalSourceImportSchema.parse({
  records: [
    {
      url: "https://voir-anime.to/anime/dragon-ball/",
      title: "Dragon Ball",
      excerpt: "",
      contentHash: "a".repeat(64),
      provenance: {
        sourceUrl: "https://voir-anime.to/anime/dragon-ball/",
        sitemap: "https://voir-anime.to/anime-sitemap.xml",
        observedAt: "2026-01-01T00:00:00Z",
        method: "GET",
        httpStatus: 200,
        kind: "series",
        family: "dragon_ball",
        edition: "unspecified",
      },
    },
  ],
}).records;
const id = Buffer.from(records[0]!.url).toString("base64url");
const detail = {
  category: "sources",
  id,
  title: "Dragon Ball",
  originalHref: `/sources/dragon-ball/${id}`,
};
const receipt = { dryRun: false, inserted: 1, skipped: 0, insertedUrls: [records[0]!.url] };

test("offline plan makes no requests even with credentials or input apply=true", async () => {
  const calls: unknown[] = [];
  const result = await runSourceImport(
    { apply: true, records },
    {
      apply: false,
      token: "private",
      fetcher: async () => {
        calls.push(1);
        throw new Error("unexpected fetch");
      },
    },
  );
  expect(result).toHaveProperty("mode", "offline-plan");
  expect(calls).toHaveLength(0);
});
test("apply plans first, reads exact inserted identity/title independently without credentials", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const logs: unknown[] = [];
  const result = await runSourceImport(
    { records },
    {
      apply: true,
      token: "private",
      report: (r) => logs.push(r),
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return Response.json(
          calls.length === 1
            ? { dryRun: true, wouldInsert: 1 }
            : calls.length === 2
              ? receipt
              : detail,
        );
      },
    },
  );
  expect(JSON.parse(calls[0]!.init!.body as string).apply).toBe(false);
  expect(JSON.parse(calls[1]!.init!.body as string).apply).toBe(true);
  expect(calls[2]!.url).toBe(`https://dragonballfr.com/api/catalog?category=sources&id=${id}`);
  expect(calls[2]!.init!.headers).toBeUndefined();
  expect(result).toHaveProperty("verified", 1);
  expect(result).toHaveProperty("responseCount", 1);
  expect(result).toHaveProperty("responsesSha256", expect.stringMatching(/^[a-f0-9]{64}$/));
  expect(JSON.stringify(logs)).not.toContain("private");
});
test("HTTP200 alone, mismatched identities/titles and malformed apply receipts never verify", async () => {
  for (const data of [
    {},
    { ...detail, title: "Other" },
    { ...detail, id: "wrong" },
    { ...detail, originalHref: records[0]!.url },
  ])
    await expect(
      verifyInsertedSources(records, receipt, async () => Response.json(data)),
    ).rejects.toThrow("mismatch");
  await expect(
    verifyInsertedSources(records, receipt, async () => new Response(null, { status: 404 })),
  ).rejects.toThrow("HTTP 404");
  await expect(
    verifyInsertedSources(records, { ...receipt, insertedUrls: [] }, async () =>
      Response.json(detail),
    ),
  ).rejects.toThrow("Invalid apply receipt");
  await expect(
    verifyInsertedSources(
      records,
      { ...receipt, insertedUrls: ["https://evil.example/"] },
      async () => Response.json(detail),
    ),
  ).rejects.toThrow("Unexpected inserted URL");
});
test("skipped rows are untouched and their previous titles are not compared", async () => {
  let calls = 0;
  expect(
    await verifyInsertedSources(
      records,
      { dryRun: false, inserted: 0, skipped: 1, insertedUrls: [] },
      async () => {
        calls++;
        throw new Error("unexpected read");
      },
    ),
  ).toHaveProperty("verified", 0);
  expect(calls).toBe(0);
});
test("verification failure stops the client without a verified receipt", async () => {
  const logs: unknown[] = [];
  let calls = 0;
  await expect(
    runSourceImport(
      { records },
      {
        apply: true,
        token: "private",
        report: (value) => logs.push(value),
        fetcher: async () =>
          Response.json(++calls === 1 ? { dryRun: true } : calls === 2 ? receipt : {}),
      },
    ),
  ).rejects.toThrow("mismatch");
  expect(logs.some((value) => (value as { mode: string }).mode === "verified")).toBe(false);
  expect(calls).toBe(3);
});
