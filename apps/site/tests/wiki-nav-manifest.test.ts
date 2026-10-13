import { describe, expect, test } from "bun:test";
import { WIKI_NAVIGATION_MANIFEST } from "../src/lib/wiki-nav-manifest";
import { GATEABLE_CATEGORIES } from "../src/lib/wiki-launch";
import { publicLegacyRedirect } from "../src/lib/legacy-routes";

describe("wiki-nav-manifest — Manifeste de navigation encyclopédique", () => {
  test("contient toutes les sections fondamentales de l'architecture", () => {
    const groupIds = WIKI_NAVIGATION_MANIFEST.map((g) => g.id);
    expect(groupIds).toContain("library");
    expect(groupIds).not.toContain("manga");
    expect(groupIds).not.toContain("databooks");
    expect(groupIds).toContain("animation");
    expect(groupIds).toContain("events");
    expect(groupIds).toContain("lore");
    expect(groupIds).toContain("meta");
  });

  test("chaque élément possède une route canonique valide et une description", () => {
    for (const group of WIKI_NAVIGATION_MANIFEST) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.items.length).toBeGreaterThan(0);

      for (const item of group.items) {
        expect(item.id).toBeDefined();
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.href).toStartWith("/wiki");
        expect(item.description.length).toBeGreaterThan(0);
      }
    }
  });

  test("les éléments marqués gated correspondent bien à des préfixes refermables", () => {
    const gateablePrefixes = GATEABLE_CATEGORIES.flatMap((c) => c.prefixes);
    for (const group of WIKI_NAVIGATION_MANIFEST) {
      for (const item of group.items) {
        if (item.gated) {
          const matchesPrefix = gateablePrefixes.some((p) => item.href.startsWith(p));
          expect(matchesPrefix).toBe(true);
        }
      }
    }
  });

  test("les routes clés de la refonte sont bien exposées", () => {
    const allHrefs = WIKI_NAVIGATION_MANIFEST.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).toContain("/wiki/manga");
    expect(allHrefs).toContain("/wiki/manga/volume/82");
    expect(allHrefs).toContain("/wiki/databooks");
    expect(allHrefs).toContain("/wiki/events");
    expect(allHrefs).not.toContain("/wiki/novels");
    expect(allHrefs).not.toContain("/wiki/battles");
    expect(allHrefs).not.toContain("/wiki/tournaments");
    expect(allHrefs).not.toContain("/wiki/voice-actors");
    expect(allHrefs).toContain("/wiki/staff");
    expect(allHrefs).toContain("/wiki/toriyama");
  });

  test("les anciennes rubriques restent compatibles via des redirections, sans revenir dans le menu", async () => {
    const nextConfig = await Bun.file(new URL("../next.config.ts", import.meta.url)).text();
    expect(nextConfig).toContain(
      'source: "/wiki/arcs", destination: "/wiki/sagas", permanent: true',
    );
    expect(nextConfig).not.toContain('source: "/wiki/arcs/:path*"');
    expect(
      await Bun.file(new URL("../src/app/wiki/arcs/[slug]/page.tsx", import.meta.url)).exists(),
    ).toBe(true);
    expect(nextConfig).toContain("...nextRedirectsOf(PUBLIC_ROUTE_RENAMES)");
    for (const legacy of ["/wiki/romans", "/wiki/novels", "/wiki/novels/3"])
      expect(publicLegacyRedirect(legacy)).toBe("/wiki/manga");
    for (const legacy of ["/wiki/combats", "/wiki/battles/x", "/wiki/tournois/y"])
      expect(publicLegacyRedirect(legacy)).toBe("/wiki/events");
  });

  test("la recherche générale ne déclenche pas le verdict canonique lexical", async () => {
    const source = await Bun.file(
      new URL("../../../packages/ui/src/public/use-dragon-radar.tsx", import.meta.url),
    ).text();
    const canonFetch = source.indexOf("transport.canon(query, signal)");
    const scopeGuard = source.lastIndexOf('scope === "canon"', canonFetch);
    expect(canonFetch).toBeGreaterThan(-1);
    expect(scopeGuard).toBeGreaterThan(-1);
    expect(source).toContain("transport.search(query, signal)");
  });
});
