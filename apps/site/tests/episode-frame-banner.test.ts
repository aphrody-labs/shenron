// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { canonicalFrameUrl, selectEpisodeFrameBanner } from "../src/lib/episode-frame-banner";
const url = "https://cdn.dragonballfr.com/assets/ext/db_episodes_frames/1/scene.png";
const frame = {
  source: "ffmpeg" as const,
  sourceId: "ffmpeg:db:1:20",
  sourceUrl: null,
  episodeNumber: 1,
  imagePath: url,
  timecodeSec: 20,
  width: 1920,
  height: 1080,
  characterNames: [],
  tags: [],
  caption: null,
  isNotable: true,
  sortOrder: 0,
};
const row = { series: "DB", number_in_series: 1, frames: [frame] };
test("only canonical frame namespaces on the owned CDN are eligible", () => {
  expect(canonicalFrameUrl("./assets/ext/db_episodes_frames/1/scene.png")).toBe(url);
  for (const path of [
    "https://cdn.dragonballfr.com/wiki/xenoverse.png",
    "https://foreign.test/assets/ext/db_episodes_frames/1/scene.png",
    url + "?token=secret",
    url.replace("https:", "http:"),
    "https://user@cdn.dragonballfr.com/assets/ext/db_episodes_frames/1/scene.png",
  ])
    expect(canonicalFrameUrl(path)).toBeNull();
});
test("measured dimensions override misleading stored HD metadata", async () => {
  expect(
    await selectEpisodeFrameBanner([row], {}, async () => ({
      width: 320,
      height: 180,
      format: "png",
    })),
  ).toBe("");
  expect(
    await selectEpisodeFrameBanner([row], {}, async () => ({
      width: 1280,
      height: 720,
      format: "png",
    })),
  ).toBe(url);
});
test("a DB series or saga cannot take unrelated Beerus imagery", async () => {
  const beerus = { ...row, series: "DBS_BEERUS" };
  expect(
    await selectEpisodeFrameBanner([beerus], { series: "DB" }, async () => ({
      width: 1920,
      height: 1080,
      format: "png",
    })),
  ).toBe("");
  expect(
    await selectEpisodeFrameBanner(
      [row],
      { series: "DB", episodeStart: 2, episodeEnd: 10 },
      async () => ({ width: 1920, height: 1080, format: "png" }),
    ),
  ).toBe("");
});
test("missing frames and public probe failures yield typography", async () => {
  expect(await selectEpisodeFrameBanner([{ ...row, frames: null }])).toBe("");
  expect(
    await selectEpisodeFrameBanner([row], {}, async () => {
      throw Error("offline");
    }),
  ).toBe("");
});
test("candidate probes are bounded and duplicate URLs are measured once", async () => {
  let probes = 0;
  const frames = Array.from({ length: 12 }, (_, i) => ({
    ...frame,
    imagePath: url.replace("scene", `scene-${i}`),
  }));
  expect(
    await selectEpisodeFrameBanner([{ ...row, frames }], {}, async () => {
      probes++;
      return null;
    }),
  ).toBe("");
  expect(probes).toBe(4);
  probes = 0;
  await selectEpisodeFrameBanner([{ ...row, frames: [frame, frame] }], {}, async () => {
    probes++;
    return null;
  });
  expect(probes).toBe(1);
});
