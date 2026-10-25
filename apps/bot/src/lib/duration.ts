/** Durées des sanctions et des vocaux : `"10m"` ↔ millisecondes, en TypeScript pur. */

/**
 * Parse `"10m"`, `"1h"`, `"7d"`, `"2w"` → millisecondes.
 * `undefined` si format invalide.
 */
export function parseDuration(input?: string): number | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;

  let i = 0;
  while (i < trimmed.length && trimmed.charCodeAt(i) >= 48 && trimmed.charCodeAt(i) <= 57) {
    i++;
  }
  if (i === 0) return undefined;

  const n = parseInt(trimmed.slice(0, i), 10);
  if (isNaN(n)) return undefined;

  let j = i;
  while (j < trimmed.length && (trimmed[j] === " " || trimmed[j] === "\t")) {
    j++;
  }
  if (j >= trimmed.length) return undefined;

  const unit = trimmed[j].toLowerCase();
  let mult: number;
  switch (unit) {
    case "s":
      mult = 1000;
      break;
    case "m":
      mult = 60000;
      break;
    case "h":
      mult = 3600000;
      break;
    case "d":
      mult = 86400000;
      break;
    case "w":
      mult = 604800000;
      break;
    default:
      return undefined;
  }

  for (let k = j + 1; k < trimmed.length; k++) {
    if (trimmed[k] !== " " && trimmed[k] !== "\t") {
      return undefined;
    }
  }

  return n * mult;
}

/** Format d'une durée en ms vers `"3j"`, `"4h"`, `"15min"`, `"42s"`. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const divRound = (n: number, d: number) => Math.floor((n + d / 2) / d);

  if (abs >= 86400000) {
    return `${divRound(abs, 86400000)}j`;
  }
  if (abs >= 3600000) {
    return `${divRound(abs, 3600000)}h`;
  }
  if (abs >= 60000) {
    return `${divRound(abs, 60000)}min`;
  }
  return `${divRound(abs, 1000)}s`;
}
