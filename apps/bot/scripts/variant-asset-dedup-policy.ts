// SPDX-License-Identifier: Apache-2.0
/** Attributed or legacy generated image paths require the official image/provenance writer. */
export const VARIANT_ASSET_DEDUP_PREDICATE =
  "not (coalesce(evidence, '{}'::jsonb) ? 'imageArtwork') and coalesce(image, '') !~* '(^|/)assets/wiki/generated-portraits(/|$)'";
