// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
  truncate,
  stat,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  stageOwnedFile,
  validateStageInput,
  verifyStageFormat,
  episodeSourceSha256,
  type StageInput,
} from "./stage-file";
import { digest } from "./cloudflare-ops";
import type { ObjectStore } from "./transfer";
const sample = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4]),
  sha = digest(sample);
const spec: StageInput = {
  input: "",
  sha256: sha,
  size: sample.length,
  contentType: "application/gzip",
  sourceSha256: episodeSourceSha256,
  kind: "media_archive",
  budget: { maxBytes: 128 * 1024 * 1024, timeoutMs: 300000 },
};
test("volume scope rejects other source identities and unsupported MIME or budgets", () => {
  expect(() => validateStageInput(spec)).not.toThrow();
  for (const patch of [
    { sourceSha256: "a".repeat(64) },
    { size: 0 },
    { size: 128 * 1024 * 1024 + 1 },
    { contentType: "text/html" },
    { kind: "official" },
    { budget: { maxBytes: 128 * 1024 * 1024 + 1, timeoutMs: 300000 } },
  ])
    expect(() => validateStageInput({ ...spec, ...patch } as StageInput)).toThrow();
  expect(() => verifyStageFormat(sample, "application/gzip")).not.toThrow();
  expect(() => verifyStageFormat(sample, "image/png")).toThrow();
});
async function fixture(existing: boolean) {
  const root = await mkdtemp(join(tmpdir(), "shenron-stage-test-")),
    window = join(root, "window"),
    receipts = join(root, "receipts");
  await mkdir(window, { mode: 0o700 });
  const input = join(window, "assets-0001.tar.gz");
  await writeFile(input, sample, { mode: 0o600 });
  let puts = 0,
    attests = 0;
  const store: ObjectStore = {
    async put() {
      puts++;
    },
    async attestStaged(key, entry, budget) {
      attests++;
      return {
        schema: "shenron-staged-cas-attestation/v1",
        qualifiedAt: new Date().toISOString(),
        key,
        sha256: entry.sha256,
        size: entry.size,
        metadataUpdated: false,
        actualGets: 2,
        budget: budget!,
        beforeEtag: '"etag"',
        afterEtag: '"etag"',
        beforeBodySha256: entry.sha256,
        afterBodySha256: entry.sha256,
        headMetadata: {
          sha256: entry.sha256,
          size: entry.size,
          contentType: entry.contentType,
          cacheControl: "public, max-age=31536000, immutable",
        },
        objectBytesUploaded: 0,
      };
    },
  };
  return {
    root,
    window,
    receipts,
    input,
    store,
    existing,
    puts: () => puts,
    attests: () => attests,
    async cleanup() {
      if (!resolve(root).startsWith(resolve(join(tmpdir(), "shenron-stage-test-"))))
        throw Error("Cleanup scope differs");
      await rm(root, { recursive: true, force: true });
    },
  };
}
test("existing CAS bypasses legacy PUT and deletes only after its owner receipt", async () => {
  const f = await fixture(true);
  try {
    const result = await stageOwnedFile(
      { ...spec, input: f.input },
      f.window,
      f.receipts,
      f.store,
      async () => true,
    );
    expect(f.puts()).toBe(0);
    expect(f.attests()).toBe(1);
    expect(result.objectBytesUploaded).toBe(0);
    await expect(access(f.input)).rejects.toThrow();
    const body = await readFile(result.receiptPath, "utf8"),
      receipt = JSON.parse(body);
    expect(digest(body)).toBe(result.receiptSha256);
    expect(receipt).toMatchObject({
      privateStagingOnly: true,
      official: false,
      reviewed: false,
      canonicalEligible: false,
      pointerMutations: 0,
      registryMutations: 0,
    });
  } finally {
    await f.cleanup();
  }
});
test("missing CAS uploads once and cannot retire its file on failed attestation", async () => {
  const f = await fixture(false);
  try {
    f.store.attestStaged = async () => {
      throw Error("GET failed");
    };
    await expect(
      stageOwnedFile({ ...spec, input: f.input }, f.window, f.receipts, f.store, async () => false),
    ).rejects.toThrow();
    expect(f.puts()).toBe(1);
    expect(await Bun.file(f.input).exists()).toBe(true);
  } finally {
    await f.cleanup();
  }
});
test("a third rolling volume is rejected before any object-store request", async () => {
  const f = await fixture(false);
  try {
    await writeFile(join(f.window, "assets-0002.tar.gz"), sample, { mode: 0o600 });
    await writeFile(join(f.window, "assets-0003.tar.gz"), sample, { mode: 0o600 });
    let probes = 0;
    await expect(
      stageOwnedFile({ ...spec, input: f.input }, f.window, f.receipts, f.store, async () => {
        probes++;
        return false;
      }),
    ).rejects.toThrow("Rolling window");
    expect(probes).toBe(0);
    expect(f.puts()).toBe(0);
  } finally {
    await f.cleanup();
  }
});
test("input changed after qualification keeps the durable receipt and file", async () => {
  const f = await fixture(true);
  try {
    const original = f.store.attestStaged;
    f.store.attestStaged = async (...args) => {
      const receipt = await original(...args);
      await writeFile(f.input, new Uint8Array(sample.length + 1));
      return receipt;
    };
    const result = await stageOwnedFile(
      { ...spec, input: f.input },
      f.window,
      f.receipts,
      f.store,
      async () => true,
    );
    expect(result.inputDeleted).toBe(false);
    expect(result.inputConflict).toBe(true);
    expect(await Bun.file(f.input).exists()).toBe(true);
    expect(await Bun.file(join(f.receipts, sha + ".json")).exists()).toBe(true);
  } finally {
    await f.cleanup();
  }
});

test("aggregate bytes include partial files and reject two oversized volumes", async () => {
  const f = await fixture(true);
  try {
    const part = join(f.window, "assets-0002.tar.gz.part");
    await writeFile(part, sample, { mode: 0o600 });
    await truncate(part, 128 * 1024 * 1024);
    await expect(
      stageOwnedFile({ ...spec, input: f.input }, f.window, f.receipts, f.store, async () => true),
    ).rejects.toThrow("byte budget");
    expect(f.attests()).toBe(0);
  } finally {
    await f.cleanup();
  }
});
test("same-sized rewritten input with restored timestamp is never deleted", async () => {
  const f = await fixture(true);
  try {
    const original = f.store.attestStaged;
    const info = await stat(f.input);
    f.store.attestStaged = async (...args) => {
      const result = await original(...args);
      await writeFile(f.input, new Uint8Array(sample.length));
      await utimes(f.input, info.atime, info.mtime);
      return result;
    };
    const result = await stageOwnedFile(
      { ...spec, input: f.input },
      f.window,
      f.receipts,
      f.store,
      async () => true,
    );
    expect(result.inputDeleted).toBe(false);
    expect(result.inputConflict).toBe(true);
    expect(await Bun.file(f.input).exists()).toBe(true);
    expect(await Bun.file(result.receiptPath).exists()).toBe(true);
  } finally {
    await f.cleanup();
  }
});
