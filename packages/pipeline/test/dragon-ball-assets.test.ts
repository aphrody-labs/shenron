// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { importDragonBallCovers, type CoverAssetRecord } from "../src/dragon-ball/assets";
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp("/tmp/shenron-native-covers-");
  directories.push(dir);
  const native = join(dir, "native");
  const source = join(native, "original.png");
  const path = join(native, "cover.webp");
  await Bun.write(source, "original-source-bytes");
  await Bun.write(path, "converted-owner-bytes");
  const sha = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");
  const file = {
    url: "https://comic.dragonballcn.com/cover.png",
    path,
    source_path: source,
    bytes: 21,
    sha256: sha("converted-owner-bytes"),
    source_sha256: sha("original-source-bytes"),
    width: 2,
    height: 3,
  };
  const catalogue = join(dir, "catalogue.json");
  await Bun.write(
    catalogue,
    JSON.stringify({
      collections: [
        { slug: "edition", ouvrages: [{ did: "0-1", couverture: file.url, libelle: "One" }] },
      ],
    }),
  );
  return { dir, native, source, path, file, catalogue };
}
describe("native cover editorial import", () => {
  test("incomplete acquisition and existing editorial material never become successful imports", async () => {
    const f = await fixture();
    let writes = 0;
    const port = {
      exists: async () => false,
      register: async () => {
        writes++;
      },
    };
    const options = {
      cataloguePath: f.catalogue,
      nativeOutputDir: f.native,
      publicDbDir: join(f.dir, "public"),
      dryRun: false,
      writeGate: { assertWritable() {} },
    };
    await expect(
      importDragonBallCovers(
        {
          ...options,
          nativeExecutor: async () => ({
            code: 0,
            stdout: JSON.stringify({ completed: false, pending: 1, errors: [], files: [f.file] }),
            stderr: "",
          }),
        },
        port,
      ),
    ).rejects.toThrow("incomplete");
    const destination = join(f.dir, "public/dragonballcn/edition/0-1.png");
    await Bun.write(destination, "existing-reviewed-material");
    await expect(
      importDragonBallCovers(
        {
          ...options,
          nativeExecutor: async () => ({
            code: 0,
            stdout: JSON.stringify({ completed: true, pending: 0, errors: [], files: [f.file] }),
            stderr: "",
          }),
        },
        port,
      ),
    ).rejects.toThrow("differs");
    expect(await Bun.file(destination).text()).toBe("existing-reviewed-material");
    expect(writes).toBe(0);
  });
  test("dry run has no native acquisition or database writes", async () => {
    const f = await fixture();
    let calls = 0;
    const result = await importDragonBallCovers(
      {
        cataloguePath: f.catalogue,
        nativeOutputDir: f.native,
        publicDbDir: join(f.dir, "public"),
        nativeExecutor: async () => {
          calls++;
          throw new Error("forbidden");
        },
      },
      {
        exists: async () => false,
        register: async () => {
          throw new Error("forbidden");
        },
      },
    );
    expect(result).toEqual({ dryRun: true, planned: 1, imported: 0, reused: 0 });
    expect(calls).toBe(0);
  });
  test("verified original preserves legacy did extension and source metadata", async () => {
    const f = await fixture();
    const rows: CoverAssetRecord[] = [];
    let args: readonly string[] = [];
    const result = await importDragonBallCovers(
      {
        cataloguePath: f.catalogue,
        nativeOutputDir: f.native,
        publicDbDir: join(f.dir, "public"),
        dryRun: false,
        writeGate: { assertWritable() {} },
        nativeExecutor: async (value) => {
          args = value;
          return {
            code: 0,
            stdout: JSON.stringify({
              assets: { completed: true, pending: 0, errors: [], files: [f.file] },
            }),
            stderr: "",
          };
        },
      },
      {
        exists: async () => false,
        register: async (row) => {
          rows.push(row);
        },
      },
    );
    expect(args.slice(0, 3)).toEqual(["web", "dragon-ball", "assets"]);
    expect(result.imported).toBe(1);
    expect(await Bun.file(join(f.dir, "public/dragonballcn/edition/0-1.png")).text()).toBe(
      "original-source-bytes",
    );
    expect(rows[0]?.sha256).toBe(f.file.source_sha256);
    expect(rows[0]?.mime).toBe("image/png");
    expect(rows[0]?.bytes).toBe(21);
    expect(rows[0]?.width).toBe(2);
  });
  test("freeze and mismatched receipts stop before editorial registration", async () => {
    const f = await fixture();
    let calls = 0,
      writes = 0;
    const port = {
      exists: async () => false,
      register: async () => {
        writes++;
      },
    };
    const options = {
      cataloguePath: f.catalogue,
      nativeOutputDir: f.native,
      publicDbDir: join(f.dir, "public"),
      dryRun: false,
      nativeExecutor: async () => {
        calls++;
        return {
          code: 0,
          stdout: JSON.stringify({
            completed: true,
            pending: 0,
            errors: [],
            files: [{ ...f.file, source_sha256: "a".repeat(64) }],
          }),
          stderr: "",
        };
      },
    };
    await expect(importDragonBallCovers(options, port)).rejects.toThrow("gelées");
    expect(calls).toBe(0);
    await expect(
      importDragonBallCovers({ ...options, writeGate: { assertWritable() {} } }, port),
    ).rejects.toThrow("checksum mismatch");
    expect(writes).toBe(0);
  });
});
