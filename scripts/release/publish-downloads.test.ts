// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, publish } from "./publish-downloads";

test("classify maps build outputs to platform and kind", () => {
  expect(classify("shenron-server-windows-x64.exe")).toEqual({
    os: "windows",
    arch: "x64",
    kind: "server",
  });
  expect(classify("shenron-bot-linux-x64.tar.gz")).toEqual({
    os: "linux",
    arch: "x64",
    kind: "bot",
  });
  expect(classify("Shenron-Studio-Setup.exe")?.kind).toBe("studio");
  expect(classify("Shenron-Studio_1.3.0_amd64.AppImage")).toEqual({
    os: "linux",
    arch: "x64",
    kind: "studio",
  });
  expect(classify("SHA256SUMS")).toBeNull();
  expect(classify("notes.txt")).toBeNull();
});

test("publish keeps exactly one release and writes the manifest last", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pub-"));
  const out = join(dir, "out");
  const src = join(dir, "src");
  try {
    await Bun.$`mkdir -p ${src}`.quiet();
    await writeFile(join(src, "shenron-server-linux-x64"), "a");
    await writeFile(join(src, "shenron-bot-windows-x64.zip"), "bb");
    await publish(out, "1.0.0", [src]);
    await rm(join(src, "shenron-bot-windows-x64.zip"));
    await publish(out, "1.0.1", [src]);
    expect((await readdir(out)).toSorted()).toEqual([
      "SHA256SUMS",
      "latest.json",
      "shenron-server-linux-x64",
    ]);
    const manifest = JSON.parse(await readFile(join(out, "latest.json"), "utf8"));
    expect(manifest.version).toBe("1.0.1");
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
