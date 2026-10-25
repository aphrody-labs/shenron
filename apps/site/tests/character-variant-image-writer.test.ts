import { describe, expect, test } from "bun:test";
import {
  prepareVariantImageUpdate,
  assignVariantImages,
  type VariantImageEntry,
} from "../scripts/assign-character-variant-images";
const entry: VariantImageEntry = {
  id: 2205,
  characterId: 10,
  slug: "gohan-namek",
  image: "https://cdn.dragonballfr.com/assets/dbz/officiel-2026-08-27/showcase-060-gohan-0.jpg",
  expectedImage: null,
  sha256: "c".repeat(64),
  kind: "portrait",
  source: {
    url: "https://en.dragon-ball-official.com/news/01_1201.html",
    title: "Gohan Namek",
    visual: "Reviewed portrait",
  },
};
const row = {
  id: 2205,
  characterId: 10,
  slug: "gohan-namek",
  image: null,
  visible: true,
  summary: "Existing editorial text",
};
describe("reviewed variant image writer", () => {
  test("updates only image with a full optimistic snapshot", () => {
    const body = prepareVariantImageUpdate(entry, row)!;
    expect(body.image).toBe(entry.image);
    expect(body.expected).toEqual(row);
    expect(body.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(body).toSorted()).toEqual(["expected", "expectedSha256", "image"]);
  });
  test("refuses identity, visibility, existing-image and origin drift", () => {
    expect(() => prepareVariantImageUpdate(entry, { ...row, slug: "gohan-cell" })).toThrow(
      "drifted",
    );
    expect(() => prepareVariantImageUpdate(entry, { ...row, visible: false })).toThrow("drifted");
    expect(() => prepareVariantImageUpdate(entry, { ...row, image: "existing.webp" })).toThrow(
      "preserved",
    );
    expect(() =>
      prepareVariantImageUpdate({ ...entry, image: "https://external.example/image.jpg" }, row),
    ).toThrow("origin");
  });
  test("treats an applied entry idempotently", () =>
    expect(prepareVariantImageUpdate(entry, { ...row, image: entry.image })).toBeNull());
  test("stays offline in proposal mode and requires credentials to apply", async () => {
    const proposal = await assignVariantImages([entry]);
    expect(proposal[0]!.status).toContain("proposal-not-executed");
    await expect(assignVariantImages([entry], undefined, true)).rejects.toThrow(
      "SHENRON_WIKI_ADMIN_COOKIE",
    );
  });
});
