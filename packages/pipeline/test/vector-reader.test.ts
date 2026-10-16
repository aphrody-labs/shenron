// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createBunVectorReader,
  directBunQueryEmbedder,
  type BunRagDocument,
  type BunRagSource,
  type ReadOnlyVectorIndex,
} from "../src/ai/vector-reader";
const roots: string[] = [];
afterEach(async () => {
  for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});
const generation = { epoch: "723df323-96c2-40f3-a42a-bd6081ad6b42", revision: "1" };
const id = (n: number) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const hash = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "shenron-reader-"));
  roots.push(directory);
  await chmod(directory, 0o700);
  const mapping = [1, 2, 3]
    .map((n) => JSON.stringify({ key: String(n), documentId: id(n) }) + "\n")
    .join("");
  const manifest = JSON.stringify({
    schema: "shenron-vector-sidecar/v1",
    generation,
    model: "Xenova/multilingual-e5-small",
    dimensions: 384,
    count: 3,
    mappingSha256: hash(mapping),
  });
  const indexBytes = "fixture persisted index";
  const receipt = JSON.stringify({
    schema: "shenron-vector-sidecar-build/v1",
    generation,
    manifestSha256: hash(manifest),
    count: 3,
    indexSha256: hash(indexBytes),
    fullReadbackVerified: true,
    activated: false,
  });
  for (const [name, value] of Object.entries({
    "mapping.jsonl": mapping,
    "manifest.json": manifest,
    "index.bin": indexBytes,
    "build-receipt.json": receipt,
  })) {
    await Bun.write(join(directory, name), value);
    await chmod(join(directory, name), 0o600);
  }
  let revision = "1",
    closes = 0,
    embeddings = 0;
  const nativeCalls: bigint[][] = [];
  const docs: BunRagDocument[] = [1, 2, 3].map((n) => ({
    id: id(n),
    documentId: "shenron:pg:fixture:" + "a".repeat(24) + ":" + n,
    kind: n === 2 ? "community" : "reference",
    lang: n === 2 ? "en" : "fr",
    origin: n === 2 ? "native-community" : "db_characters",
    entity: "goku",
    eligible: n !== 3,
    title: "Fixture " + n,
    url: n === 2 ? "https://community.example/item" : "https://dragonballfr.com/characters/" + n,
    content: "Verified fixture body " + n,
  }));
  const matches = (
    row: BunRagDocument,
    f: { kind?: string; lang?: string; sourceId?: string; entity?: string },
  ) =>
    row.eligible &&
    (!f.kind || row.kind === f.kind) &&
    (!f.lang || row.lang === f.lang) &&
    (!f.sourceId || row.origin === f.sourceId) &&
    (!f.entity || row.entity === f.entity);
  const source: BunRagSource = {
    async generation() {
      return { ...generation, revision };
    },
    async snapshot(consume) {
      return consume({
        generation: { ...generation, revision },
        async *metadata() {
          yield docs;
        },
        async lexical(_q, f) {
          return docs.filter((d) => d.id === id(1) && matches(d, f)).map((d) => d.id);
        },
        async hydrate(ids, f) {
          return docs.filter((d) => ids.includes(d.id) && matches(d, f));
        },
      });
    },
  };
  const index: ReadOnlyVectorIndex = {
    count: 3,
    dimensions: 384,
    close() {
      closes++;
    },
    search(_v, k, options) {
      const allowedKeys = options.allowedKeys ?? [1n, 2n, 3n];
      nativeCalls.push([...allowedKeys]);
      return [3n, 2n, 1n]
        .filter((key) => allowedKeys.includes(key))
        .slice(0, k)
        .map((key) => ({ key, score: -Number(key) }));
    },
  };
  const ports = {
    source,
    openIndex: () => index,
    async embed() {
      embeddings++;
      return new Float32Array(384);
    },
  };
  return {
    config: { directory, manifestSha256: hash(manifest), receiptSha256: hash(receipt) },
    ports,
    docs,
    nativeCalls,
    get closes() {
      return closes;
    },
    get embeddings() {
      return embeddings;
    },
    drift() {
      revision = "2";
    },
  };
}
test.skipIf(process.platform === "win32")(
  "reader prefilters native candidates, hydrates UUIDs and fuses lexical/vector ranks",
  async () => {
    const f = await fixture(),
      reader = await createBunVectorReader(f.config, f.ports);
    const result = await reader.search("goku", 2);
    expect(result.mode).toBe("hybrid");
    expect(result.results.map((x) => x.id)).toEqual([id(1), id(2)]);
    expect(result.results[0]!.sourceId).toBe("db_characters");
    expect(result.results[1]!.kind).toBe("community");
    expect(f.nativeCalls[0]).toEqual([1n, 2n]);
    expect(result.results.every((x) => x.id !== id(3))).toBe(true);
    reader.close();
    reader.close();
    expect(f.closes).toBe(1);
  },
);
test.skipIf(process.platform === "win32")(
  "origin/lang/kind/entity filters apply before native top-k and lexicalOnly performs no inference",
  async () => {
    const f = await fixture(),
      reader = await createBunVectorReader(f.config, f.ports);
    const result = await reader.search("fixture", 5, {
      sourceId: "native-community",
      kind: "community",
      lang: "en",
      entity: "goku",
    });
    expect(result.results.map((x) => x.id)).toEqual([id(2)]);
    expect(f.nativeCalls[0]).toEqual([2n]);
    const before = f.embeddings;
    const lexical = await reader.search("fixture", 5, { lexicalOnly: true });
    expect(lexical.mode).toBe("lexical");
    expect(f.embeddings).toBe(before);
    reader.close();
  },
);
test.skipIf(process.platform === "win32")(
  "generation drift before or during search fails closed without retrieval fallback",
  async () => {
    const f = await fixture(),
      reader = await createBunVectorReader(f.config, f.ports);
    f.drift();
    await expect(reader.search("fixture", 2)).rejects.toThrow("generation differs");
    expect(f.embeddings).toBe(0);
    reader.close();
    const g = await fixture();
    g.ports.embed = async () => {
      g.drift();
      return new Float32Array(384);
    };
    const second = await createBunVectorReader(g.config, g.ports);
    await expect(second.search("fixture", 2)).rejects.toThrow("generation changed");
    second.close();
  },
);
test.skipIf(process.platform === "win32")(
  "changed index bytes and missing qualification cannot open native resources",
  async () => {
    const f = await fixture();
    await Bun.write(join(f.config.directory, "index.bin"), "changed");
    await expect(createBunVectorReader(f.config, f.ports)).rejects.toThrow("bytes differ");
    expect(f.closes).toBe(0);
    const g = await fixture();
    await expect(
      createBunVectorReader({ ...g.config, receiptSha256: "0".repeat(64) }, g.ports),
    ).rejects.toThrow("receipt pin differs");
    expect(g.closes).toBe(0);
  },
);
test("query embedding uses only existing model HTTP route and rejects a different vector space", async () => {
  const calls: URL[] = [];
  const env = {
    APHRODY_AI_HTTP_URL: "http://127.0.0.1:8789",
    APHRODY_AI_HTTP_TOKEN: "private-fixture",
  };
  const embed = directBunQueryEmbedder(env, async (input, init) => {
    calls.push(new URL(String(input)));
    expect(JSON.parse(String(init?.body))).toEqual({ texts: ["goku fixture"], kind: "query" });
    return Response.json({ model: "wrong-model", vectors: [Array(384).fill(0)] });
  });
  await expect(embed("goku   fixture")).rejects.toThrow("model differs");
  expect(calls.map((x) => x.pathname)).toEqual(["/api/v1/shenron/embed"]);
});

test.skipIf(process.platform === "win32")(
  "native provider cannot return hidden keys or positive L2 scores",
  async () => {
    for (const hit of [
      { key: 3n, score: -0.1 },
      { key: 1n, score: 0.5 },
    ]) {
      const f = await fixture(),
        open = f.ports.openIndex;
      f.ports.openIndex = () => ({ ...open(), search: () => [hit] });
      const reader = await createBunVectorReader(f.config, f.ports);
      await expect(reader.search("fixture", 3)).rejects.toThrow(
        "Native filter or negative L2 score differs",
      );
      reader.close();
    }
  },
);
test.skipIf(process.platform === "win32")(
  "cancelled product query performs no inference",
  async () => {
    const f = await fixture(),
      reader = await createBunVectorReader(f.config, f.ports),
      controller = new AbortController();
    controller.abort();
    await expect(reader.search("fixture", 3, { signal: controller.signal })).rejects.toThrow();
    expect(f.embeddings).toBe(0);
    reader.close();
  },
);
