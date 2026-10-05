import { describe, expect, test } from "bun:test";
import {
  LIBRARY_TABS,
  WORKSHOP_TABS,
  isWorkshopStaffPath,
  libraryTabFor,
  workshopTabFor,
} from "../src/lib/library";
import { staffLegacyRedirect } from "../src/lib/legacy-routes";
import { ALL_ENTRIES } from "../src/lib/wiki-launch";

const siteRoot = new URL("..", import.meta.url).pathname;

/** Route publique d'un `page.tsx` : groupes `(…)` retirés, segments dynamiques gardés. */
const routeOf = (file: string) =>
  `/${file
    .replace(/^src\/app\//, "")
    .replace(/\/?page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .join("/")}`;

describe("espace Bibliothèque", () => {
  test("un onglet par lieu des planches, dans l'ordre de lecture", () => {
    expect(LIBRARY_TABS.map((tab) => tab.href)).toEqual([
      "/wiki/manga",
      "/wiki/databooks",
      "/workshop",
      "/koharu",
    ]);
  });

  test("l'onglet courant se déduit de l'URL, fiches et lecteurs compris", () => {
    expect(libraryTabFor("/wiki/manga")).toBe("/wiki/manga");
    expect(libraryTabFor("/wiki/manga/volume/82")).toBe("/wiki/manga");
    expect(libraryTabFor("/wiki/databooks/4")).toBe("/wiki/databooks");
    expect(libraryTabFor("/workshop/databooks/19")).toBe("/workshop");
    expect(libraryTabFor("/koharu")).toBe("/koharu");
    expect(libraryTabFor("/wiki/mangaka")).toBeNull();
    expect(libraryTabFor("/wiki/characters")).toBeNull();
  });

  test("la relecture d'un ouvrage relève de l'onglet Transcription", () => {
    expect(workshopTabFor("/workshop")).toBe("/workshop");
    expect(workshopTabFor("/workshop/transcription")).toBe("/workshop/transcription");
    expect(workshopTabFor("/workshop/databooks/19")).toBe("/workshop/transcription");
    expect(workshopTabFor("/workshop/translation")).toBe("/workshop/translation");
  });

  test("seule la vue d'ensemble de l'atelier est publique", () => {
    expect(isWorkshopStaffPath("/workshop")).toBe(false);
    expect(isWorkshopStaffPath("/workshop/transcription")).toBe(true);
    expect(isWorkshopStaffPath("/workshop/translation")).toBe(true);
    expect(isWorkshopStaffPath("/workshop/databooks/19")).toBe(true);
    expect(WORKSHOP_TABS.filter((tab) => !tab.staff).map((tab) => tab.href)).toEqual(["/workshop"]);
    for (const tab of WORKSHOP_TABS) expect(isWorkshopStaffPath(tab.href)).toBe(tab.staff);
  });

  test("chaque page staff de l'atelier est gardée par le proxy", () => {
    const pages = [...new Bun.Glob("src/app/workshop/**/page.tsx").scanSync(siteRoot)];
    const staff = pages.filter((file) => file.includes("/(staff)/")).map(routeOf);
    expect(staff.toSorted()).toEqual([
      "/workshop/databooks/[id]",
      "/workshop/transcription",
      "/workshop/translation",
    ]);
    for (const route of staff) expect(isWorkshopStaffPath(route)).toBe(true);
    for (const page of pages.filter((file) => !file.includes("/(staff)/")))
      expect(isWorkshopStaffPath(routeOf(page))).toBe(false);
  });

  test("les anciennes adresses d'administration et de l'atelier mènent à /workshop", () => {
    expect(staffLegacyRedirect("/admin/transcriptions")).toBe("/workshop/transcription");
    expect(staffLegacyRedirect("/admin/databooks")).toBe("/workshop/translation");
    expect(staffLegacyRedirect("/admin/databooks/19")).toBe("/workshop/databooks/19");
    expect(staffLegacyRedirect("/atelier/traduction")).toBe("/workshop/translation");
    expect(staffLegacyRedirect("/atelier/transcription")).toBe("/workshop/transcription");
    expect(staffLegacyRedirect("/atelier/databooks/19")).toBe("/workshop/databooks/19");
    expect(staffLegacyRedirect("/admin/db-universe/databooks")).toBeNull();
    expect(staffLegacyRedirect("/admin/dashboard")).toBeNull();
  });

  test("l'atelier et Koharu sont des rubriques publiques du menu « Manga & Guides »", () => {
    for (const key of ["workshop", "koharu"]) {
      const entry = ALL_ENTRIES.find((e) => e.key === key);
      expect(entry?.group).toBe("archives");
      expect(entry?.defaultMode).toBe("public");
    }
  });

  test("plus aucun écran d'administration ne double l'atelier", async () => {
    for (const legacy of ["transcriptions", "databooks"]) {
      const glob = new Bun.Glob(`src/app/admin/${legacy}/**/page.tsx`);
      expect([...glob.scanSync(siteRoot)]).toEqual([]);
    }
  });
});
