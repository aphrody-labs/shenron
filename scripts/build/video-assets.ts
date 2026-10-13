// SPDX-License-Identifier: Apache-2.0
import { copyFileSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { getHlsPublicAssets } from "@aphrody/bun-video/hls";

type VideoAssets = Awaited<ReturnType<typeof getHlsPublicAssets>>;

/** Stage only the decoder owner's qualified same-origin worker and exact upstream license. */
export function stageVideoPublic(assets: VideoAssets, publicRoot: string) {
  const sources = [
    { path: assets.license, name: "LICENSE.txt", original: "LICENSE" },
    { path: assets.worker, name: "hls.worker.js", original: "hls.worker.js" },
  ];
  for (const source of sources) {
    const file = lstatSync(source.path);
    if (
      basename(source.path) !== source.original ||
      file.isSymbolicLink() ||
      !file.isFile() ||
      !file.size
    )
      throw new Error("The video owner's public asset is missing or unsafe");
  }
  const license = readFileSync(assets.license, "utf8");
  if (!license.includes("Apache License, Version 2.0") || !license.includes("2017 Dailymotion"))
    throw new Error("HLS Apache license or Dailymotion notice is missing");
  const output = join(publicRoot, "assets/bun-video");
  mkdirSync(output, { recursive: true });
  return sources.map(({ path, name }) => {
    const destination = join(output, name);
    copyFileSync(path, destination);
    return {
      name,
      sha256: new Bun.CryptoHasher("sha256").update(readFileSync(destination)).digest("hex"),
    };
  });
}
