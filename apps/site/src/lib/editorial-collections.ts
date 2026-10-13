// SPDX-License-Identifier: Apache-2.0
import manifest from "../../../bot/data/editorial-collections-manifest.json";

export type CollectionLanguage = "ja" | "fr" | "en";
export interface EditorialCollection {
  id: string;
  kind: "anime" | "manga" | "interview" | "official" | "magazine" | "artbook";
  labels: Record<CollectionLanguage, string>;
  languages: CollectionLanguage[];
  subtitles: string[];
  colors: string[];
  targetCount: number | null;
  matchSeries: string[];
  matchWorks: string[];
  sources: string[];
  status: "requested";
}

export function readEditorialCollections(id?: string) {
  const collections = manifest.collections as EditorialCollection[];
  return {
    schema: manifest.schema,
    requestedAt: manifest.requestedAt,
    scope: "requested-coverage",
    complete: false,
    policy: manifest.policy,
    collections: id ? collections.filter((collection) => collection.id === id) : collections,
  };
}

/** A Japanese transcription must preserve the original language and source evidence. */
export function validateJapaneseTranscriptEvidence(evidence: {
  sourceLanguage: string;
  transcriptLanguage: string;
  pivotLanguage?: string | null;
  sourceSha256: string;
  transcriptSha256: string;
  reviewStatus: "draft" | "reviewed";
  completeness: "partial" | "complete";
}) {
  if (
    evidence.sourceLanguage !== "ja" ||
    evidence.transcriptLanguage !== "ja" ||
    evidence.pivotLanguage ||
    !/^[a-f0-9]{64}$/i.test(evidence.sourceSha256) ||
    !/^[a-f0-9]{64}$/i.test(evidence.transcriptSha256)
  ) {
    throw new Error("Invalid original Japanese transcript evidence");
  }
  return {
    translationEligible: evidence.reviewStatus === "reviewed",
    complete: evidence.reviewStatus === "reviewed" && evidence.completeness === "complete",
  };
}

export interface EditorialCoverageRows {
  volumeRows: Array<Record<string, unknown>>;
  editionRows: Array<Record<string, unknown>>;
  databookRows: Array<Record<string, unknown>>;
  episodeRows: Array<Record<string, unknown>>;
}

/** Whitelists metadata; reference counts do not establish complete works. */
export function projectEditorialCoverage(
  { volumeRows, editionRows, databookRows, episodeRows }: EditorialCoverageRows,
  id?: string,
) {
  const registry = readEditorialCollections(id);
  return {
    ...registry,
    observedAt: new Date().toISOString(),
    scope: "live-canonical-catalogue-reference-counts",
    collections: registry.collections.map((collection) => {
      const editions =
        collection.kind === "manga"
          ? editionRows.filter((row) =>
              collection.id === "dragon-ball-full-color-ja"
                ? row.edition === "full_color" &&
                  row.language === "ja" &&
                  ["DB", "DBJP"].includes(String(row.series))
                : collection.matchSeries.includes(String(row.series)) &&
                  collection.languages.includes(row.language as "ja" | "fr" | "en"),
            )
          : [];
      return Object.assign({}, collection, {
        catalogRecords:
          collection.id === "dragon-ball-full-color-ja"
            ? editions.reduce((count, row) => count + Number(row.volumes), 0)
            : collection.matchSeries.length === 0
              ? null
              : (collection.kind === "anime" ? episodeRows : volumeRows)
                  .filter((row) => collection.matchSeries.includes(String(row.series)))
                  .reduce((count, row) => count + Number(row.records), 0),
        editions: editions.map((row) => ({
          language: row.language,
          edition: row.edition,
          volumes: Number(row.volumes),
          declaredPages: Number(row.declared_pages),
        })),
        readerEvidence:
          collection.id === "soshuhen" || collection.id === "dragon-quest-artbooks"
            ? databookRows
                .filter((row) =>
                  collection.id === "soshuhen"
                    ? /Sōshūhen/.test(String(row.title))
                    : /Dragon Quest/i.test(String(row.title)),
                )
                .map((row) => ({
                  id: Number(row.id),
                  title: row.title,
                  readablePageReferences: Number(row.readable_page_references),
                  complete: false,
                }))
            : [],
        mediaAvailability: "not-qualified",
        publishingRights: "not-qualified",
      });
    }),
    omissions: [
      "R2 object readback and integrity",
      "linguistic transcript review",
      "media playback",
      "publishing rights",
    ],
  };
}
