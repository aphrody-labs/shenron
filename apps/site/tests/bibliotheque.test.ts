import { describe, expect, test } from "bun:test";
import {
  ATELIER_TABS,
  BIBLIOTHEQUE_TABS,
  atelierRedirect,
  atelierTabFor,
  bibliothequeTabFor,
  isAtelierStaffPath,
} from "../src/lib/bibliotheque";
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
    expect(BIBLIOTHEQUE_TABS.map((tab) => tab.href)).toEqual([
      "/wiki/manga",
      "/wiki/databooks",
      "/atelier",
      "/koharu",
    ]);
  });

  test("l'onglet courant se déduit de l'URL, fiches et lecteurs compris", () => {
    expect(bibliothequeTabFor("/wiki/manga")).toBe("/wiki/manga");
    expect(bibliothequeTabFor("/wiki/manga/volume/82")).toBe("/wiki/manga");
    expect(bibliothequeTabFor("/wiki/databooks/4")).toBe("/wiki/databooks");
    expect(bibliothequeTabFor("/atelier/databooks/19")).toBe("/atelier");
    expect(bibliothequeTabFor("/koharu")).toBe("/koharu");
    expect(bibliothequeTabFor("/wiki/mangaka")).toBeNull();
    expect(bibliothequeTabFor("/wiki/personnages")).toBeNull();
  });

  test("la relecture d'un ouvrage relève de l'onglet Transcription", () => {
    expect(atelierTabFor("/atelier")).toBe("/atelier");
    expect(atelierTabFor("/atelier/transcription")).toBe("/atelier/transcription");
    expect(atelierTabFor("/atelier/databooks/19")).toBe("/atelier/transcription");
    expect(atelierTabFor("/atelier/traduction")).toBe("/atelier/traduction");
  });

  test("seule la vue d'ensemble de l'atelier est publique", () => {
    expect(isAtelierStaffPath("/atelier")).toBe(false);
    expect(isAtelierStaffPath("/atelier/transcription")).toBe(true);
    expect(isAtelierStaffPath("/atelier/traduction")).toBe(true);
    expect(isAtelierStaffPath("/atelier/databooks/19")).toBe(true);
    expect(ATELIER_TABS.filter((tab) => !tab.staff).map((tab) => tab.href)).toEqual(["/atelier"]);
    for (const tab of ATELIER_TABS) expect(isAtelierStaffPath(tab.href)).toBe(tab.staff);
  });

  test("chaque page staff de l'atelier est gardée par le proxy", () => {
    const pages = [...new Bun.Glob("src/app/atelier/**/page.tsx").scanSync(siteRoot)];
    const staff = pages.filter((file) => file.includes("/(staff)/")).map(routeOf);
    expect(staff.toSorted()).toEqual([
      "/atelier/databooks/[id]",
      "/atelier/traduction",
      "/atelier/transcription",
    ]);
    for (const route of staff) expect(isAtelierStaffPath(route)).toBe(true);
    for (const page of pages.filter((file) => !file.includes("/(staff)/")))
      expect(isAtelierStaffPath(routeOf(page))).toBe(false);
  });

  test("les anciennes adresses d'administration mènent à l'atelier", () => {
    expect(atelierRedirect("/admin/transcriptions")).toBe("/atelier/transcription");
    expect(atelierRedirect("/admin/databooks")).toBe("/atelier/traduction");
    expect(atelierRedirect("/admin/databooks/19")).toBe("/atelier/databooks/19");
    expect(atelierRedirect("/admin/db-universe/databooks")).toBeNull();
    expect(atelierRedirect("/admin/dashboard")).toBeNull();
  });

  test("l'atelier et Koharu sont des rubriques publiques du menu « Manga & Guides »", () => {
    for (const key of ["atelier", "koharu"]) {
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
