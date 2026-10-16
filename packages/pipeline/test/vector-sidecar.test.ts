// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildVectorSidecar,
  nativeVectorIndexAvailable,
  exportVectorSidecar,
  type VectorSource,
  type VectorFactory,
} from "../src/ai/vector-sidecar";
import { SHENRON_RAG_INDEX } from "../src/ai/config";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function target() {
  const root = await mkdtemp(join(tmpdir(), "shenron-vector-"));
  roots.push(root);
  return join(root, "export");
}
const generation = { epoch: "723df323-96c2-40f3-a42a-bd6081ad6b42", revision: "1" };
function fixture(options: { drift?: boolean; wrongModel?: boolean } = {}): VectorSource {
  return {
    async generation() {
      return { ...generation, revision: options.drift ? "2" : "1" };
    },
    async snapshot(consume) {
      return consume({
        generation,
        count: 3,
        async *batches() {
          for (let i = 1; i <= 3; i++)
            yield [
              {
                id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
                model: options.wrongModel ? "wrong" : SHENRON_RAG_INDEX.model,
                embedding: Array.from({ length: 384 }, (_, j) => (j === i ? 1 : 0)),
              },
            ];
        },
      });
    },
  };
}
const digest = async (p: string) =>
  new Bun.CryptoHasher("sha256").update(await Bun.file(p).bytes()).digest("hex");
test.skipIf(process.platform === "win32")(
  "export pins generation and UUID mapping without source text and rejects overwrite",
  async () => {
    const dir = await target();
    const manifest = await exportVectorSidecar(fixture(), dir);
    expect(manifest.count).toBe(3);
    expect(manifest.activated).toBe(false);
    expect(Bun.file(join(dir, "vectors.f32")).size).toBe(3 * 384 * 4);
    const mapping = (await Bun.file(join(dir, "mapping.jsonl")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(mapping.map((x) => x.key)).toEqual(["1", "2", "3"]);
    expect(Object.keys(mapping[0]).toSorted()).toEqual(["documentId", "key"]);
    expect((await stat(join(dir, "vectors.f32"))).mode & 0o777).toBe(0o600);
    await expect(exportVectorSidecar(fixture(), dir)).rejects.toThrow();
    expect(await digest(join(dir, "vectors.f32"))).toBe(manifest.vectorsSha256);
  },
);
test("generation drift and wrong embedding space leave no export receipt or partial directory", async () => {
  for (const source of [fixture({ drift: true }), fixture({ wrongModel: true })]) {
    const dir = await target();
    await expect(exportVectorSidecar(source, dir)).rejects.toThrow();
    expect(await Bun.file(join(dir, "manifest.json")).exists()).toBe(false);
    await expect(stat(dir)).rejects.toThrow();
  }
});
test("changed pinned vector bytes are rejected before native allocation", async () => {
  const dir = await target();
  await exportVectorSidecar(fixture(), dir);
  const pin = await digest(join(dir, "manifest.json"));
  await Bun.write(join(dir, "vectors.f32"), new Uint8Array(3 * 384 * 4));
  let opened = false;
  const factory: VectorFactory = () => {
    opened = true;
    throw Error("unexpected native open");
  };
  await expect(buildVectorSidecar(fixture(), dir, pin, factory)).rejects.toThrow(
    "Vector export changed",
  );
  expect(opened).toBe(false);
});
test("build refuses stale generation before native allocation", async () => {
  const dir = await target();
  await exportVectorSidecar(fixture(), dir);
  let opened = false;
  const factory: VectorFactory = () => {
    opened = true;
    throw Error("unexpected native open");
  };
  await expect(
    buildVectorSidecar(
      fixture({ drift: true }),
      dir,
      await digest(join(dir, "manifest.json")),
      factory,
    ),
  ).rejects.toThrow("generation or space");
  expect(opened).toBe(false);
});
test.skipIf(!nativeVectorIndexAvailable())(
  "native index persists and verifies all exported vectors without activation",
  async () => {
    const dir = await target();
    await exportVectorSidecar(fixture(), dir);
    const receipt = await buildVectorSidecar(
      fixture(),
      dir,
      await digest(join(dir, "manifest.json")),
    );
    expect(receipt.count).toBe(3);
    expect(receipt.fullReadbackVerified).toBe(true);
    expect(receipt.activated).toBe(false);
    expect(await digest(join(dir, "index.bin"))).toBe(receipt.indexSha256);
  },
);

test("persisted UUID/key mismatch fails verification and never produces a build receipt", async () => {
  const dir = await target();
  await exportVectorSidecar(fixture(), dir);
  const values = new Map<bigint, Float32Array>();
  let opens = 0;
  const factory: VectorFactory = () => {
    opens++;
    return {
      get count() {
        return values.size;
      },
      add(key, value) {
        values.set(key, value);
      },
      search(query, _k, options) {
        const key = options?.allowedKeys?.[0];
        if (!key) throw Error("Exact UUID key filter missing");
        const value = values.get(opens > 1 && key === 1n ? 2n : key)!;
        return [{ key, score: -value.reduce((sum, x, i) => sum + (x - query[i]!) ** 2, 0) }];
      },
      save() {},
      close() {},
    };
  };
  await expect(
    buildVectorSidecar(fixture(), dir, await digest(join(dir, "manifest.json")), factory),
  ).rejects.toThrow("Native vector readback differs");
  expect(opens).toBe(2);
  expect(await Bun.file(join(dir, "build-receipt.json")).exists()).toBe(false);
  expect(await Bun.file(join(dir, "index.bin")).exists()).toBe(false);
});
