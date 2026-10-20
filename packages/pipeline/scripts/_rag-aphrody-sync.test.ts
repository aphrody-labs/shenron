// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { prepareSource, syncSource } from "./_rag-aphrody-sync";
import type { SourceChunk } from "./_rag-sources-pg";

const chunks = [
  {
    title: "Reviewed source",
    content: "Reviewed editorial passage",
    url: "/wiki/reviewed-source",
    kind: "article",
    lang: "fr",
    entity: "reviewed-source",
  },
] satisfies SourceChunk[];

test("a changed source is rejected before an unavailable client or any ingestion", async () => {
  const digest = prepareSource("reviewed", chunks).digest;
  await expect(
    syncSource(null, "reviewed", [{ ...chunks[0]!, content: "Concurrent staff edit" }], undefined, {
      apply: true,
      expectedSourceDigest: digest,
    }),
  ).rejects.toThrow("source changed since reviewed snapshot; no ingestion attempted");
});

test("an unchanged reviewed snapshot supports a dry run without writes", async () => {
  const digest = prepareSource("reviewed", chunks).digest;
  const { result } = await syncSource(null, "reviewed", chunks, undefined, {
    apply: false,
    expectedSourceDigest: digest,
  });
  expect(result.digest).toBe(digest);
  expect(result.rendered).toBe(1);
  expect(result.indexed).toBe(0);
});
