// SPDX-License-Identifier: Apache-2.0

/** Identity, routing and parent keys must never be copied from a duplicate. */
const EDITORIAL_FIELDS = [
  "label",
  "display_name",
  "name_ja",
  "form",
  "image",
  "age",
  "power_level",
  "ki",
  "max_ki",
  "role",
  "affiliation",
  "summary",
  "highlights",
  "transformation_ids",
  "technique_ids",
  "first_volume",
  "last_volume",
  "origin",
  "evidence",
  "first_episode",
  "last_episode",
  "key_episodes",
  "sort_order",
] as const;

export type ConsolidationVariant = {
  id: string | number;
  character_id: string | number;
  saga_id: string | number;
  slug: string;
  visible: boolean;
  [field: string]: unknown;
};

export type VariantChange = {
  row: ConsolidationVariant;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/** Refuse ambiguous published content; never turn a published saga into a hidden one. */
export function planVariantConsolidation(
  winnerId: number,
  duplicate: ConsolidationVariant,
  canonical?: ConsolidationVariant,
): VariantChange[] {
  if (Number(duplicate.id) === 2330 || Number(canonical?.id) === 2330)
    throw new Error("variant #2330 is outside identity consolidation");
  if (!canonical) {
    return [
      {
        row: duplicate,
        before: { character_id: duplicate.character_id },
        after: { character_id: winnerId },
      },
    ];
  }
  if (!duplicate.visible) return [];
  const source = Object.fromEntries(
    EDITORIAL_FIELDS.filter((key) => key in duplicate).map((key) => [key, duplicate[key]]),
  );
  if (canonical.visible) {
    for (const [key, value] of Object.entries(source)) {
      if (!Bun.deepEquals(value, canonical[key]))
        throw new Error(
          `published variant conflict: ${duplicate.slug} / ${canonical.slug} (${key})`,
        );
    }
    return [{ row: duplicate, before: { visible: true }, after: { visible: false } }];
  }
  const before = Object.fromEntries(Object.keys(source).map((key) => [key, canonical[key]]));
  return [
    { row: canonical, before: { ...before, visible: false }, after: { ...source, visible: true } },
    { row: duplicate, before: { visible: true }, after: { visible: false } },
  ];
}
