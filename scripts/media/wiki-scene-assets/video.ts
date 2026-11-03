// SPDX-License-Identifier: Apache-2.0
/** Native provider adapter; decoding remains owned by Bun.Video, not by this CLI. */
export type VideoMetadata = {
  width: number;
  height: number;
  duration: number | null;
  fpsNumerator: number;
  fpsDenominator: number;
  frameCount: number;
  codec?: string;
};
interface NativeVideo {
  metadata(): Promise<VideoMetadata>;
  frames(options: {
    start: number;
    end: number;
    step: number;
    maxFrames: number;
  }): Promise<{ time: number; bytes: Uint8Array }[]>;
}
type VideoConstructor = { new (path: string): NativeVideo; readonly available: boolean };
export function nativeVideo(path: string): NativeVideo {
  const Video = (Bun as typeof Bun & { Video?: VideoConstructor }).Video;
  if (!Video?.available) throw new Error("Qualified native Bun.Video provider required");
  return new Video(path);
}
export function validateVideoTime(metadata: VideoMetadata, seconds: number) {
  const fps = metadata.fpsNumerator / metadata.fpsDenominator;
  if (
    !metadata.duration ||
    !Number.isFinite(metadata.duration) ||
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 240 ||
    !Number.isSafeInteger(metadata.frameCount) ||
    metadata.frameCount < 1 ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds >= metadata.duration
  )
    throw new Error("Invalid video metadata or requested time");
  return fps;
}
export async function extractNativeFrame(
  video: NativeVideo,
  metadata: VideoMetadata,
  seconds: number,
) {
  const fps = validateVideoTime(metadata, seconds);
  // One source-resolution frame, sequentially; native bounds remain 64 MiB/batch.
  const frames = await video.frames({
    start: seconds,
    end: Math.min(metadata.duration!, seconds + 1 / fps),
    step: 1 / fps,
    maxFrames: 1,
  });
  const frame = frames[0];
  if (
    frames.length !== 1 ||
    !frame ||
    !Number.isFinite(frame.time) ||
    frame.time < 0 ||
    frame.time >= metadata.duration! ||
    Math.abs(frame.time - seconds) > 1 / fps + 0.001 ||
    frame.bytes.length < 1 ||
    frame.bytes.length > 64 * 1024 ** 2
  )
    throw new Error("Invalid native frame or reported time");
  const image = await new Bun.Image(frame.bytes, { maxPixels: 16_000_000 }).metadata();
  if (image.width !== metadata.width || image.height !== metadata.height)
    throw new Error("Native frame dimensions differ from video");
  return frame;
}
