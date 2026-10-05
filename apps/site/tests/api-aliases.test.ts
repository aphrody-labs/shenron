/**
 * Anciens chemins d'API en français : le bot, le plugin, le serveur MCP et des
 * clients externes les appellent encore. Ils restent servis par un `rewrite`
 * vers le handler anglais — jamais un 308, qu'un client transformerait en GET
 * pour un POST. Chaque alias doit aboutir sur une route existante qui expose
 * les mêmes méthodes.
 */
import { describe, expect, test } from "bun:test";
import { API_ROUTE_ALIASES } from "../src/lib/legacy-routes";
import { appRoutes, rewriteOf, servingRoute } from "./next-config-routes";

const CASES: Array<[legacy: string, english: string]> = [
  ["/api/chronologie", "/api/timeline"],
  ["/api/chronologie?era=dbz&kind=film", "/api/timeline?era=dbz&kind=film"],
  ["/api/chronologie-config", "/api/timeline-config"],
  ["/api/admin/entites?type=character&q=goku", "/api/admin/entities?type=character&q=goku"],
  ["/api/admin/ia", "/api/admin/ai"],
  ["/api/admin/databooks/campagne", "/api/admin/databooks/campaign"],
  ["/api/databooks/19/textes?pages=1,2", "/api/databooks/19/texts?pages=1%2C2"],
  ["/api/databooks/19/relecture-ocr?planche=12", "/api/databooks/19/ocr-review?planche=12"],
  ["/api/manga/chapter/1421/planche/12", "/api/manga/chapter/1421/pages/12"],
  [
    "/api/manga/chapter/1421/planche/12?format=image",
    "/api/manga/chapter/1421/pages/12?format=image",
  ],
  ["/api/manga/chapter/1421/planche/12/traduction", "/api/manga/chapter/1421/pages/12/translation"],
];

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Chemin d'exemple d'un motif (`:id`, `:n`). */
const sample = (path: string) => path.replace(":id", "19").replace(":n", "12");

async function methodsOf(route: string): Promise<string[]> {
  const file = appRoutes().find((r) => r.route === route && /route\.tsx?$/.test(r.file))?.file;
  if (!file) return [];
  const source = await Bun.file(file).text();
  return METHODS.filter((m) =>
    new RegExp(`export (async function|const|function) ${m}\\b|export \\{[^}]*\\b${m}\\b`).test(
      source,
    ),
  );
}

describe("alias des anciens chemins d'API", () => {
  for (const [legacy, english] of CASES) {
    test(`${legacy} est servi par ${english}`, () => {
      expect(rewriteOf(legacy)).toBe(english);
    });
  }

  test("chaque alias aboutit sur une route qui existe et garde ses méthodes", async () => {
    const routes = API_ROUTE_ALIASES.map((alias) => {
      expect(rewriteOf(sample(alias.from))).toBe(sample(alias.to));
      // Un alias de préfixe (`…/planche`) se vérifie sur un chemin servi (`…/planche/12`).
      const suffix = servingRoute(sample(alias.to)) ? "" : "/12";
      const target = rewriteOf(`${sample(alias.from)}${suffix}`);
      expect(target).toBe(`${sample(alias.to)}${suffix}`);
      const route = servingRoute(target!);
      expect(route, `${alias.to} sans route`).not.toBeNull();
      expect(route!.startsWith("/api/")).toBe(true);
      return route!;
    });
    for (const methods of await Promise.all(routes.map(methodsOf)))
      expect(methods.length).toBeGreaterThan(0);
  });

  test("aucun ancien segment français ne subsiste dans src/app/api", () => {
    const legacy = API_ROUTE_ALIASES.flatMap((a) =>
      a.from.split("/").filter((s) => s && !s.startsWith(":") && !a.to.split("/").includes(s)),
    );
    for (const { route } of appRoutes().filter((r) => r.route.startsWith("/api/"))) {
      for (const segment of route.split("/")) expect(legacy).not.toContain(segment);
    }
  });

  test("les chemins anglais ne sont pas réécrits", () => {
    for (const path of ["/api/timeline", "/api/admin/ai", "/api/manga/chapter/1/pages/2"])
      expect(rewriteOf(path)).toBeNull();
  });
});
