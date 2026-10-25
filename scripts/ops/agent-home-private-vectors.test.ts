// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openShenronVfs } from "../../packages/db/src/vfs";
import { importNote, prepareNote, sha256 } from "./agent-home-notes";
import {
  indexPrivateNotes,
  privateQueryEmbedder,
  type PrivateVectorOptions,
} from "./agent-home-notes-index";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const unitVector = () => Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0));
async function fixture() {
  const home = mkdtempSync(join(tmpdir(), "shenron-private-vectors-"));
  roots.push(home);
  await Bun.write(join(home, "source.txt"), "Inspected fixture");
  const prepared = await prepareNote(
    JSON.stringify({
      version: 1,
      id: "vector-fixture",
      title: "Reviewed fixture",
      status: "reviewed",
      visibility: "private",
      continuity: "Fixture only",
      observedAt: "2026-10-25",
      observations: "Bounded observation.",
      limitations: "Not a real manga claim.",
      sources: [{ file: "source.txt", sha256: sha256("Inspected fixture"), locator: "Fixture" }],
      review: { by: "qa", at: "2026-10-25" },
    }),
    home,
  );
  await importNote(home, prepared, { apply: true });
  const lexical = await indexPrivateNotes(home, true, async (text) => [{ text }]);
  return {
    home,
    lexical,
    expected: {
      noteId: prepared.note.id,
      sourceSha256: sha256(prepared.markdown),
      manifestSha256: prepared.digest,
      indexSha256: sha256(await Bun.file(lexical.output).arrayBuffer()),
      chunks: 1,
    },
  };
}
test("explicit private vectors use owner passage/query kinds, retain lexical backup and stay excluded publicly", async () => {
  const { home, lexical, expected } = await fixture();
  const calls: { kind: string; requireModel?: string; texts: readonly string[] }[] = [];
  const compute: PrivateVectorOptions["compute"] = {
    embed: async (input) => {
      calls.push(input);
      return {
        ok: true,
        value: { vectors: input.texts.map(unitVector), model: "Xenova/multilingual-e5-small" },
      };
    },
  };
  const indexed = await indexPrivateNotes(home, true, async (text) => [{ text }], {
    compute,
    expected,
  });
  expect(indexed.vectors).toBe(1);
  expect(indexed.model).toBe("Xenova/multilingual-e5-small");
  expect(sha256(await Bun.file(indexed.backup!).arrayBuffer())).toBe(expected.indexSha256);
  const opened = openShenronVfs(lexical.output, { readOnly: true });
  try {
    const result = await opened.rag.searchWith("unmatchedkeyword", privateQueryEmbedder(compute));
    expect(result.mode).toBe("hybrid");
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.vectorRank).toBe(1);
    expect(
      opened.rag.search("unmatchedkeyword", {
        publicOnly: true,
        embedding: Float32Array.from(unitVector()),
      }),
    ).toHaveLength(0);
  } finally {
    opened.vfs.db.close();
  }
  expect(calls.map((call) => call.kind)).toEqual(["passage", "query"]);
  expect(calls.every((call) => call.requireModel === "Xenova/multilingual-e5-small")).toBe(true);
  expect(calls[0]!.texts[0]).not.toStartWith("passage: ");
});
test("vector scope and chunk-count preconditions reject drift before sending any passage", async () => {
  const { home, expected } = await fixture();
  let calls = 0;
  const compute: PrivateVectorOptions["compute"] = {
    embed: async () => {
      calls++;
      throw new Error("must not call");
    },
  };
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], {
      compute,
      expected: { ...expected, sourceSha256: "0".repeat(64) },
    }),
  ).rejects.toThrow("snapshot");
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], {
      compute,
      expected: { ...expected, chunks: 2 },
    }),
  ).rejects.toThrow("chunk count");
  expect(calls).toBe(0);
  await expect(
    indexPrivateNotes(home, true, async () => [{ text: "x".repeat(1401) }], { compute, expected }),
  ).rejects.toThrow("effective 1400-character");
  expect(calls).toBe(0);
});
test("provider failure and invalid model/space preserve the exact previous lexical file", async () => {
  const { home, lexical, expected } = await fixture();
  for (const value of [
    { vectors: [unitVector()], model: "another/model" },
    { vectors: [], model: "Xenova/multilingual-e5-small" },
    { vectors: [unitVector().slice(1)], model: "Xenova/multilingual-e5-small" },
    { vectors: [Array(384).fill(0)], model: "Xenova/multilingual-e5-small" },
    { vectors: [[Number.NaN, ...unitVector().slice(1)]], model: "Xenova/multilingual-e5-small" },
  ]) {
    const compute: PrivateVectorOptions["compute"] = { embed: async () => ({ ok: true, value }) };
    await expect(
      indexPrivateNotes(home, true, async (text) => [{ text }], { compute, expected }),
    ).rejects.toThrow();
    expect(sha256(await Bun.file(lexical.output).arrayBuffer())).toBe(expected.indexSha256);
  }
  const compute: PrivateVectorOptions["compute"] = {
    embed: async () => ({
      ok: false,
      kind: "unreachable",
      path: "/api/v1/shenron/embed",
      detail: "offline",
    }),
  };
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], { compute, expected }),
  ).rejects.toThrow("unreachable");
  expect(sha256(await Bun.file(lexical.output).arrayBuffer())).toBe(expected.indexSha256);
});

test("failed private qualification never publishes vectors over the previous lexical index", async () => {
  const { home, lexical, expected } = await fixture();
  const compute: PrivateVectorOptions["compute"] = {
    embed: async () => ({
      ok: true,
      value: { model: "Xenova/multilingual-e5-small", vectors: [unitVector()] },
    }),
  };
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], {
      compute,
      expected,
      beforePublish: async (opened) => {
        expect(opened.rag.stats().vectorsF32).toBe(1);
        expect(sha256(await Bun.file(lexical.output).arrayBuffer())).toBe(expected.indexSha256);
        throw new Error("qualification failed");
      },
    }),
  ).rejects.toThrow("qualification failed");
  expect(sha256(await Bun.file(lexical.output).arrayBuffer())).toBe(expected.indexSha256);
});

test("private publication refuses concurrent index changes and changed chunk fingerprints", async () => {
  const { home, lexical, expected } = await fixture();
  let calls = 0;
  const compute: PrivateVectorOptions["compute"] = {
    embed: async () => {
      calls++;
      return {
        ok: true,
        value: { model: "Xenova/multilingual-e5-small", vectors: [unitVector()] },
      };
    },
  };
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], {
      compute,
      expected: { ...expected, chunkSha256: ["0".repeat(64)] },
    }),
  ).rejects.toThrow("chunk content");
  expect(calls).toBe(0);
  await expect(
    indexPrivateNotes(home, true, async (text) => [{ text }], {
      compute,
      expected,
      beforePublish: async () => {
        await Bun.write(lexical.output, "Concurrent writer");
      },
    }),
  ).rejects.toThrow("Previous index changed");
  expect(await Bun.file(lexical.output).text()).toBe("Concurrent writer");
});
