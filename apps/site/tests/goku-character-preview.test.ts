import { describe, expect, test } from "bun:test";
import {
  createGokuPreviewVariants,
  getGokuPreviewRelationSlugs,
  getGokuPreviewTimelines,
  resolveGokuPreviewTimeline,
  shouldUseGokuShowcasePreview,
} from "../src/lib/goku-character-preview";

const translate = (key: string, values?: Record<string, string | number>) =>
  `${key}${values?.saga ? `:${values.saga}` : ""}${values?.timeline ? `:${values.timeline}` : ""}`;

const transformationNames = [
  "Super Saiyan",
  "Super Saiyan 2",
  "Super Saiyan 3",
  "Super Saiyan God",
  "Super Saiyan Blue",
  "Ultra Instinct",
  "Golden Great Ape",
  "Super Saiyan 4",
];
const techniqueNames = [
  "Kamehameha",
  "Kaioken",
  "Genki Dama",
  "Transmission instantanée",
  "Bukūjutsu",
  "Dragon Fist",
];

function variantsFor(
  timeline:
    | "goku-db"
    | "goku-dbz"
    | "goku-dbs"
    | "goku-gt"
    | "goku-daima"
    | "goku-xeno"
    | "goku-cc"
    | "goku-fusion"
    | "goku-jumpforce",
) {
  return createGokuPreviewVariants(
    1,
    timeline,
    transformationNames.map((name, id) => ({ id, name })),
    techniqueNames.map((name, id) => ({ technique: { id, name } })),
    translate,
  );
}

describe("Goku visual preview", () => {
  test("offers series and game versions separately from their saga lists", () => {
    const choices = getGokuPreviewTimelines(translate, "Son Goku");
    expect(choices.map(({ name }) => name)).toEqual([
      "Son Goku",
      "gokuDbz",
      "gokuDbs",
      "gokuGt",
      "gokuDaima",
      "xenoGoku",
      "gokuCc",
      "gokuFusion",
      "gokuJumpForce",
      "gokuSummary",
    ]);
    expect(choices.map(({ slug }) => slug)).toEqual([
      "goku-db",
      "goku-dbz",
      "goku-dbs",
      "goku-gt",
      "goku-daima",
      "goku-xeno",
      "goku-cc",
      "goku-fusion",
      "goku-jumpforce",
      "goku-summary",
    ]);
    expect(resolveGokuPreviewTimeline("unknown")).toBe("goku-summary");
  });

  test("uses showcase timelines only until DBZ editorial data is configured", () => {
    expect(shouldUseGokuShowcasePreview(false, true, ["goku-main", "future"])).toBe(true);
    expect(shouldUseGokuShowcasePreview(false, true, ["goku-dbz"])).toBe(false);
    expect(shouldUseGokuShowcasePreview(false, false, [])).toBe(false);
    expect(shouldUseGokuShowcasePreview(false, true, [], true)).toBe(false);
    expect(shouldUseGokuShowcasePreview(true, false, [])).toBe(true);
  });

  test("uses showcase timelines only until DBZ editorial data is configured", () => {
    expect(shouldUseGokuShowcasePreview(false, true, ["goku-main", "future"])).toBe(true);
    expect(shouldUseGokuShowcasePreview(false, true, ["goku-dbz"])).toBe(false);
    expect(shouldUseGokuShowcasePreview(false, false, [])).toBe(false);
    expect(shouldUseGokuShowcasePreview(true, false, [])).toBe(true);
  });

  test("scopes each saga menu to its selected series or game version", () => {
    const db = variantsFor("goku-db");
    const dbz = variantsFor("goku-dbz");
    const dbs = variantsFor("goku-dbs");
    const gt = variantsFor("goku-gt");
    const daima = variantsFor("goku-daima");
    const xeno = variantsFor("goku-xeno");
    const cc = variantsFor("goku-cc");
    const fusion = variantsFor("goku-fusion");

    expect(db.map(({ sagaSlug }) => sagaSlug)).toEqual(["pilaf", "piccolo-junior"]);
    expect(dbz.map(({ sagaSlug }) => sagaSlug)).toContain("majin-buu");
    expect(dbz.map(({ sagaSlug }) => sagaSlug)).not.toContain("tournament-of-power");
    expect(dbs.map(({ sagaSlug }) => sagaSlug)).toContain("tournament-of-power");
    expect(dbs.map(({ sagaSlug }) => sagaSlug)).not.toContain("majin-buu");
    expect(gt.map(({ sagaSlug }) => sagaSlug)).toEqual(["baby", "shadow-dragons"]);
    expect(daima.map(({ sagaSlug }) => sagaSlug)).toEqual(["daima"]);
    expect(xeno.map(({ sagaSlug }) => sagaSlug)).toEqual(["xeno-arc-one", "xeno-arc-two"]);
    expect(cc.map(({ sagaSlug }) => sagaSlug)).toEqual(["cc-arc-one", "cc-arc-two"]);
    expect(fusion.map(({ sagaSlug }) => sagaSlug)).toEqual(["fusion-arc-one", "fusion-arc-two"]);
  });

  test("changes story, portrait, relationships, and saga-available abilities", () => {
    const dbz = variantsFor("goku-dbz");
    const dbs = variantsFor("goku-dbs");
    const xeno = variantsFor("goku-xeno");
    const majinBuu = dbz.find((variant) => variant.sagaSlug === "majin-buu")!;
    const tournament = dbs.find((variant) => variant.sagaSlug === "tournament-of-power")!;
    const xenoArc = xeno[0]!;

    expect(majinBuu.article).not.toBe(tournament.article);
    expect(majinBuu.image).not.toBe(tournament.image);
    expect(majinBuu.image).not.toBe(xenoArc.image);
    expect(majinBuu.transformationIds).toEqual([0, 1, 2]);
    expect(majinBuu.transformationIds).not.toContain(5);
    expect(tournament.transformationIds).toContain(5);
    expect(majinBuu.techniqueIds).not.toEqual(tournament.techniqueIds);
    expect(getGokuPreviewRelationSlugs(majinBuu.slug)).toContain("kid-buu");
    expect(getGokuPreviewRelationSlugs(tournament.slug)).toContain("freezer");
    expect(getGokuPreviewRelationSlugs(xenoArc.slug)).not.toEqual(
      getGokuPreviewRelationSlugs(majinBuu.slug),
    );
  });
});
