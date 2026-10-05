/**
 * `?state=` of the manga and databook catalogues: every entry, the readable ones, or the
 * ones still to complete. Shareable in the URL; the former French form
 * (`?etat=disponibles|a-completer`) is still read.
 */
export type AvailabilityFilter = "all" | "available" | "incomplete";

export const AVAILABILITY_PARAM = "state";

const LEGACY_PARAM = "etat";
const LEGACY_VALUES: Readonly<Record<string, AvailabilityFilter>> = {
  disponibles: "available",
  "a-completer": "incomplete",
};

/** Filter carried by a query string (`location.search`), `"all"` by default. */
export function readAvailability(search: string): AvailabilityFilter {
  const params = new URLSearchParams(search);
  const value = params.get(AVAILABILITY_PARAM) ?? params.get(LEGACY_PARAM) ?? "";
  if (value === "available" || value === "incomplete") return value;
  return LEGACY_VALUES[value] ?? "all";
}

/** Writes the filter into `url` (drops the former parameter). */
export function writeAvailability(url: URL, value: AvailabilityFilter): void {
  url.searchParams.delete(LEGACY_PARAM);
  if (value === "all") url.searchParams.delete(AVAILABILITY_PARAM);
  else url.searchParams.set(AVAILABILITY_PARAM, value);
}
