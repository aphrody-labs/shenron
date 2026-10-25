// SPDX-License-Identifier: Apache-2.0
import { VARIANT_EDITORIAL_EVIDENCE_KEYS } from "../src/lib/wiki-variant-evidence";

/** Fixed SQL expression, never interpolated user input. PostgreSQL reads the locked conflict row. */
export const VARIANT_MEASUREMENT_EVIDENCE_SQL = `excluded.evidence || coalesce((
  select jsonb_object_agg(entry.key, entry.value)
  from jsonb_each(coalesce(db_character_variants.evidence, '{}'::jsonb)) as entry
  where entry.key in (${VARIANT_EDITORIAL_EVIDENCE_KEYS.map((key) => `'${key}'`).join(", ")})
), '{}'::jsonb)`;

/** Only an explicitly referenced editorial bound overrides the newly measured presentation bound. */
export function variantMeasurementVolumeSql(field: "firstVolume" | "lastVolume"): string {
  const column = field === "firstVolume" ? "first_volume" : "last_volume";
  return `case when jsonb_path_exists(coalesce(db_character_variants.evidence, '{}'::jsonb), '$.editorialReferences[*].fields[*] ? (@ == "${field}")') then db_character_variants.${column} else excluded.${column} end`;
}

/** Physical reset destroys identifiers, audit targets and reviewed content; no legacy bypass. */
export function assertVariantMeasurementMode(args: readonly string[]): void {
  if (args.includes("--reinitialiser"))
    throw new Error(
      "Destructive variant reset is disabled; use normal measurement to preserve editorial content",
    );
}
