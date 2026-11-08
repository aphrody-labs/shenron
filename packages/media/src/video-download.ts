// SPDX-License-Identifier: Apache-2.0
/**
 * Pure + Bun-native video download, probing, frame/hero/GIF extraction, and WebVTT validation module.
 * All pure functions are compatible with the browser/webview runtime (`shenron.runtime = "pure"`).
 */

export const PINNED_YT_DLP_VERSION = "2026.10.21" as const;

export const HERO_FRAME_TIMECODES = [240, 600, 1115] as const;

export const DEFAULT_GIF_PREVIEW = {
  start: 600,
  duration: 2,
  fps: 12,
  width: 480,
} as const;

export interface YtDlpOptions {
  url: string;
  outputTemplate: string;
  cookiesFile?: string;
  concurrentFragments?: number;
  format?: string;
  writeSubs?: boolean;
  subLangs?: string[];
}

export interface WebVttValidationResult {
  valid: boolean;
  cueCount: number;
  errors: string[];
}

function validateHttpsMediaUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string" || !rawUrl.trim() || !URL.canParse(rawUrl.trim())) {
    throw new Error("Invalid media URL");
  }
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== "https:") {
    throw new Error("Media URL must use https: protocol");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Media URL must not embed credentials");
  }
  return parsed.href;
}

/**
 * Validates an `https:` URL (without credentials) and builds deterministic `yt-dlp` CLI arguments.
 */
export function buildYtDlpArgs(options: YtDlpOptions): string[] {
  const url = validateHttpsMediaUrl(options.url);
  const outputTemplate = options.outputTemplate.trim();
  if (!outputTemplate) {
    throw new Error("outputTemplate must not be empty");
  }

  const concurrentFragments = options.concurrentFragments ?? 8;
  if (
    !Number.isSafeInteger(concurrentFragments) ||
    concurrentFragments < 1 ||
    concurrentFragments > 64
  ) {
    throw new RangeError("concurrentFragments must be an integer between 1 and 64");
  }

  const format =
    options.format?.trim() || "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b";

  const args: string[] = [
    "--no-part",
    "--no-mtime",
    "--no-playlist",
    "--no-Progress",
    "--newline",
    "--concurrent-fragments",
    String(concurrentFragments),
    "-f",
    format,
    "--merge-output-format",
    "mp4",
  ];

  // Normalize --no-progress to lowercase canonical flag
  args[3] = "--no-progress";

  if (options.cookiesFile?.trim()) {
    args.push("--cookies", options.cookiesFile.trim());
  }

  if (options.writeSubs) {
    const langs = (options.subLangs?.length ? options.subLangs : ["ja", "fr-FR", "en-US"])
      .map((lang) => lang.trim())
      .filter(Boolean);
    args.push("--write-subs", "--sub-format", "vtt", "--sub-langs", langs.join(","));
  }

  args.push("-o", outputTemplate, url);
  return args;
}

const WEBVTT_TIMESTAMP_RE =
  /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.\d{3}\s+-->\s+(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.\d{3}(?:\s+.*)?$/;

function parseTimestampMs(
  hours: string | undefined,
  minutes: string,
  secondsWithMs: string,
): number {
  const h = hours ? Number.parseInt(hours, 10) : 0;
  const m = Number.parseInt(minutes, 10);
  const [secStr = "0", msStr = "0"] = secondsWithMs.split(".");
  const s = Number.parseInt(secStr, 10);
  const ms = Number.parseInt(msStr, 10);
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

/**
 * Validates WebVTT subtitle content (`WEBVTT` header and `-->` timestamp cue lines).
 */
export function validateWebVttContent(content: string): WebVttValidationResult {
  const errors: string[] = [];
  if (typeof content !== "string") {
    return { valid: false, cueCount: 0, errors: ["Content must be a string"] };
  }

  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const firstLine = (lines[0] ?? "").trim();

  if (!/^WEBVTT(?:\s.*)?$/.test(firstLine)) {
    errors.push("Missing or invalid WEBVTT header on line 1");
  }

  let cueCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line.includes("-->")) continue;

    if (!WEBVTT_TIMESTAMP_RE.test(line)) {
      errors.push(`Invalid WebVTT cue timestamp on line ${i + 1}: "${line}"`);
      continue;
    }

    const [rawStart = "", rawEndWithSettings = ""] = line.split("-->");
    const startToken = rawStart.trim();
    const endToken = (rawEndWithSettings.trim().split(/\s+/)[0] ?? "").trim();
    const startParts = startToken.split(":");
    const endParts = endToken.split(":");

    const startMs =
      startParts.length === 3
        ? parseTimestampMs(startParts[0], startParts[1] ?? "00", startParts[2] ?? "00.000")
        : parseTimestampMs(undefined, startParts[0] ?? "00", startParts[1] ?? "00.000");
    const endMs =
      endParts.length === 3
        ? parseTimestampMs(endParts[0], endParts[1] ?? "00", endParts[2] ?? "00.000")
        : parseTimestampMs(undefined, endParts[0] ?? "00", endParts[1] ?? "00.000");

    if (endMs <= startMs) {
      errors.push(`WebVTT cue end timestamp must be greater than start on line ${i + 1}`);
      continue;
    }

    cueCount += 1;
  }

  if (cueCount === 0) {
    errors.push("WebVTT file contains no valid subtitle cues");
  }

  return {
    valid: errors.length === 0 && cueCount > 0,
    cueCount,
    errors,
  };
}

/**
 * Computes deterministic scene frame extraction timestamps bounded by `durationSec - 5`.
 * Default parameters match the canonical 41-frame `DBS_BEERUS` scene timeline (`startSec = 48.579`, `stepSec = 32.5`).
 */
export function computeBeerusFrameTimecodes(
  durationSec: number,
  count = 41,
  startSec = 48.579,
  stepSec = 32.5,
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 10) {
    throw new RangeError("durationSec must be a finite number greater than 10");
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 500) {
    throw new RangeError("count must be an integer between 1 and 500");
  }
  if (!Number.isFinite(startSec) || startSec < 0) {
    throw new RangeError("startSec must be a non-negative finite number");
  }
  if (!Number.isFinite(stepSec) || stepSec <= 0) {
    throw new RangeError("stepSec must be a positive finite number");
  }

  const maxTimecode = Math.max(startSec, Number((durationSec - 5).toFixed(3)));
  const timecodes: number[] = [];

  for (let index = 0; index < count; index++) {
    const raw = startSec + index * stepSec;
    const bounded = Math.min(raw, maxTimecode);
    timecodes.push(Number(bounded.toFixed(3)));
  }

  return timecodes;
}
