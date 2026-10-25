import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    battles: async () => [
      {
        id: 1,
        slug: "final-battle",
        title: "Final battle",
        series: "DBZ",
        canon: true,
        combatants: [{ name: "Son Goku" }],
        techniques_used: ["Kamehameha"],
      },
    ],
    tournaments: async () => [
      { id: 2, slug: "cell-games", name: "Cell Games", saga: "Cell", canon: true },
    ],
    timelineEvents: async () => [
      { id: 3, age_year: 775, title: "Demon realm", era: "Daima", canon: false },
      { id: 4, age_year: 779, title: "Undocumented continuity", era: null, canon: false },
    ],
    movies: async () => ({
      movies: [{ id: 5, slug: "movie", title: "Film", series: "DBZ", release_date: 1990 }],
    }),
  },
}));

const { GET } = await import("../src/app/api/wiki/events/route");
const get = async (query: string) => {
  const response = await GET(new NextRequest(`http://localhost:3000/api/wiki/events?${query}`));
  expect(response.status).toBe(200);
  return response.json();
};

describe("wiki event aggregation filters", () => {
  test("movie timeline aliases return the same movie links", async () => {
    const canonical = await get("timeline=movies-dbz");
    const alias = await get("timeline=movies");
    expect(canonical.data.map((item: { href: string }) => item.href)).toEqual([
      "/wiki/movies/movie",
    ]);
    expect(alias.data).toEqual(canonical.data);
  });

  test("the advertised text search finds a battle by technique", async () => {
    const response = await get("q=kamehameha");
    expect(response.data.map((item: { slug: string }) => item.slug)).toEqual(["final-battle"]);
  });

  test("series filters use editorial labels and preserve unresolved continuity", async () => {
    const z = await get("series=DBZ&type=tournament");
    expect(z.data.map((item: { slug: string }) => item.slug)).toEqual(["cell-games"]);
    const daima = await get("series=DB_DAIMA");
    expect(daima.data.map((item: { id: number }) => item.id)).toEqual([3]);
    const superEvents = await get("series=DBS");
    expect(superEvents.total).toBe(0);
    expect(superEvents.facets.series.UNKNOWN).toBe(1);
  });

  test("pagination preserves the filtered total and global facets", async () => {
    const response = await get("series=DBZ&limit=1&page=2");
    expect(response.total).toBe(3);
    expect(response.data).toHaveLength(1);
    expect(response.pageCount).toBe(3);
    expect(response.facets.kinds).toEqual({ battle: 1, tournament: 1, timeline: 3 });
  });
});
