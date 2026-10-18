// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { inspectStreamTracks, extractVideoFrame } from "../src/mediabunny-pipeline";

describe("mediabunny-pipeline", () => {
  const demoVideoPath = "vendor/mediabunny/test/public/demo.mp4";
  const multiAudioPath = "vendor/mediabunny/test/public/multiple-aac-tracks.mp4";

  test("inspectStreamTracks returns complete stream, track, and ladder metadata", async () => {
    const result = await inspectStreamTracks(demoVideoPath);

    expect(result.source).toBe(demoVideoPath);
    expect(result.format).toBe("Mp4InputFormat");
    expect(result.durationSeconds).toBe(5);

    expect(result.videoTracks.length).toBeGreaterThan(0);
    const video = result.videoTracks[0]!;
    expect(video.type).toBe("video");
    expect(video.codec).toBe("avc");
    expect(video.codecString).toMatch(/^avc1/);
    expect(video.width).toBe(640);
    expect(video.height).toBe(360);
    expect(video.durationSeconds).toBe(5);

    expect(result.audioTracks.length).toBeGreaterThan(0);
    const audio = result.audioTracks[0]!;
    expect(audio.type).toBe("audio");
    expect(audio.codec).toBe("aac");
    expect(audio.sampleRate).toBe(48000);

    expect(result.bitrateLadder.length).toBe(result.videoTracks.length);
    expect(result.bitrateLadder[0]!.width).toBe(640);
    expect(result.bitrateLadder[0]!.codec).toBe("avc");
  });

  test("inspectStreamTracks handles multiple audio tracks correctly", async () => {
    const result = await inspectStreamTracks(multiAudioPath);

    expect(result.audioTracks.length).toBe(2);
    expect(result.audioTracks[0]!.codec).toBe("aac");
    expect(result.audioTracks[1]!.codec).toBe("aac");
    expect(result.audioTracks[0]!.channels).toBe(6);
  });

  test("extractVideoFrame decodes frame at specified timestamp to webp", async () => {
    const frame = await extractVideoFrame(demoVideoPath, 2.0, { format: "webp" });

    expect(frame.format).toBe("webp");
    expect(frame.timestampSeconds).toBeGreaterThanOrEqual(0);
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(360);
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.data.byteLength).toBeGreaterThan(0);
  });

  test("extractVideoFrame decodes frame at specified timestamp to jpeg", async () => {
    const frame = await extractVideoFrame(demoVideoPath, 1.5, { format: "jpeg" });

    expect(frame.format).toBe("jpeg");
    expect(frame.timestampSeconds).toBeGreaterThanOrEqual(0);
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(360);
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.data.byteLength).toBeGreaterThan(0);
  });
});
