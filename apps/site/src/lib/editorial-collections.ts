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
