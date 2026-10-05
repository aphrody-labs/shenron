/**
 * Routes en anglais, anciens liens jamais cassés (AGENTS.md, « Langues et noms »).
 *
 * 1. Aucun segment de `src/app/**` ne porte un mot français connu ni un caractère
 *    accentué : un nouveau `src/app/wiki/personnages` ou `src/app/admin/reglages`
 *    ferait échouer ce test. Les exceptions sont nommées, avec leur raison.
 * 2. Chaque ancienne adresse de `lib/legacy-routes.ts` répond par une redirection
 *    vers son équivalent anglais, en un seul saut, sous-chemins et requête gardés,
 *    et cet équivalent est servi par une vraie route de `src/app`.
 */
import { describe, expect, test } from "bun:test";
import {
  API_ROUTE_ALIASES,
  PUBLIC_ROUTE_RENAMES,
  STAFF_ROUTE_RENAMES,
  publicLegacyRedirect,
  staffLegacyRedirect,
} from "../src/lib/legacy-routes";
import { appRoutes, followRedirects, rewriteOf, servingRoute } from "./next-config-routes";

/**
 * Mots français qui ont servi (ou pourraient servir) de segment. Un segment est
 * découpé sur `-` : `campagnes-bxc` est refusé pour `campagnes`.
 */
const FRENCH_WORDS = new Set([
  "accueil",
  "activite",
  "actualites",
  "assistance",
  "atelier",
  "autour",
  "bibliotheque",
  "bientot",
  "boutique",
  "campagne",
  "campagnes",
  "chapitre",
  "chronologie",
  "classement",
  "classements",
  "combats",
  "commandes",
  "commentaires",
  "communaute",
  "concours",
  "confidentialite",
  "contribuer",
  "contributeurs",
  "corriger",
  "cosmologie",
  "creer",
  "entites",
  "evenements",
  "favoris",
  "fil",
  "films",
  "hasard",
  "ia",
  "jeux",
  "lancement",
  "licence",
  "lieux",
  "mes",
  "morpion",
  "musiques",
  "objets",
  "parametres",
  "personnages",
  "pfc",
  "planche",
  "planches",
  "planetes",
  "plan",
  "profil",
  "puissances",
  "recherche",
  "relecture",
  "revue",
  "romans",
  "serie",
  "signalements",
  "textes",
  "tome",
  "tomes",
  "tournois",
  "traduction",
  "ursaf",
  "visibilite",
  "voix",
]);

/**
 * Segments tolérés, chacun avec sa raison. `bureau` est français : il attend le lot
 * « Shenron Studio », qui renomme `/koharu`, `/studio` et `/bureau` ensemble.
 */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  koharu: "nom de code interne, renommé par le lot Shenron Studio",
  studio: "renommé par le lot Shenron Studio",
  bureau: "renommé par le lot Shenron Studio",
};

/** Mots d'un segment de route, crochets, groupes et interceptions retirés. */
function wordsOf(segment: string): string[] {
  return segment
    .replace(/^\(\.+\)/, "")
    .replace(/^[@([]+|[\])]+$/g, "")
    .replace(/^\.\.\./, "")
    .split(/[-_.]/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const routes = appRoutes();

describe("segments de route en anglais", () => {
  test("aucun segment de src/app ne porte un mot français ni un accent", () => {
    const offenders: string[] = [];
    for (const { route } of routes) {
      for (const segment of route.split("/").filter(Boolean)) {
        if (Object.hasOwn(EXCEPTIONS, segment)) continue;
        if (/[^ -~]/.test(segment)) offenders.push(`${route} : « ${segment} » accentué`);
        for (const word of wordsOf(segment))
          if (FRENCH_WORDS.has(word)) offenders.push(`${route} : « ${word} »`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("le découpage reconnaît un segment fautif", () => {
    expect(wordsOf("campagnes-bxc")).toContain("campagnes");
    expect(wordsOf("(staff)")).toEqual(["staff"]);
    expect(wordsOf("[...slug]")).toEqual(["slug"]);
    expect(wordsOf("(.)[slug]")).toEqual(["slug"]);
  });

  test("les exceptions désignent des segments qui existent encore", () => {
    const segments = new Set(routes.flatMap(({ route }) => route.split("/")));
    for (const segment of Object.keys(EXCEPTIONS)) expect(segments.has(segment)).toBe(true);
  });
});

/** Équivalent d'une ancienne adresse, sous-chemin compris. */
const expected = (rule: (typeof PUBLIC_ROUTE_RENAMES)[number], rest: string) =>
  rest && rule.keepRest !== false ? `${rule.restTo ?? rule.to}${rest}` : rule.to;

describe("anciennes adresses publiques : 308 de next.config", () => {
  for (const rule of PUBLIC_ROUTE_RENAMES) {
    test(`${rule.from} → ${rule.to}`, () => {
      const exact = followRedirects(rule.from);
      expect(exact).toEqual({ target: rule.to, hops: 1 });
      expect(servingRoute(rule.to)).not.toBeNull();
      expect(servingRoute(rule.to)).not.toBe("/wiki/[...slug]");
      // La cible anglaise ne redirige plus (rubriques retirées mises à part).
      if (rule.from === (rule.restTo ?? rule.to) || rule.to === "/profile/me") return;
      expect(followRedirects(rule.to).hops).toBe(0);
    });

    if (rule.exact) continue;
    test(`${rule.from}/… garde son sous-chemin et sa requête`, () => {
      const { target, hops } = followRedirects(`${rule.from}/une-fiche?onglet=2`);
      expect(hops).toBe(1);
      expect(target).toBe(`${expected(rule, "/une-fiche")}?onglet=2`);
    });
  }

  test("la table et le proxy donnent la même réponse que next.config", () => {
    for (const rule of PUBLIC_ROUTE_RENAMES) {
      expect(publicLegacyRedirect(rule.from)).toBe(rule.to);
      expect(publicLegacyRedirect(`${rule.from}/`)).toBe(rule.to);
      if (!rule.exact)
        expect(publicLegacyRedirect(`${rule.from}/x/y`)).toBe(expected(rule, "/x/y"));
    }
  });

  test("exemples concrets", () => {
    expect(followRedirects("/wiki/personnages/son-goku").target).toBe("/wiki/characters/son-goku");
    expect(followRedirects("/jeux/morpion").target).toBe("/games/tic-tac-toe");
    expect(followRedirects("/jeux/2048").target).toBe("/games/2048");
    expect(followRedirects("/profil").target).toBe("/profile/me");
    expect(followRedirects("/profil/123456789012345678").target).toBe(
      "/profile/123456789012345678",
    );
    expect(followRedirects("/wiki-bientot?from=%2Fwiki%2Fitems").target).toBe(
      "/coming-soon?from=%2Fwiki%2Fitems",
    );
    expect(followRedirects("/wiki/episodes/serie/DBZ").target).toBe("/wiki/episodes/series/DBZ");
    expect(followRedirects("/wiki/dragon-ball/character/12").target).toBe("/wiki/characters/12");
    expect(followRedirects("/wiki/dragon-ball/planet/3").target).toBe("/wiki/locations");
    expect(followRedirects("/news/fil/discussions/page/2").target).toBe(
      "/news/feed/discussions/page/2",
    );
    // Les outils staff de l'atelier ne sont PAS redirigés par next.config (garde d'abord).
    expect(followRedirects("/atelier/traduction").hops).toBe(0);
    expect(followRedirects("/atelier").target).toBe("/workshop");
  });
});

describe("anciennes adresses staff : 308 du proxy, après la garde", () => {
  for (const rule of STAFF_ROUTE_RENAMES) {
    test(`${rule.from} → ${rule.to}`, () => {
      expect(staffLegacyRedirect(rule.from)).toBe(rule.to);
      const target = rule.to.split("?")[0]!;
      expect(servingRoute(target)).not.toBeNull();
      expect(staffLegacyRedirect(target)).toBeNull();
      // next.config ne les touche pas : la garde du proxy passe en premier.
      expect(followRedirects(rule.from).hops).toBe(0);
    });
  }
});

describe("anciens chemins d'API : rewrites", () => {
  test("chaque alias a son rewrite et sa route", () => {
    for (const alias of API_ROUTE_ALIASES) {
      const from = alias.from.replace(":id", "7").replace(":n", "3");
      const to = alias.to.replace(":id", "7").replace(":n", "3");
      expect(rewriteOf(from)).toBe(to);
      expect(servingRoute(to) ?? servingRoute(`${to}/1`)).not.toBeNull();
    }
  });
});
