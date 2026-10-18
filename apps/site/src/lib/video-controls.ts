// SPDX-License-Identifier: Apache-2.0
export const VIDEO_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
// One owner for the HLS test: Bun Video decides which sources it attaches hls.js to.
export { isHlsSource } from "@aphrody/bun-video/playback";
export type VideoKeyAction =
  | "play"
  | "backward"
  | "forward"
  | "mute"
  | "volumeUp"
  | "volumeDown"
  | "fullscreen"
  | "pip"
  | "captions";

/** Native buttons, editors and modifier shortcuts retain their own behavior. */
export function videoKeyAction(
  key: string,
  targetTag: string,
  options: { editable?: boolean; modified?: boolean; repeat?: boolean } = {},
): VideoKeyAction | null {
  if (options.editable || options.modified || options.repeat) return null;
  if (!["VIDEO", "DIV"].includes(targetTag.toUpperCase())) return null;
  switch (key.toLowerCase()) {
    case " ":
    case "k":
      return "play";
    case "j":
    case "arrowleft":
      return "backward";
    case "l":
    case "arrowright":
      return "forward";
    case "arrowup":
      return "volumeUp";
    case "arrowdown":
      return "volumeDown";
    case "m":
      return "mute";
    case "f":
      return "fullscreen";
    case "p":
      return "pip";
    case "c":
      return "captions";
    default:
      return null;
  }
}

/** A seek is valid only once a duration or live seekable range is available. */
export function videoSeekTarget(
  current: number,
  delta: number,
  start: number,
  end: number,
): number | null {
  if (![current, delta, start, end].every(Number.isFinite) || end < start) return null;
  return Math.min(end, Math.max(start, current + delta));
}

const RESUME_PREFIX = "shenron:video-position:";
const RESUME_MIN_SECONDS = 15;
const RESUME_END_MARGIN_SECONDS = 30;

/** Storage key for a playback source; query strings carry signed tokens and are dropped. */
export function videoResumeKey(source: string): string {
  try {
    const url = new URL(source, "https://relative.invalid");
    return `${RESUME_PREFIX}${url.origin === "https://relative.invalid" ? "" : url.origin}${url.pathname}`;
  } catch {
    return `${RESUME_PREFIX}${source}`;
  }
}

/** A position is worth restoring once past the intro and before the credits. */
export function videoResumePosition(saved: number, duration: number): number | null {
  if (![saved, duration].every(Number.isFinite) || duration <= 0) return null;
  if (saved < RESUME_MIN_SECONDS || saved > duration - RESUME_END_MARGIN_SECONDS) return null;
  return saved;
}

/** Volume stepping that stays inside [0, 1] without float drift. */
export function videoVolumeStep(volume: number, delta: number): number {
  return Math.round(Math.min(1, Math.max(0, volume + delta)) * 100) / 100;
}
