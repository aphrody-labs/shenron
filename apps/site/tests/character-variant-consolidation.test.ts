import { describe, expect, test } from "bun:test";
import {
  planVariantConsolidation,
  type ConsolidationVariant,
} from "../src/lib/character-variant-consolidation";
const variant = (values: Partial<ConsolidationVariant> = {}): ConsolidationVariant => ({
  id: 2,
  character_id: 706,
  saga_id: 9,
  slug: "krilin-namek",
  visible: true,
  summary: "Published narrative",
  technique_ids: "[1,2]",
  ...values,
});
describe("variant consolidation preservation", () => {
  test("promotes the published duplicate without changing canonical URL or identity", () => {
    const canonical = variant({
      id: 1,
      character_id: 11,
      slug: "krillin-namek",
      visible: false,
      summary: "Old hidden content",
      technique_ids: "[]",
    });
    const changes = planVariantConsolidation(11, variant(), canonical);
    expect(changes).toHaveLength(2);
    expect(changes[0]!.after).toEqual({
      summary: "Published narrative",
      technique_ids: "[1,2]",
      visible: true,
    });
    expect(changes[0]!.before).toEqual({
      summary: "Old hidden content",
      technique_ids: "[]",
      visible: false,
    });
    expect(changes[1]!.after).toEqual({ visible: false });
    expect(changes[0]!.row.slug).toBe("krillin-namek");
  });
  test("moves a unique variant without altering its visibility or payload", () => {
    const changes = planVariantConsolidation(11, variant({ visible: false }));
    expect(changes[0]!.after).toEqual({ character_id: 11 });
  });
  test("does not resurrect hidden collisions", () => {
    expect(
      planVariantConsolidation(11, variant({ visible: false }), variant({ id: 1, visible: false })),
    ).toEqual([]);
  });
  test("rejects two different published narratives before hiding either", () => {
    expect(() =>
      planVariantConsolidation(11, variant(), variant({ id: 1, summary: "Different narrative" })),
    ).toThrow("published variant conflict");
  });
  test("allows equivalent published content to consolidate", () => {
    const changes = planVariantConsolidation(
      11,
      variant(),
      variant({ id: 1, character_id: 11, slug: "krillin-namek" }),
    );
    expect(changes.map((c) => c.after)).toEqual([{ visible: false }]);
  });
  test("explicitly rejects unrelated orphan quarantine", () => {
    expect(() => planVariantConsolidation(11, variant({ id: 2330 }))).toThrow(
      "outside identity consolidation",
    );
  });
});
