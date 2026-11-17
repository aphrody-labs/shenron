import { describe, expect, test } from "bun:test";
import { SITE_SECTIONS, isPathPublic } from "@aphrody/shenron-config/wiki-launch";
import { buildSiteMap, sitemapDestinations } from "@/lib/site-map";
import { publicShellJourneys } from "@/lib/shell-nav";
import { MOBILE_MORE_DESTINATIONS } from "@/lib/site-menu";
import { getDictionary } from "@/lib/i18n";

describe("monetization, billing & member navigation consolidation", () => {
  test("registers /vip and /donations in SITE_SECTIONS as public community routes", () => {
    const vip = SITE_SECTIONS.find((entry) => entry.key === "vip");
    const donations = SITE_SECTIONS.find((entry) => entry.key === "donations");

    expect(vip?.href).toBe("/vip");
    expect(vip?.defaultMode).toBe("public");
    expect(vip?.group).toBe("communaute");

    expect(donations?.href).toBe("/donations");
    expect(donations?.defaultMode).toBe("public");
    expect(donations?.group).toBe("communaute");

    expect(isPathPublic("/vip", { openKeys: [], access: {} })).toBe(true);
    expect(isPathPublic("/donations", { openKeys: [], access: {} })).toBe(true);
  });

  test("includes /vip and /donations in sitemapDestinations, publicShellJourneys, and mobile destinations", () => {
    const sitemapHrefs = sitemapDestinations().map((dest) => dest.href);
    expect(sitemapHrefs).toContain("/vip");
    expect(sitemapHrefs).toContain("/donations");

    const shellHrefs = publicShellJourneys(null).flatMap((journey) =>
      journey.items.map((item) => item.href),
    );
    expect(shellHrefs).toContain("/vip");
    expect(shellHrefs).toContain("/donations");

    const mobileHrefs = MOBILE_MORE_DESTINATIONS.map((dest) => dest.href);
    expect(mobileHrefs).toContain("/vip");
    expect(mobileHrefs).toContain("/donations");
  });

  test("exposes /account/billing and /watchlist in the member space journey of the site map", () => {
    const groups = buildSiteMap({ includeMember: true });
    const memberGroup = groups.find((group) => group.journey.key === "espace");
    expect(memberGroup).toBeDefined();
    const memberHrefs = memberGroup!.items.map((item) => item.href);
    expect(memberHrefs).toContain("/dashboard");
    expect(memberHrefs).toContain("/watchlist");
    expect(memberHrefs).toContain("/favorites");
    expect(memberHrefs).toContain("/account/billing");
    expect(memberHrefs).toContain("/settings");
  });

  test("translates vip, donations, billing, and watchlist categories across fr, en, and ja", () => {
    for (const locale of ["fr", "en", "ja"] as const) {
      const dico = getDictionary(locale);
      for (const key of ["vip", "donations", "billing", "watchlist"] as const) {
        expect(dico.categories[key].label.length).toBeGreaterThan(0);
        expect(dico.categories[key].blurb.length).toBeGreaterThan(0);
      }
    }
  });
});
