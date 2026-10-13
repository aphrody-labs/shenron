// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { safeCdnPath, readCdnPage } = await import("../src/lib/cdn-catalog");
test("directory browsing rejects encoded and nested path escapes", () => {
  for (const value of [
    "//evil.test/",
    "/../",
    "/%2e%2e/",
    "/%252e%252e/",
    "/%255csecret/",
    "/a?token=x",
    "/a\u0000/",
    "/%0a/",
  ])
    expect(safeCdnPath(value)).toBe(false);
  expect(safeCdnPath("/assets/manga/Dragon%20Ball/")).toBe(true);
});
test("a tampered shard cannot redirect the public catalogue to private or foreign data", async () => {
  const original = globalThis.fetch;
  const revision = "a".repeat(64);
  let calls = 0;
  globalThis.fetch = Object.assign(
    async () => {
      calls++;
      return Response.json(
        calls === 1
          ? {
              schema: "shenron-public-cdn/v1",
              revision,
              inventorySha256: "b".repeat(64),
              pageSize: 96,
              files: {
                pages: [{ url: "https://private.test/secret", count: 1, sha256: "c".repeat(64) }],
              },
              folders: {
                shardTemplate: `/catalog/assets/revisions/${revision}/directories/{shard}.json`,
                shards: {},
              },
            }
          : {},
      );
    },
    { preconnect: original.preconnect },
  ) as typeof fetch;
  try {
    await expect(readCdnPage({ all: true })).rejects.toThrow("CDN descriptor differs");
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});
