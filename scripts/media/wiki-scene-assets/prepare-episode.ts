#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { mkdir, rename } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  downloadEpisodeVideoSource,
  episodeTimelineSource,
} from "../../../apps/site/src/lib/episode-video-generation";
import { validateManifest } from "./index";
import { nativeVideo, validateVideoTime } from "./video";

/** Reuse the editorial owner's admission, bounded acquisition and source integrity. */
export async function prepareEpisode(
  id: number,
  url: URL,
  cacheDirectory: string,
  manifestPath: string,
  times: number[],
) {
  const admitted = episodeTimelineSource(id, [{ embedUrl: url.href }]);
  if (
    !admitted ||
    !times.length ||
    times.length > 8 ||
    times.some((time) => !Number.isFinite(time) || time < 0)
  )
    throw new Error("Invalid published episode source or frame count");
  const destination = resolve(manifestPath);
  if (await Bun.file(destination).exists())
    throw new Error("Manifest already exists; choose a new file");
  const hash = admitted.pathname.split("/")[4]!;
  const path = await downloadEpisodeVideoSource(admitted, id, hash, fetch, resolve(cacheDirectory));
  const metadata = await nativeVideo(path).metadata();
  for (const time of times) validateVideoTime(metadata, time);
  const names = times.map((_, index) => `episode-${id}-frame-${index + 1}`);
  const manifest = validateManifest({
    schema: "shenron-wiki-scene-assets/v1",
    sources: times.map((requestedTimeSec, index) => ({
      id: names[index],
      path: relative(dirname(destination), path).replaceAll("\\", "/"),
      sha256: hash,
      width: metadata.width,
      height: metadata.height,
      video: { requestedTimeSec },
      provenance: {
        kind: "official",
        referenceUrl: admitted.href,
        episodeId: id,
        note: "Source du catalogue propriétaire admise et vérifiée par episode-video-generation ; origine animation, pas de licence ouverte implicite. Le receipt conserve le temps décodé natif.",
      },
    })),
    crops: names.map((name) => ({
      id: `${name}-background`,
      sourceId: name,
      rect: { left: 0, top: 0, width: metadata.width, height: metadata.height },
      usage: ["background", "wallpaper"],
    })),
    sheets: [
      {
        id: `episode-${id}-atlas`,
        items: names.map((name) => `${name}-background`),
        columns: 2,
        padding: 2,
      },
    ],
  });
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await Bun.write(temporary, JSON.stringify(manifest, null, 2) + "\n");
    await rename(temporary, destination);
  } finally {
    await Bun.file(temporary)
      .delete()
      .catch(() => {});
  }
  return {
    manifestPath: destination,
    sourcePath: path,
    sha256: hash,
    metadata,
    requestedTimes: times,
  };
}
if (import.meta.main) {
  const [id, url, cache, manifest, ...times] = process.argv.slice(2);
  if (!id || !url || !cache || !manifest || !/^\d+$/.test(id) || !times.length) {
    console.error(
      "Usage: bun scripts/media/wiki-scene-assets/prepare-episode.ts <episode-id> <published-source-url> <cache-directory> <new-manifest.json> <seconds...>",
    );
    process.exitCode = 2;
  } else
    try {
      console.log(
        JSON.stringify(
          await prepareEpisode(Number(id), new URL(url), cache, manifest, times.map(Number)),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
}
