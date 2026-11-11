// SPDX-License-Identifier: Apache-2.0
/**
 * packages/remotion/src/timeline.ts
 *
 * Deterministic frame math and SMPTE timecode conversions for Remotion compositions.
 */

export function secondsToFrames(seconds: number, fps: number = 24): number {
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: number, fps: number = 24): number {
  return frames / fps;
}

export function formatTimecodeSMPTE(frame: number, fps: number = 24): string {
  const totalSeconds = Math.floor(frame / fps);
  const remainderFrames = frame % fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(remainderFrames)}`;
}

export function parseSMPTETimecode(smpte: string, fps: number = 24): number {
  const parts = smpte.split(":").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) {
    throw new Error(`Invalid SMPTE timecode format: "${smpte}" (expected HH:MM:SS:FF)`);
  }
  const [h, m, s, f] = parts;
  return (h * 3600 + m * 60 + s) * fps + f;
}

/**
 * Linear interpolation between values across a frame range.
 */
export function interpolate(
  frame: number,
  inputRange: [number, number],
  outputRange: [number, number],
  options?: { extrapolateLeft?: "clamp" | "extend"; extrapolateRight?: "clamp" | "extend" },
): number {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

  if (inMin === inMax) return outMin;

  if (frame <= inMin && options?.extrapolateLeft !== "extend") return outMin;
  if (frame >= inMax && options?.extrapolateRight !== "extend") return outMax;

  const progress = (frame - inMin) / (inMax - inMin);
  return outMin + progress * (outMax - outMin);
}
