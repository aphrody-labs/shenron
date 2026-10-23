import { describe, expect, test } from "bun:test";
import { findCharacterByCanonicalSlug, resolveCharacterParam } from "@/lib/wiki-slugs";

describe("character slug lookup fallback", () => {
  test("finds the public record when a stale numeric slug mapping misses", () => {
    const resolved = resolveCharacterParam("c-21");
    expect(resolved).toMatchObject({ id: 298, canonicalSlug: "c-21" });

    const publicRecord = { id: 123, name: "C-21" };
    expect(findCharacterByCanonicalSlug([publicRecord], resolved.canonicalSlug!)).toBe(
      publicRecord,
    );
  });
});
