// SPDX-License-Identifier: Apache-2.0
import type { RadarEvidence, RadarResults, RadarTransport, RadarVerdict } from "./use-dragon-radar";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const fields = {
  characters: ["name"],
  techniques: ["name", "slug"],
  transformations: ["name"],
  sagas: ["name", "slug"],
  episodes: ["title"],
  movies: ["title"],
  mangaChapters: [],
  mangaVolumes: [],
  battles: ["name"],
  tournaments: ["name"],
} satisfies Record<keyof RadarResults, string[]>;

/** Check the response before the view counts arrays and renders individual records. */
function readResults(value: unknown): RadarResults {
  if (!record(value)) throw new Error("Invalid search response");
  for (const [kind, required] of Object.entries(fields)) {
    const rows = value[kind];
    if (!Array.isArray(rows)) throw new Error("Missing search collection");
    for (const row of rows) {
      if (
        !record(row) ||
        typeof row.id !== "number" ||
        !Number.isFinite(row.id) ||
        required.some((field) => typeof row[field] !== "string")
      )
        throw new Error("Invalid search record");
      if (
        kind === "transformations" &&
        (typeof row.character_id !== "number" || !Number.isFinite(row.character_id))
      )
        throw new Error("Invalid character reference");
      for (const field of [
        "image",
        "description",
        "type",
        "ki",
        "series",
        "cover",
        "slug",
        "title",
      ]) {
        if (row[field] != null && typeof row[field] !== "string")
          throw new Error("Invalid search text");
      }
      for (const field of ["episode_number", "chapter_number", "volume_number", "release_year"]) {
        if (row[field] != null && (typeof row[field] !== "number" || !Number.isFinite(row[field])))
          throw new Error("Invalid search number");
      }
    }
  }
  const normalized = Object.fromEntries(Object.keys(fields).map((key) => [key, value[key]]));
  // The current site search uses number_in_series; older hosts used episode_number.
  normalized.episodes = (value.episodes as Record<string, unknown>[]).map((row) => {
    const number = row.episode_number ?? row.number_in_series;
    if (typeof number !== "number" || !Number.isFinite(number))
      throw new Error("Invalid episode number");
    return Object.assign({}, row, { episode_number: number });
  });
  return normalized as unknown as RadarResults;
}

function readVerdict(value: unknown): RadarVerdict | null {
  if (!record(value)) throw new Error("Invalid canon response");
  if (value.verdict == null) return null;
  const result = value.verdict;
  if (
    !record(result) ||
    !["verdict", "troll", "inconnu"].includes(String(result.nature)) ||
    ["verdict", "explanation", "tier", "tierLabel", "color"].some(
      (key) => typeof result[key] !== "string",
    ) ||
    typeof result.score !== "number" ||
    !Number.isFinite(result.score)
  )
    throw new Error("Invalid canon verdict");
  if (
    value.evidenceAssessmentEnabled !== undefined &&
    typeof value.evidenceAssessmentEnabled !== "boolean"
  )
    throw new Error("Invalid evidence capability");
  return Object.assign({}, result, {
    evidenceAssessmentEnabled: value.evidenceAssessmentEnabled === true,
  }) as unknown as RadarVerdict;
}

function readEvidence(value: unknown): RadarEvidence {
  if (!record(value)) throw new Error("Invalid evidence response");
  const decision = value.evidenceDecision;
  if (decision == null) return { status: "unavailable" };
  if (!record(decision)) throw new Error("Invalid evidence decision");
  if (decision.status === "unavailable" || decision.status === "abstained")
    return { status: decision.status };
  if (
    decision.status !== "selected" ||
    typeof decision.referenceId !== "string" ||
    decision.referenceId.length > 256 ||
    !Array.isArray(value.references) ||
    value.references.length > 256
  )
    throw new Error("Invalid evidence selection");
  const index = value.references.findIndex((row) => record(row) && row.id === decision.referenceId);
  const reference: unknown = value.references[index];
  if (
    !record(reference) ||
    typeof reference.subject !== "string" ||
    reference.subject.length > 1000 ||
    typeof reference.source !== "string" ||
    reference.source.length > 1000
  )
    throw new Error("Unknown evidence reference");
  return {
    status: "selected",
    referenceId: decision.referenceId,
    referenceIndex: index,
    subject: reference.subject,
    source: reference.source,
  };
}

/** Paths belong to the embedding host, which can point this same view at a Bun server. */
export function createDragonRadarHttpTransport(
  searchUrl = "/api/search",
  canonUrl = "/api/canon",
): RadarTransport {
  async function read(path: string, query: string, signal: AbortSignal): Promise<unknown> {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${path}${separator}q=${encodeURIComponent(query)}`, { signal });
    if (!response.ok) throw new Error("Search unavailable");
    return response.json();
  }
  return {
    assessEvidence: async (query, signal) => {
      if (!query.trim() || query.length > 400) throw new Error("Invalid evidence question");
      return readEvidence(
        await read(
          canonUrl + (canonUrl.includes("?") ? "&" : "?") + "assessEvidence=1",
          query,
          signal,
        ),
      );
    },
    search: async (query, signal) => readResults(await read(searchUrl, query, signal)),
    canon: async (query, signal) => readVerdict(await read(canonUrl, query, signal)),
  };
}
