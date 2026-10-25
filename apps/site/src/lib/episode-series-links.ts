// SPDX-License-Identifier: Apache-2.0

/** Public series names are shared by API metadata and catalogue navigation. */
export const EPISODE_SERIES_LABELS: Record<string, string> = {
  DB: "Dragon Ball",
  DBZ: "Dragon Ball Z",
  DBZ_KAI: "Dragon Ball Z Kai",
  DBZ_KAI_FINAL: "Dragon Ball Z Kai – Final Chapters",
  DBGT: "Dragon Ball GT",
  DBS: "Dragon Ball Super",
  DBS_BEERUS: "Dragon Ball Super: Beerus",
  DB_DAIMA: "Dragon Ball Daima",
};

function normalizedSeries(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Unrecognized editorial labels stay readable without inventing a destination. */
export function episodeSeriesHref(series: string): string | null {
  const normalized = normalizedSeries(series);
  const entry = Object.entries(EPISODE_SERIES_LABELS).find(
    ([code, label]) =>
      normalizedSeries(code) === normalized || normalizedSeries(label) === normalized,
  );
  const code =
    entry?.[0] ??
    (normalized === "dragon ball kai"
      ? "DBZ_KAI"
      : normalized === "sdbh" || normalized === "super dragon ball heroes"
        ? "SDBH"
        : null);
  return code ? `/wiki/episodes/series/${code}` : null;
}
