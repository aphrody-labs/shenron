// SPDX-License-Identifier: Apache-2.0
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryEpisodeDirectory, parseEpisodeSourceFiles } from "./source-directory";

test("inventories all sources and hashes their bytes without running saved scripts", async () => {
  const root = mkdtempSync(join(tmpdir(), "shenron-episode-sources-"));
  try {
    await Bun.write(join(root, "episode.mp4"), new Uint8Array([1, 2, 3]));
    await Bun.write(join(root, "page_files", "app.js"), "throw new Error('must never execute');");
    await Bun.write(join(root, "capture.har"), "{}");
    const result = await inventoryEpisodeDirectory(root);
    expect(result.files).toHaveLength(3);
    expect(result.files.find((f) => f.relativePath === "episode.mp4")).toMatchObject({
      bytes: 3,
      kind: "video",
      sha256: new Bun.CryptoHasher("sha256").update(new Uint8Array([1, 2, 3])).digest("hex"),
    });
    expect(parseEpisodeSourceFiles(result.files)).toEqual(result.files);
    expect(() =>
      parseEpisodeSourceFiles([{ ...result.files[0], relativePath: "../escape" }]),
    ).toThrow("Invalid episode source inventory");
    expect(() => parseEpisodeSourceFiles([{ ...result.files[0], sha256: "invalid" }])).toThrow(
      "Invalid episode source inventory",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
