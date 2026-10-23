// SPDX-License-Identifier: Apache-2.0
// Compatibility entry; domain rules are owned by @aphrody/shenron-config.
export * from "@aphrody/shenron-config/wiki-slugs";

import { formatCharacterSlug } from "@aphrody/shenron-config/wiki-slugs";

type CharacterSlugInput = {
  id: number;
  name: string;
  nameRomaji?: string | null;
  nameJa?: string | null;
};

/** Find an existing record by its public slug after a stale numeric mapping misses. */
export function findCharacterByCanonicalSlug<T extends CharacterSlugInput>(
  characters: readonly T[],
  canonicalSlug: string,
): T | undefined {
  return characters.find((character) => formatCharacterSlug(character) === canonicalSlug);
}
