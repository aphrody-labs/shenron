// SPDX-License-Identifier: Apache-2.0
import type { DatabookRecord } from "./databooks";
import type { ToriyamaSourceGroup } from "./toriyama-shared";

type InterviewDocument = Pick<
  DatabookRecord,
  "id" | "kind" | "title" | "title_ja" | "published_at" | "cover"
> & { visible?: boolean };
const titleKey = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("fr");

/** Add catalogue interviews without attributing their untranscribed contents to Toriyama. */
export function mergeInterviewGallery(
  authorGroups: ToriyamaSourceGroup[],
  documents: InterviewDocument[],
) {
  const groups: ToriyamaSourceGroup[] = [];
  function merge(group: ToriyamaSourceGroup) {
    const existing = groups.find(
      (candidate) =>
        (group.databookId !== null && candidate.databookId === group.databookId) ||
        ((group.databookId === null || candidate.databookId === null) &&
          titleKey(candidate.document) === titleKey(group.document)),
    );
    if (!existing) {
      groups.push({ ...group, words: [...group.words] });
      return;
    }
    existing.databookId ??= group.databookId;
    existing.cover ??= group.cover;
    existing.year ??= group.year;
    existing.kind ??= group.kind;
    const ids = new Set(existing.words.map((word) => word.id));
    for (const word of group.words) {
      if (ids.has(word.id)) continue;
      ids.add(word.id);
      existing.words.push(word);
    }
  }
  for (const group of authorGroups) merge(group);
  for (const document of documents) {
    if (document.kind !== "interview" || document.visible === false) continue;
    const year =
      document.published_at === null
        ? null
        : new Date(document.published_at * 1000).getUTCFullYear();
    const matching = groups.find(
      (group) =>
        group.databookId === document.id ||
        (group.databookId === null &&
          (titleKey(group.document) === titleKey(document.title) ||
            (document.title_ja !== null &&
              titleKey(group.document) === titleKey(document.title_ja)))),
    );
    if (matching) {
      matching.databookId ??= document.id;
      matching.cover ??= document.cover;
      matching.year ??= Number.isFinite(year) ? year : null;
      matching.kind ??= document.kind;
      continue;
    }
    merge({
      document: document.title,
      documentKey: `interview-${document.id}`,
      year: Number.isFinite(year) ? year : null,
      databookId: document.id,
      kind: document.kind,
      cover: document.cover,
      words: [],
    });
  }
  return groups;
}
