// SPDX-License-Identifier: Apache-2.0
export const VIDEO_PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export function isHlsSource(source: string): boolean {
  try {
    const url = new URL(source, "https://relative.invalid");
    return (
      ["https:", "http:"].includes(url.protocol) && url.pathname.toLowerCase().endsWith(".m3u8")
    );
  } catch {
    return false;
  }
}
export type VideoKeyAction =
  | "play"
  | "backward"
  | "forward"
  | "mute"
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
