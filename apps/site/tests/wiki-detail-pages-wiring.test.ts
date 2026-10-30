import { describe, expect, test } from "bun:test";

// Fiches d'entité : cadre commun WikiDetailPage (barre staff, fil d'Ariane, en-tête, infobox).
const framedRoutes = [
  "../src/app/wiki/arcs/[slug]/page.tsx",
  "../src/app/wiki/locations/[slug]/page.tsx",
  "../src/app/wiki/characters/[slug]/page.tsx",
  "../src/app/wiki/techniques/[slug]/page.tsx",
  "../src/app/wiki/transformations/[slug]/page.tsx",
  "../src/app/wiki/races/[slug]/page.tsx",
  "../src/app/wiki/sagas/[slug]/page.tsx",
  "../src/app/wiki/items/[slug]/page.tsx",
  "../src/app/wiki/games/[slug]/page.tsx",
  "../src/app/wiki/cards/[slug]/page.tsx",
  "../src/app/wiki/contributors/[slug]/page.tsx",
];

const readerRoutes = ["../src/app/wiki/databooks/[id]/page.tsx"];

describe("detail pages keep the shared wiki wiring", () => {
  test("chaque fiche d'entité passe par le cadre commun, sans menu wiki doublon", async () => {
    for (const route of framedRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("WikiDetailPage");
      expect(source).toContain("WikiEntityHeader");
      expect(source).toContain("crumbs=");
      expect(source).not.toContain("WikiDrawer");
    }
  });

  test("les lecteurs gardent DomainBar et Breadcrumbs", async () => {
    for (const route of readerRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("DomainBar");
      expect(source).toContain("Breadcrumbs");
      expect(source).not.toContain("WikiDrawer");
    }
  });

  test("le cadre commun porte DomainBar et Breadcrumbs une seule fois", async () => {
    const frame = await Bun.file(
      new URL("../src/components/wiki/WikiDetailPage.tsx", import.meta.url),
    ).text();
    expect(frame).toContain("DomainBar");
    expect(frame).toContain("Breadcrumbs");
  });
});
