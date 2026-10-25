// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
const invalidations: Array<{ path: string; type?: "page" | "layout" }> = [];
let cacheUnavailable = false;
mock.module("next/cache", () => ({
  revalidatePath: (path: string, type?: "page" | "layout") => {
    if (cacheUnavailable) throw new Error("Cache unavailable");
    invalidations.push({ path, type });
  },
  revalidateTag: () => {},
}));
mock.module("@/lib/wiki-admin", () => ({ getWikiRow: async () => null }));
const { revalidateWikiEntity } = await import("../src/lib/wiki-revalidate");
const paths = () => invalidations.map(({ path }) => path);

beforeEach(() => {
  invalidations.length = 0;
  cacheUnavailable = false;
});

describe("character variant editorial cache dependencies", () => {
  test("a variant edit expires its API, catalogue and canonical character pages", () => {
    revalidateWikiEntity("db_character_variants", { id: 42, characterId: 1 });
    expect(paths()).toContain("/api/wiki/variants");
    expect(paths()).toContain("/wiki/characters");
    expect(invalidations).toContainEqual({ path: "/wiki/characters/[slug]", type: "page" });
    expect(invalidations).toContainEqual({ path: "/wiki/sagas/[slug]", type: "page" });
    expect(paths()).not.toContain("/wiki/characters/1");
  });

  test("a parent character edit expires variant card name, image and visibility fallbacks", () => {
    revalidateWikiEntity("db_characters", { id: 1, slug: "son-goku" });
    expect(paths()).toContain("/api/wiki/variants");
    expect(paths()).toContain("/wiki/characters");
    expect(paths()).toContain("/wiki/characters/1");
  });

  test("a saga edit expires variant card labels and the character version selector", () => {
    revalidateWikiEntity("db_sagas", { id: 1, slug: "saiyans" });
    expect(paths()).toContain("/api/wiki/variants");
    expect(paths()).toContain("/wiki/characters");
    expect(invalidations).toContainEqual({ path: "/wiki/characters/[slug]", type: "page" });
  });

  test("variant invalidation works without a row snapshot", () => {
    revalidateWikiEntity("db_character_variants");
    expect(paths()).toContain("/api/wiki/variants");
    expect(invalidations).toContainEqual({ path: "/wiki/characters/[slug]", type: "page" });
  });

  test("unrelated entity edits leave the variant API cache alone", () => {
    revalidateWikiEntity("db_planets", { id: 1 });
    expect(paths()).not.toContain("/api/wiki/variants");
  });

  test("a cache outage never turns a successful editorial write into an error", () => {
    cacheUnavailable = true;
    expect(() => revalidateWikiEntity("db_character_variants", { id: 42 })).not.toThrow();
  });
});
