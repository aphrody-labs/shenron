import { describe, expect, mock, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { endpoints } from "@shenron/api/contract";
import { isWikiCategoryName } from "@shenron/db/constants";

// `/api/timeline` annonce pour chaque entrée une API de fiche : elle doit
// mener à une route réelle, pas à `/api/episodes/{id}` (seul `/download` existe).
mock.module("server-only", () => ({}));
mock.module("@/lib/chronology-config", () => ({
  getChronologyConfig: async () => ({ version: 1, eraOrder: [], overrides: {} }),
}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    timeline: async () =>
      [
        {
          kind: "episode",
          id: 5,
          href: "/wiki/episodes/5",
          title: "Ep",
          series: "DBZ",
          era: "DBZ",
        },
        {
          kind: "movie",
          id: 7,
          href: "/wiki/movies/broly",
          title: "Broly",
          series: "DBS",
          era: "Super",
        },
        {
          kind: "manga",
          id: 3,
          href: "/wiki/manga/volume/3",
          title: "T3",
          series: "DB",
          era: "Manga",
        },
      ].map((it) =>
        Object.assign(
          { titleJa: null, number: null, date: null, image: null, hasVf: false, hasVostfr: false },
          it,
        ),
      ),
  },
}));

const { GET } = await import("../src/app/api/timeline/route");

const APP = join(import.meta.dir, "..", "src", "app");

/** Résout un chemin sur l'arbre App Router : dossier littéral, `[param]` ou `[...route]`. */
function routeFile(pathname: string): string | null {
  let dir = APP;
  const segments = pathname.split("/").filter(Boolean);
  for (const [i, segment] of segments.entries()) {
    if (existsSync(join(dir, segment))) {
      dir = join(dir, segment);
      continue;
    }
    const entries = readdirSync(dir);
    const catchAll = entries.find((e) => e.startsWith("[..."));
    if (catchAll)
      return existsSync(join(dir, catchAll, "route.ts")) ? segments.slice(i).join("/") : null;
    const param = entries.find((e) => /^\[[^.]/.test(e));
    if (!param) return null;
    dir = join(dir, param);
  }
  return existsSync(join(dir, "route.ts")) ? "route.ts" : null;
}

describe("/api/timeline : liens d'API", () => {
  test("chaque `api` mène à une route servie", async () => {
    const res = await GET(new Request("http://localhost/api/timeline"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entrees: { kind: string; id: number; api: string }[] };
    expect(body.entrees).toHaveLength(3);
    for (const entry of body.entrees) {
      const { pathname } = new URL(entry.api);
      expect(pathname).not.toMatch(/^\/api\/(episodes|movies)\/\d+$/);
      const served = routeFile(pathname);
      expect(served, pathname).not.toBeNull();
      if (served !== "route.ts") {
        // Repli `@shenron/api` : fiche du contrat `/api/public/wiki/{category}/{idOrSlug}`.
        expect(endpoints.wikiEntity.path).toBe("/api/public/wiki/{category}/{idOrSlug}");
        const [category, id] = served!.split("/").slice(-2);
        expect(isWikiCategoryName(category)).toBe(true);
        expect(id).toBe(String(entry.id));
      }
    }
    const byKind = Object.fromEntries(body.entrees.map((e) => [e.kind, new URL(e.api).pathname]));
    expect(byKind).toEqual({
      episode: "/api/public/wiki/episodes/5",
      movie: "/api/public/wiki/movies/7",
      manga: "/api/manga/volume/3",
    });
  });
});
