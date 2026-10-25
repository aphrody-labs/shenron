/** Resolve a public series key from editorial labels without relying on age alone. */
export function seriesFromLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.toLowerCase();
  if (/daima/.test(label)) return "DB_DAIMA";
  if (/dragon ball gt|\bgt\b/.test(label)) return "DBGT";
  if (/super|dbs/.test(label)) return "DBS";
  if (/survie de l'univers|tournoi du pouvoir/.test(label)) return "DBS";
  if (/dragon ball z|\bdbz\b|\bz\b|cell|buu|boo|cyborg|android|freezer|frieza|namek/.test(label)) {
    return "DBZ";
  }
  if (/dragon ball|^db$/.test(label)) return "DB";
  return null;
}

/** Keep unresolved source records out of a guessed continuity bucket. */
export function seriesFromLabels(...values: unknown[]): string {
  for (const value of values) {
    const series = seriesFromLabel(value);
    if (series) return series;
  }
  return "UNKNOWN";
}
