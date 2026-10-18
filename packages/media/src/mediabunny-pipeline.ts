// SPDX-License-Identifier: Apache-2.0
import { Input, ALL_FORMATS, FilePathSource, UrlSource, CanvasSink } from "mediabunny";

// Published Bun declarations predate this qualified native runtime surface.
interface NativeVideo {
  frame(seconds: number): NativeVideo;
  resize(width: number, height: number): NativeVideo;
  jpeg(options: { quality: number }): NativeVideo;
  webp(options: { quality: number }): NativeVideo;
  bytes(): Promise<Uint8Array>;
  metadata(): Promise<{ fpsNumerator: number; fpsDenominator: number }>;
}
type NativeVideoConstructor = { new (source: string): NativeVideo; readonly available: boolean };
const Video =
  typeof Bun === "undefined"
    ? undefined
    : (Bun as typeof Bun & { Video?: NativeVideoConstructor }).Video;

export interface StreamTrackInfo {
  id: number;
  type: "video" | "audio" | "subtitle" | "unknown";
  codec: string | null;
  codecString: string | null;
  language: string | null;
  name: string | null;
  durationSeconds: number | null;
  bitrate: number | null;
  width?: number;
  height?: number;
  codedWidth?: number;
  codedHeight?: number;
  channels?: number;
  sampleRate?: number;
}

export interface StreamInspectionResult {
  source: string;
  format: string | null;
  durationSeconds: number | null;
  videoTracks: StreamTrackInfo[];
  audioTracks: StreamTrackInfo[];
  bitrateLadder: Array<{
    trackId: number;
    bitrate: number | null;
    width?: number;
    height?: number;
    codec: string | null;
    codecString: string | null;
  }>;
}

export interface ExtractedFrame {
  timestampSeconds: number;
  durationSeconds: number;
  width: number;
  height: number;
  format: "webp" | "jpeg";
  data: Uint8Array;
}

function resolveSource(source: string) {
  if (/^https?:\/\//i.test(source)) {
    return new UrlSource(source);
  }
  return new FilePathSource(source);
}

export async function inspectStreamTracks(url: string): Promise<StreamInspectionResult> {
  const source = resolveSource(url);
  const input = new Input({ source, formats: ALL_FORMATS });

  try {
    const formatObj = await input.getFormat().catch(() => null);
    const formatName = formatObj?.constructor?.name ?? null;
    const duration = await input.computeDuration().catch(() => null);

    const videoTracks = await input.getVideoTracks();
    const audioTracks = await input.getAudioTracks();

    const inspectedVideo: StreamTrackInfo[] = [];
    for (const track of videoTracks) {
      const codec = await track.getCodec().catch(() => null);
      const codecString = (await track.getCodecParameterString?.().catch(() => null)) ?? null;
      const bitrate =
        (await track.getBitrate?.().catch(() => null)) ??
        (await track.getAverageBitrate?.().catch(() => null)) ??
        null;
      const trackDuration = (await track.computeDuration?.().catch(() => null)) ?? null;
      const codedWidth = await track.getCodedWidth?.().catch(() => null);
      const codedHeight = await track.getCodedHeight?.().catch(() => null);

      inspectedVideo.push({
        id: track.id,
        type: "video",
        codec: codec ?? null,
        codecString,
        language: track.languageCode ?? null,
        name: track.name ?? null,
        durationSeconds: trackDuration,
        bitrate: bitrate ?? null,
        width: track.displayWidth,
        height: track.displayHeight,
        codedWidth: codedWidth ?? undefined,
        codedHeight: codedHeight ?? undefined,
      });
    }

    const inspectedAudio: StreamTrackInfo[] = [];
    for (const track of audioTracks) {
      const codec = await track.getCodec().catch(() => null);
      const codecString = (await track.getCodecParameterString?.().catch(() => null)) ?? null;
      const bitrate =
        (await track.getBitrate?.().catch(() => null)) ??
        (await track.getAverageBitrate?.().catch(() => null)) ??
        null;
      const trackDuration = (await track.computeDuration?.().catch(() => null)) ?? null;

      inspectedAudio.push({
        id: track.id,
        type: "audio",
        codec: codec ?? null,
        codecString,
        language: track.languageCode ?? null,
        name: track.name ?? null,
        durationSeconds: trackDuration,
        bitrate: bitrate ?? null,
        channels: track.numberOfChannels,
        sampleRate: track.sampleRate,
      });
    }

    const bitrateLadder = inspectedVideo.map((v) => ({
      trackId: v.id,
      bitrate: v.bitrate,
      width: v.width,
      height: v.height,
      codec: v.codec,
      codecString: v.codecString,
    }));

    return {
      source: url,
      format: formatName,
      durationSeconds: duration,
      videoTracks: inspectedVideo,
      audioTracks: inspectedAudio,
      bitrateLadder,
    };
  } finally {
    input.dispose();
  }
}

export async function extractVideoFrame(
  source: string,
  timestampSeconds: number,
  options: { format?: "webp" | "jpeg"; quality?: number; width?: number; height?: number } = {},
): Promise<ExtractedFrame> {
  const chosenFormat = options.format ?? "webp";
  const quality = options.quality ?? 0.8;
  const inputSource = resolveSource(source);
  const input = new Input({ source: inputSource, formats: ALL_FORMATS });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error(`No video track found in source: ${source}`);
    }

    const sourceWidth = await videoTrack.getDisplayWidth();
    const sourceHeight = await videoTrack.getDisplayHeight();
    const width =
      options.width ??
      (options.height ? Math.round((sourceWidth * options.height) / sourceHeight) : sourceWidth);
    const height =
      options.height ??
      (options.width ? Math.round((sourceHeight * options.width) / sourceWidth) : sourceHeight);

    // In browser or environments with Canvas / OffscreenCanvas:
    if (typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined") {
      const sinkOptions: { width?: number; height?: number } = {};
      if (options.width) sinkOptions.width = options.width;
      if (options.height) sinkOptions.height = options.height;

      const sink = new CanvasSink(videoTrack, sinkOptions);
      const wrapped = await sink.getCanvas(timestampSeconds);
      if (!wrapped) {
        throw new Error(`Could not decode frame at timestamp ${timestampSeconds}s`);
      }

      const canvas = wrapped.canvas;
      let buffer: Uint8Array;
      const mimeType = chosenFormat === "jpeg" ? "image/jpeg" : "image/webp";

      if ("convertToBlob" in canvas && typeof canvas.convertToBlob === "function") {
        const blob = await canvas.convertToBlob({ type: mimeType, quality });
        buffer = new Uint8Array(await blob.arrayBuffer());
      } else if (
        "toDataURL" in canvas &&
        typeof (canvas as HTMLCanvasElement).toDataURL === "function"
      ) {
        const dataUrl = (canvas as HTMLCanvasElement).toDataURL(mimeType, quality);
        const base64 = dataUrl.split(",")[1];
        buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      } else {
        throw new Error("Canvas does not support convertToBlob or toDataURL");
      }

      return {
        timestampSeconds: wrapped.timestamp,
        durationSeconds: wrapped.duration,
        width: canvas.width,
        height: canvas.height,
        format: chosenFormat,
        data: buffer,
      };
    }

    // Server decoding uses the native owner; encoded packets alone are not images.
    if (!Video?.available) throw new Error("Native video decoding is unavailable");
    const video = new Video(source);
    const frame = video.frame(timestampSeconds);
    if (options.width || options.height) frame.resize(width, height);
    const encoding = { quality: Math.round(quality * 100) };
    const data = await (
      chosenFormat === "jpeg" ? frame.jpeg(encoding) : frame.webp(encoding)
    ).bytes();
    const image = await new Bun.Image(data).metadata();
    const metadata = await video.metadata();
    return {
      timestampSeconds,
      durationSeconds: metadata.fpsDenominator / metadata.fpsNumerator,
      width: image.width,
      height: image.height,
      format: chosenFormat,
      data,
    };
  } finally {
    input.dispose();
  }
}
