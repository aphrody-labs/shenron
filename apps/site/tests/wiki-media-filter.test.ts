import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));

const works = [
  {
    id: 1,
    slug: "dragon-ball",
    title: "Dragon Ball",
    editions: [{ edition: "tankobon" }, { edition: "full_color" }],
  },
];
mock.module("@/lib/db-universe", () => ({
  dbUniverse: { mediaWorks: async () => works },
}));

const { GET } = await import("../src/app/api/wiki/media/route");
const request = (query = "") => new NextRequest(`http://localhost:3000/api/wiki/media${query}`);

describe("wiki media edition filters", () => {
  test("a filtered response preserves all editions for subsequent requests", async () => {
    const filtered = await GET(request("?edition=full_color"));
    expect(filtered.status).toBe(200);
    expect((await filtered.json()).data[0].editions).toEqual([{ edition: "full_color" }]);

    const unfiltered = await GET(request());
    expect((await unfiltered.json()).data[0].editions).toEqual([
      { edition: "tankobon" },
      { edition: "full_color" },
    ]);

    const tankobon = await GET(request("?edition=tankobon"));
    expect((await tankobon.json()).data[0].editions).toEqual([{ edition: "tankobon" }]);
  });

  test("an unmatched edition does not remove editions from the source", async () => {
    const unmatched = await GET(request("?edition=missing"));
    expect((await unmatched.json()).data).toEqual([]);
    expect(works[0]!.editions).toHaveLength(2);
  });
});
