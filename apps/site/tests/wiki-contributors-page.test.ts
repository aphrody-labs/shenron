import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("Sprint 4 — Contributor Detail Pages & Wiring", () => {
  it("la page index /wiki/contributors redirige vers /wiki/staff", () => {
    const filePath = fileURLToPath(
      new URL("../src/app/wiki/contributors/page.tsx", import.meta.url),
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain('redirect("/wiki/staff")');
  });

  it("la page de détail /wiki/contributors/[slug] existe et intègre les composants canoniques", () => {
    const filePath = fileURLToPath(
      new URL("../src/app/wiki/contributors/[slug]/page.tsx", import.meta.url),
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("DomainBar");
    expect(content).toContain("WikiDrawer");
    expect(content).toContain("Breadcrumbs");
    expect(content).toContain("JsonLd");
    expect(content).toContain('slug === "akira-toriyama"');
    expect(content).toContain('redirect("/wiki/toriyama")');
    expect(content).toContain("contributorBySlug");
  });

  it("le hub staff rend le catalogue unifié et intègre le casting dans le hub", () => {
    const filePath = fileURLToPath(new URL("../src/app/wiki/staff/page.tsx", import.meta.url));
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("buildUnifiedStaffCatalog");
    expect(content).toContain("UnifiedStaffExplorer");
    const catalog = readFileSync(
      new URL("../src/lib/unified-staff-catalog.ts", import.meta.url),
      "utf-8",
    );
    expect(catalog).toContain("/wiki/staff#${va.slug}");
  });
});
