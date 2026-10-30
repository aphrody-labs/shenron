import { describe, expect, test } from "bun:test";

const detailPageRoutes = [
  "../src/app/wiki/arcs/[slug]/page.tsx",
  "../src/app/wiki/locations/[slug]/page.tsx",
  "../src/app/wiki/characters/[slug]/page.tsx",
  "../src/app/wiki/techniques/[slug]/page.tsx",
  "../src/app/wiki/transformations/[slug]/page.tsx",
  "../src/app/wiki/databooks/[id]/page.tsx",
];

describe("detail pages keep the shared wiki wiring", () => {
  test("chaque fiche de détail d'entité intègre DomainBar sans menu wiki doublon", async () => {
    for (const route of detailPageRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("DomainBar");
      expect(source).not.toContain("WikiDrawer");
    }
  });

  test("chaque fiche de détail possède une navigation Breadcrumbs", async () => {
    for (const route of detailPageRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("Breadcrumbs");
    }
  });
});
