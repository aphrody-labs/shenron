import { describe, expect, test } from "bun:test";

const detailPageRoutes = [
  "../src/app/wiki/arcs/[slug]/page.tsx",
  "../src/app/wiki/locations/[slug]/page.tsx",
  "../src/app/wiki/characters/[slug]/page.tsx",
  "../src/app/wiki/techniques/[slug]/page.tsx",
  "../src/app/wiki/transformations/[slug]/page.tsx",
  "../src/app/wiki/databooks/[id]/page.tsx",
];

describe("Sprint 4 — Universal Navigation & Drawer Wiring on Detail Pages", () => {
  test("chaque fiche de détail d'entité intègre DomainBar et WikiDrawer", async () => {
    for (const route of detailPageRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("DomainBar");
      expect(source).toContain("WikiDrawer");
    }
  });

  test("chaque fiche de détail possède une navigation Breadcrumbs", async () => {
    for (const route of detailPageRoutes) {
      const source = await Bun.file(new URL(route, import.meta.url)).text();
      expect(source).toContain("Breadcrumbs");
    }
  });
});
