import { describe, expect, test } from "bun:test";
import {
  createGokuPreviewVariants,
  filterGokuVariantsForSeries,
  getGokuPreviewRelationSlugs,
} from "../src/lib/goku-character-preview";

describe("Goku version and saga preview", () => {
  const variants = createGokuPreviewVariants(
    1,
    (key, values) => `${key}${values?.saga ? `:${values.saga}` : ""}`,
  );

  test("offers only the selected timeline's sagas", () => {
    const dbz = filterGokuVariantsForSeries(variants, "DBZ");
    const dbs = filterGokuVariantsForSeries(variants, "DBS");

    expect(dbz.map((variant) => variant.slug)).toEqual([
      "goku-preview-dbz-saiyan",
      "goku-preview-dbz-majin-buu",
    ]);
    expect(dbs.map((variant) => variant.slug)).toEqual([
      "goku-preview-dbs-gods",
      "goku-preview-dbs-tournament-of-power",
    ]);
    expect(dbz.some((variant) => variant.sagaSlug === "tournament-of-power")).toBe(false);
    expect(dbs.some((variant) => variant.sagaSlug === "majin-buu")).toBe(false);
  });

  test("changes the story, portrait, and relationships with the selected saga", () => {
    const majinBuu = variants.find((variant) => variant.slug === "goku-preview-dbz-majin-buu")!;
    const tournament = variants.find(
      (variant) => variant.slug === "goku-preview-dbs-tournament-of-power",
    )!;

    expect(majinBuu.article).not.toBe(tournament.article);
    expect(majinBuu.image).not.toBe(tournament.image);
    expect(getGokuPreviewRelationSlugs(majinBuu.slug)).toContain("kid-buu");
    expect(getGokuPreviewRelationSlugs(tournament.slug)).toContain("freezer");
    expect(getGokuPreviewRelationSlugs(majinBuu.slug)).not.toEqual(
      getGokuPreviewRelationSlugs(tournament.slug),
    );
  });
});
