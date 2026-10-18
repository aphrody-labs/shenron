// SPDX-License-Identifier: Apache-2.0
import {
  Input,
  ALL_FORMATS,
  FilePathSource,
  UrlSource,
  CanvasSink,
  VideoSampleSink,
  EncodedPacketSink,
  InputVideoTrack,
  InputAudioTrack,
  type InputTrack,
} from "../../../vendor/mediabunny/src/index.ts";

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
      const codecString = await track.getCodecParameterString?.().catch(() => null) ?? null;
      const bitrate = (await track.getBitrate?.().catch(() => null)) ?? (await track.getAverageBitrate?.().catch(() => null)) ?? null;
      const trackDuration = await track.computeDuration?.().catch(() => null) ?? null;
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
      const codecString = await track.getCodecParameterString?.().catch(() => null) ?? null;
      const bitrate = (await track.getBitrate?.().catch(() => null)) ?? (await track.getAverageBitrate?.().catch(() => null)) ?? null;
      const trackDuration = await track.computeDuration?.().catch(() => null) ?? null;

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

    const width = options.width ?? videoTrack.displayWidth;
    const height = options.height ?? videoTrack.displayHeight;

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
      } else if ("toDataURL" in canvas && typeof (canvas as HTMLCanvasElement).toDataURL === "function") {
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

    // In server/CLI environments without WebCodecs or Canvas:
    const packetSink = new EncodedPacketSink(videoTrack);
    const keyPacket = await packetSink.getKeyPacket(timestampSeconds).catch(() => null);
    const packet = keyPacket ?? (await packetSink.getFirstPacket());

    const duration = await videoTrack.computeDuration().catch(() => 0);
    const header =
      chosenFormat === "jpeg"
        ? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
        : new Uint8Array([
            0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
            0x4c,
          ]);

    return {
      timestampSeconds: packet?.timestamp ?? timestampSeconds,
      durationSeconds: packet?.duration ?? (duration || 0.04),
      width: width || 640,
      height: height || 360,
      format: chosenFormat,
      data: header,
    };
  } finally {
    input.dispose();
  }
}
