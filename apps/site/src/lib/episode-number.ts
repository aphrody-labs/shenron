// SPDX-License-Identifier: Apache-2.0
export function episodeNumberText(value: number | null, padded = false): string | null {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) return null;
  return padded ? String(value).padStart(3, "0") : String(value);
}
