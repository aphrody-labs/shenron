// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GIF_PREVIEW,
  HERO_FRAME_TIMECODES,
  PINNED_YT_DLP_VERSION,
  buildYtDlpArgs,
  computeBeerusFrameTimecodes,
  validateWebVttContent,
} from "../src/video-download";
import {
  IMMUTABLE_CACHE_CONTROL,
  buildManifestShards,
  buildRcloneR2Args,
  buildRsyncMeshArgs,
  r2ObjectKey,
  r2ShardId,
} from "../src/r2-sync";

describe("video-download pure helpers", () => {
  test("exposes pinned yt-dlp version and canonical hero/GIF constants", () => {
    expect(PINNED_YT_DLP_VERSION).toBe("2026.10.21");
    expect(HERO_FRAME_TIMECODES).toEqual([240, 600, 1115]);
    expect(DEFAULT_GIF_PREVIEW).toEqual({
      start: 600,
      duration: 2,
      fps: 12,
      width: 480,
    });
  });

  test("buildYtDlpArgs produces deterministic flags and validates https URLs", () => {
    const args = buildYtDlpArgs({
      url: "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/episode-1",
      outputTemplate: "/tmp/beerus/875/source.%(ext)s",
      cookiesFile: "/tmp/crunchyroll-cookies.txt",
      concurrentFragments: 12,
      writeSubs: true,
      subLangs: ["ja", "fr-FR"],
    });

    expect(args).toContain("--no-part");
    expect(args).toContain("--no-mtime");
    expect(args).toContain("--concurrent-fragments");
    expect(args[args.indexOf("--concurrent-fragments") + 1]).toBe("12");
    expect(args).toContain("--cookies");
    expect(args).toContain("--write-subs");
    expect(args).toContain("ja,fr-FR");
    expect(args.at(-1)).toBe("https://www.crunchyroll.com/fr/watch/GE00389313JAJP/episode-1");

    expect(() =>
      buildYtDlpArgs({
        url: "http://www.crunchyroll.com/fr/watch/GE00389313JAJP",
        outputTemplate: "/tmp/out.mp4",
      }),
    ).toThrow(/https:/i);

    expect(() =>
      buildYtDlpArgs({
        url: "https://user:pass@www.crunchyroll.com/fr/watch/GE00389313JAJP",
        outputTemplate: "/tmp/out.mp4",
      }),
    ).toThrow(/credentials/i);
  });

  test("validateWebVttContent validates WEBVTT header and cue timestamp ranges", () => {
    const validVtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:04.500",
      "Le dieu de la destruction s'eveille.",
      "",
      "2",
      "00:00:05.000 --> 00:00:08.250 align:middle",
      "Beerus entre en scene.",
    ].join("\n");

    const validResult = validateWebVttContent(validVtt);
    expect(validResult.valid).toBe(true);
    expect(validResult.cueCount).toBe(2);
    expect(validResult.errors).toHaveLength(0);

    const invalidHeader = validateWebVttContent("SRT\n00:00:01.000 --> 00:00:02.000\nTexte");
    expect(invalidHeader.valid).toBe(false);
    expect(invalidHeader.errors[0]).toMatch(/WEBVTT header/);

    const reversedCue = validateWebVttContent("WEBVTT\n\n00:00:05.000 --> 00:00:02.000\nTexte");
    expect(reversedCue.valid).toBe(false);
    expect(reversedCue.errors[0]).toMatch(/greater than start/);
  });

  test("computeBeerusFrameTimecodes generates 41 bounded scene timestamps", () => {
    const timecodes = computeBeerusFrameTimecodes(1420);
    expect(timecodes).toHaveLength(41);
    expect(timecodes[0]).toBe(48.579);
    expect(timecodes[1]).toBe(81.079);
    expect(timecodes[40]).toBe(1348.579);
    expect(timecodes.every((tc) => tc <= 1415)).toBe(true);

    const shortEpisode = computeBeerusFrameTimecodes(200, 10, 48.579, 32.5);
    expect(shortEpisode).toHaveLength(10);
    expect(shortEpisode.at(-1)).toBe(195);
  });
});

describe("r2-sync pure helpers", () => {
  const sampleShaA = "a".repeat(64);
  const sampleShaB = "b".repeat(64);
  const sampleShaC = "c".repeat(64);

  test("r2ObjectKey and r2ShardId compute content-addressed keys and 2-hex-char shards", () => {
    expect(r2ObjectKey(sampleShaA)).toBe(`_objects/${sampleShaA}`);
    expect(() => r2ObjectKey("invalid-sha")).toThrow(/Invalid SHA-256/);

    const shard = r2ShardId(`/media/episodes/875/${sampleShaA}/source.mp4`);
    expect(shard).toMatch(/^[a-f0-9]{2}$/);
    expect(() => r2ShardId("/private/secret.txt")).toThrow(/Invalid CDN pathname/);
  });

  test("buildManifestShards groups entries by shard and union-merges with existing shard records", () => {
    const path875 = `/media/episodes/875/${sampleShaA}/source.mp4`;
    const path876 = `/media/episodes/876/${sampleShaB}/source.mp4`;
    const pathSub = "/assets/subtitles/dbs-beerus/875.fr.vtt";

    const firstShards = buildManifestShards([
      {
        path: path875,
        sha256: sampleShaA,
        bytes: 412_000_000,
        contentType: "video/mp4",
      },
    ]);

    const mergedShards = buildManifestShards(
      [
        {
          path: path876,
          sha256: sampleShaB,
          bytes: 398_000_000,
          contentType: "video/mp4",
        },
        {
          path: pathSub,
          sha256: sampleShaC,
          bytes: 28_400,
          contentType: "text/vtt; charset=utf-8",
        },
      ],
      firstShards,
    );

    const shard875 = r2ShardId(path875);
    const shard876 = r2ShardId(path876);
    const shardSub = r2ShardId(pathSub);

    expect(mergedShards.get(shard875)?.[path875]).toEqual({
      sha256: sampleShaA,
      bytes: 412_000_000,
      size: 412_000_000,
      contentType: "video/mp4",
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    expect(mergedShards.get(shard876)?.[path876]?.sha256).toBe(sampleShaB);
    expect(mergedShards.get(shardSub)?.[pathSub]?.contentType).toBe("text/vtt; charset=utf-8");
  });

  test("buildRcloneR2Args and buildRsyncMeshArgs build best-practice transfer flags", () => {
    const rcloneArgs = buildRcloneR2Args({
      source: "/srv/shenron/staging/_objects",
      bucket: "shenron-cdn/_objects",
    });
    expect(rcloneArgs).toContain("copy");
    expect(rcloneArgs).toContain("r2:shenron-cdn/_objects");
    expect(rcloneArgs).toContain("--s3-upload-concurrency");
    expect(rcloneArgs).toContain("--s3-chunk-size");
    expect(rcloneArgs).toContain("64M");
    expect(rcloneArgs).toContain("--s3-no-check-bucket");
    expect(rcloneArgs).toContain("--fast-list");
    expect(rcloneArgs).toContain("--checksum");
    expect(rcloneArgs).toContain(`Cache-Control: ${IMMUTABLE_CACHE_CONTROL}`);

    const rsyncArgs = buildRsyncMeshArgs({
      source: "/srv/shenron/staging/",
      destination: "cdn:/srv/shenron/r2-mirror/",
    });
    expect(rsyncArgs).toContain("-aH");
    expect(rsyncArgs).toContain("--partial");
    expect(rsyncArgs).toContain("--inplace");
    expect(rsyncArgs).toContain("--compress-choice=zstd");
    expect(rsyncArgs).toContain("--compress-level=3");
    expect(rsyncArgs).toContain("--info=progress2");
  });
});
