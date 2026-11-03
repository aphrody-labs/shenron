// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { validateVideoTime } from "./video";
import { validateManifest } from "./index";
import { prepareEpisode } from "./prepare-episode";

test("video timing validation rejects non-finite and out-of-duration requests without decoding", () => {
  const metadata = {
    width: 1920,
    height: 1080,
    duration: 1397.688,
    fpsNumerator: 24000,
    fpsDenominator: 1001,
    frameCount: 33511,
  };
  expect(validateVideoTime(metadata, 120)).toBeCloseTo(23.976, 3);
  for (const time of [-1, 1397.688, Infinity, NaN])
    expect(() => validateVideoTime(metadata, time)).toThrow("Invalid video metadata");
  expect(() => validateVideoTime({ ...metadata, fpsDenominator: 0 }, 1)).toThrow(
    "Invalid video metadata",
  );
  expect(() => validateVideoTime({ ...metadata, frameCount: NaN }, 1)).toThrow(
    "Invalid video metadata",
  );
});
test("video recipe separates requested time from decoder evidence and budgets source frames", () => {
  const source = {
    id: "video",
    path: "actual.mp4",
    sha256: "0".repeat(64),
    width: 4000,
    height: 4000,
    video: { requestedTimeSec: 120 },
    provenance: {
      kind: "official",
      referenceUrl: "https://example.com/episode",
      note: "Validation only, no media generated",
      episodeId: 875,
    },
  };
  const manifest = {
    schema: "shenron-wiki-scene-assets/v1",
    sources: [source],
    crops: [
      {
        id: "crop",
        sourceId: "video",
        rect: { left: 0, top: 0, width: 4000, height: 4000 },
        usage: ["background"],
      },
    ],
    sheets: [],
  };
  expect(validateManifest(manifest).sources[0]!.video!.requestedTimeSec).toBe(120);
  expect(() =>
    validateManifest({
      ...manifest,
      sources: [{ ...source, provenance: { ...source.provenance, reportedTimeSec: 120 } }],
    }),
  ).toThrow("must come from the native decoder");
  expect(() =>
    validateManifest({
      ...manifest,
      sheets: [{ id: "atlas", items: ["crop"], columns: 1, padding: 0 }],
    }),
  ).toThrow("Prepared output aggregate pixel limit");
});
test("episode preparation reuses owner admission and refuses foreign URLs before acquisition", async () => {
  await expect(
    prepareEpisode(875, new URL("https://foreign.example/source.mp4"), "unused", "unused", [120]),
  ).rejects.toThrow("Invalid published episode source");
  const url = new URL(
    "https://cdn.dragonballfr.com/media/episodes/875/db6b365d58a933a18176ffd848b23d79513acb899acf7b4a07bd35203949508e/source.mp4",
  );
  await expect(prepareEpisode(875, url, "unused", "unused", [NaN])).rejects.toThrow(
    "Invalid published episode source",
  );
});
