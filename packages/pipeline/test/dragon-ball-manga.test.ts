// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  importDragonBallManga,
  isPromotionalPage,
  type MangaChapter,
} from "../src/dragon-ball/manga";
const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
test("manga dry run and idempotent volumes never invoke native acquisition or OCR", async () => {
  let calls = 0;
  const options = {
    nativeOutputDir: "/unused-native",
    publicAssetsDir: "/unused-public",
    nativeExecutor: async () => {
      calls++;
      throw new Error("forbidden");
    },
  };
  const port = {
    listVolumes: async () => [{ id: 42, number: 1 }],
    hasPages: async () => true,
    insertChapter: async () => {
      throw new Error("forbidden");
    },
  };
  expect((await importDragonBallManga(options, port)).planned).toBe(1);
  expect(
    (
      await importDragonBallManga(
        { ...options, dryRun: false, writeGate: { assertWritable() {} } },
        port,
      )
    ).reused,
  ).toBe(1);
  expect(calls).toBe(0);
});
test("promo review excludes editorial references while keeping native originals", async () => {
  const dir = await mkdtemp(join(tmpdir(), "shenron-native-manga-"));
  directories.push(dir);
  const native = join(dir, "native");
  const files = await Promise.all(
    ["promo", "story"].map(async (text, index) => {
      const path = join(
        native,
        `assets/manga/DB/regular/vol1/${String(index + 1).padStart(3, "0")}.webp`,
      );
      await Bun.write(path, text);
      return {
        url: `https://cdn.example.org/${index}.png`,
        path,
        source_path: path,
        bytes: text.length,
        sha256: new Bun.CryptoHasher("sha256").update(text).digest("hex"),
        source_sha256: "",
        width: 2,
        height: 2,
      };
    }),
  );
  const chapters: MangaChapter[] = [];
  const result = await importDragonBallManga(
    {
      nativeOutputDir: native,
      publicAssetsDir: join(dir, "public"),
      from: 1,
      to: 1,
      dryRun: false,
      checkPromotionalPages: true,
      writeGate: { assertWritable() {} },
      nativeExecutor: async () => ({
        code: 0,
        stdout: JSON.stringify({ completed: true, pending: 0, errors: [], files }),
        stderr: "",
      }),
      reviewPromotionalPage: async (asset) => ({
        text: asset.path.includes("001") ? "Sushiscan" : "Source story",
        meanConfidence: 0.99,
      }),
    },
    {
      listVolumes: async () => [{ id: 42, number: 1 }],
      hasPages: async () => false,
      insertChapter: async (chapter) => {
        chapters.push(chapter);
      },
    },
  );
  expect(result.excluded.length).toBe(1);
  expect(chapters[0]?.pages).toEqual(["./assets/manga/DB/regular/vol1/002.webp"]);
  expect(chapters[0]?.cover).toBe(chapters[0]?.pages[0]);
  expect(await Bun.file(files[0]!.path).text()).toBe("promo");
});
test("frozen execution invokes neither acquisition nor promotional OCR", async () => {
  let calls = 0;
  await expect(
    importDragonBallManga(
      {
        nativeOutputDir: "/unused",
        publicAssetsDir: "/unused",
        dryRun: false,
        nativeExecutor: async () => {
          calls++;
          throw new Error("forbidden");
        },
        checkPromotionalPages: true,
        reviewPromotionalPage: async () => {
          calls++;
          throw new Error("forbidden");
        },
      },
      {
        listVolumes: async () => [{ id: 1, number: 1 }],
        hasPages: async () => false,
        insertChapter: async () => {
          calls++;
        },
      },
    ),
  ).rejects.toThrow("gelées");
  expect(calls).toBe(0);
  expect(isPromotionalPage({ text: "sushiscan", meanConfidence: 0.5 })).toBe(false);
  expect(
    isPromotionalPage({ text: "lisez nos chapitres", meanConfidence: 0.99, suspect: true }),
  ).toBe(false);
});
