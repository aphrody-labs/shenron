// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { inspectStreamTracks, extractVideoFrame } from "../src/mediabunny-pipeline";

describe("mediabunny-pipeline", () => {
  const demoVideoPath = fileURLToPath(
    new URL("../../../vendor/mediabunny/test/public/demo.mp4", import.meta.url),
  );
  const multiAudioPath = fileURLToPath(
    new URL("../../../vendor/mediabunny/test/public/multiple-aac-tracks.mp4", import.meta.url),
  );

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
    expect(frame.timestampSeconds).toBe(2);
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(360);
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.data.byteLength).toBeGreaterThan(1024);
    const image = await new Bun.Image(frame.data).metadata();
    expect(image.format).toBe("webp");
    expect(image.width).toBe(frame.width);
    expect(image.height).toBe(frame.height);
    const decoded = await new Bun.Image(frame.data).resize(16, 9).png().bytes();
    expect([...decoded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("extractVideoFrame decodes frame at specified timestamp to jpeg", async () => {
    const frame = await extractVideoFrame(demoVideoPath, 1.5, { format: "jpeg" });

    expect(frame.format).toBe("jpeg");
    expect(frame.timestampSeconds).toBe(1.5);
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(360);
    expect(frame.data).toBeInstanceOf(Uint8Array);
    expect(frame.data.byteLength).toBeGreaterThan(1024);
    const image = await new Bun.Image(frame.data).metadata();
    expect(image.format).toBe("jpeg");
    expect(image.width).toBe(frame.width);
    expect(image.height).toBe(frame.height);
    const decoded = await new Bun.Image(frame.data).resize(16, 9).png().bytes();
    expect([...decoded.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("native resizing returns an actual decoded image at the requested dimensions", async () => {
    const frame = await extractVideoFrame(demoVideoPath, 1, { width: 160, height: 90 });
    const image = await new Bun.Image(frame.data).metadata();
    expect(frame.width).toBe(160);
    expect(frame.height).toBe(90);
    expect(image.width).toBe(160);
    expect(image.height).toBe(90);
    expect(frame.durationSeconds).toBeGreaterThan(0);
    expect(frame.durationSeconds).toBeLessThan(1);
  });

  test("single-dimension resizing preserves the video's aspect ratio", async () => {
    const frame = await extractVideoFrame(demoVideoPath, 1, { width: 160 });
    const image = await new Bun.Image(frame.data).metadata();
    expect(image.width).toBe(160);
    expect(image.height).toBe(90);
  });
});
