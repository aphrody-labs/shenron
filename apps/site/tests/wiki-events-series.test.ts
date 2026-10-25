import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: {
    battles: async () => [],
    tournaments: async () => [],
    timelineEvents: async () => [
      {
        id: 1,
        age_year: 770,
        era: "Époque indéterminée",
        title: "Événement sans série établie",
        title_ja: null,
        canon: true,
        description: null,
        characters_involved: [],
      },
      {
        id: 2,
        age_year: 770,
        era: "Dragon Ball Daima",
        title: "Événement Daima",
        title_ja: null,
        canon: true,
        description: null,
        characters_involved: [],
      },
    ],
    movies: async () => ({ movies: [] }),
  },
}));

const { GET } = await import("../src/app/api/wiki/events/route");
const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("/api/wiki/events series classification", () => {
  test("does not infer DBZ from age and honors an explicit Daima label", async () => {
    const response = await GET(request("/api/wiki/events"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Array<{ id: number; series: string }>;
      facets: { series: Record<string, number> };
    };

    expect(body.data).toEqual([
      expect.objectContaining({ id: 1, series: "UNKNOWN" }),
      expect.objectContaining({ id: 2, series: "DB_DAIMA" }),
    ]);
    expect(body.facets.series).toEqual({ UNKNOWN: 1, DB_DAIMA: 1 });
  });

  test("an unknown chronology record does not match the DBZ filter", async () => {
    const response = await GET(request("/api/wiki/events?series=DBZ"));
    const body = (await response.json()) as { data: unknown[]; total: number };
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });
});
