// SPDX-License-Identifier: Apache-2.0

/** Refreshes may remove the selected source while retaining the same language. */
export function resolvePlayerIndex(index: number, count: number): number {
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

/** Exhaustion stays inside the currently selected language's source list. */
export function nextPlayerIndex(index: number, count: number): number | null {
  const current = resolvePlayerIndex(index, count);
  return current + 1 < count ? current + 1 : null;
}
