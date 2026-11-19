// SPDX-License-Identifier: Apache-2.0
/**
 * HLS ladder settings as ffmpeg arguments: CMAF (fMP4) segments shared by an H.264 rung set
 * and an optional AV1 rung set, GOP equal to the segment length, AAC-LC audio.
 *
 * Starting values: H.264 keeps the settings of crates/shenron-tv/src/ingest.rs (veryfast, crf 23,
 * per-height maxrate). AV1 values (libsvtav1 preset 6, crf 32) are untested starting points to be
 * benchmarked on fr2; the player must probe MediaCapabilities before choosing the AV1 rung.
 */
export type LadderCodec = "h264" | "av1";

export const SEGMENT_SECONDS = 6;
export const LADDER_HEIGHTS = [1080, 720, 480, 360] as const;
export const AUDIO_BITRATE_KBPS = 128;

export interface Rung {
  height: number;
  maxrateKbps: number;
  bufsizeKbps: number;
}

/** Per-height caps of the H.264 ladder (same as ingest.rs). */
const H264_CAPS: Record<number, Rung> = {
  1080: { height: 1080, maxrateKbps: 5000, bufsizeKbps: 10000 },
  720: { height: 720, maxrateKbps: 2800, bufsizeKbps: 5600 },
  480: { height: 480, maxrateKbps: 1400, bufsizeKbps: 2800 },
  360: { height: 360, maxrateKbps: 800, bufsizeKbps: 1600 },
};

/** AV1 targets about 60% of the H.264 caps; flat-colour anime is the case it is meant for. */
const AV1_SCALE = 0.6;

export const CODEC_SETTINGS = {
  h264: { encoder: "libx264", preset: "veryfast", crf: 23, pixFmt: "yuv420p" },
  av1: { encoder: "libsvtav1", preset: "6", crf: 32, pixFmt: "yuv420p" },
} as const satisfies Record<LadderCodec, object>;

/** Renditions at or below the source height; the lowest one is always kept. */
export function ladderHeights(sourceHeight: number): number[] {
  const heights = LADDER_HEIGHTS.filter((height) => height <= sourceHeight);
  return heights.length ? [...heights] : [LADDER_HEIGHTS[LADDER_HEIGHTS.length - 1]!];
}

export function rungFor(codec: LadderCodec, height: number): Rung {
  const cap = H264_CAPS[height] ?? H264_CAPS[360]!;
  if (codec === "h264") return { ...cap, height };
  return {
    height,
    maxrateKbps: Math.round(cap.maxrateKbps * AV1_SCALE),
    bufsizeKbps: Math.round(cap.bufsizeKbps * AV1_SCALE),
  };
}

export interface LadderInput {
  input: string;
  outDir: string;
  sourceHeight: number;
  /** Source frame rate; the GOP is `round(fps * SEGMENT_SECONDS)` frames. */
  fps: number;
  hasAudio: boolean;
  codecs?: readonly LadderCodec[];
  threads?: number;
}

export interface LadderPlan {
  args: string[];
  /** `-var_stream_map` value, one entry per rendition. */
  streams: { codec: LadderCodec; height: number; name: string }[];
}

/** GOP length in frames: one keyframe per segment so every segment starts on an IDR/key frame. */
export function gopFrames(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError(`invalid fps ${fps}`);
  return Math.round(fps * SEGMENT_SECONDS);
}

export function buildCmafLadder(input: LadderInput): LadderPlan {
  const codecs = input.codecs?.length ? input.codecs : (["h264"] as const);
  const heights = ladderHeights(input.sourceHeight);
  const gop = gopFrames(input.fps);
  const streams = codecs.flatMap((codec) =>
    heights.map((height) => ({ codec, height, name: `${codec}_${height}p` })),
  );
  const count = streams.length;
  const split = streams.map((_, i) => `[s${i}]`).join("");
  const scales = streams.map((s, i) => `[s${i}]scale=-2:${s.height}[v${i}]`);
  const filter = `[0:v:0]split=${count}${split};${scales.join(";")}`;

  const args = ["-y", "-nostdin", "-v", "error", "-i", input.input, "-filter_complex", filter];
  streams.forEach((_, i) => {
    args.push("-map", `[v${i}]`);
    if (input.hasAudio) args.push("-map", "0:a:0");
  });
  streams.forEach((s, i) => {
    const settings = CODEC_SETTINGS[s.codec];
    const rung = rungFor(s.codec, s.height);
    args.push(
      `-c:v:${i}`,
      settings.encoder,
      `-preset:v:${i}`,
      settings.preset,
      `-crf:v:${i}`,
      String(settings.crf),
      `-pix_fmt:v:${i}`,
      settings.pixFmt,
      `-g:v:${i}`,
      String(gop),
      `-keyint_min:v:${i}`,
      String(gop),
      `-maxrate:v:${i}`,
      `${rung.maxrateKbps}k`,
      `-bufsize:v:${i}`,
      `${rung.bufsizeKbps}k`,
    );
    if (s.codec === "h264") args.push(`-sc_threshold:v:${i}`, "0");
  });
  if (input.hasAudio) args.push("-c:a", "aac", "-b:a", `${AUDIO_BITRATE_KBPS}k`, "-ac", "2");
  const map = streams.map((s, i) =>
    input.hasAudio ? `v:${i},a:${i},name:${s.name}` : `v:${i},name:${s.name}`,
  );
  args.push(
    "-f",
    "hls",
    "-hls_time",
    String(SEGMENT_SECONDS),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "fmp4",
    "-hls_flags",
    "independent_segments",
    "-hls_fmp4_init_filename",
    "init_%v.mp4",
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    map.join(" "),
    "-hls_segment_filename",
    `${input.outDir}/seg_%v_%05d.m4s`,
  );
  if (input.threads) args.push("-threads", String(input.threads));
  args.push(`${input.outDir}/%v.m3u8`);
  return { args, streams };
}
