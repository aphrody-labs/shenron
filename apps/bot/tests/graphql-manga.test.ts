import "./setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "../src/db/index";
import { graphqlHandler } from "../src/api/graphql";

type GqlBody = {
  data: Record<string, any> | null;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function gql(query: string): Promise<GqlBody> {
  const res = await graphqlHandler(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  return (await res.json()) as GqlBody;
}

beforeAll(() => {
  const { sqlite } = container.resolve(DatabaseService);
  const insert = sqlite.query(
    "INSERT OR REPLACE INTO db_manga_pages (series, tome, planche, lines, text, lang, has_ja, line_count, char_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run("DB", "vol1", 1, '["Kamehameha"]', "Kamehameha", "fr", 0, 1, 10);
  insert.run("DB", "vol1", 2, '["かめはめ波"]', "かめはめ波", "ja", 1, 1, 5);
});

describe("GraphQL manga: volume and page, former tome and planche kept", () => {
  it("mangaVolumes serves the counters under English names", async () => {
    const body = await gql(
      '{ mangaVolumes(series: "DB") { series volume pages lines pagesWithJa } }',
    );
    expect(body.errors).toBeUndefined();
    expect(body.data?.mangaVolumes).toEqual([
      { series: "DB", volume: "vol1", pages: 2, lines: 2, pagesWithJa: 1 },
    ]);
  });

  it("mangaTomes and MangaTome keep answering, deprecated", async () => {
    const body = await gql(
      '{ mangaTomes(series: "DB") { series tome planches lines planchesWithJa } }',
    );
    expect(body.errors).toBeUndefined();
    expect(body.data?.mangaTomes).toEqual([
      { series: "DB", tome: "vol1", planches: 2, lines: 2, planchesWithJa: 1 },
    ]);

    const schema = await gql(
      `{
        query: __type(name: "Query") { fields(includeDeprecated: true) { name isDeprecated deprecationReason } }
        tome: __type(name: "MangaTome") { fields(includeDeprecated: true) { name isDeprecated } }
        volume: __type(name: "MangaVolume") { fields(includeDeprecated: true) { name isDeprecated } }
      }`,
    );
    const introspected = (schema.data ?? {}) as Record<
      string,
      { fields: { name: string; isDeprecated: boolean }[] }
    >;
    const fields = (type: string) =>
      Object.fromEntries(introspected[type]!.fields.map((f) => [f.name, f.isDeprecated]));
    expect(fields("query").mangaTomes).toBe(true);
    expect(fields("query").mangaVolumes).toBe(false);
    expect(fields("tome")).toMatchObject({ tome: true, planches: true, planchesWithJa: true });
    expect(fields("volume")).toMatchObject({ volume: false, pages: false, pagesWithJa: false });
  });

  it("mangaPages and mangaPage take volume/page, and still tome/planche", async () => {
    const current = await gql(
      '{ mangaPages(series: "DB", volume: "vol1") { volume page lang } p: mangaPage(series: "DB", volume: "vol1", page: 2) { volume page text } }',
    );
    expect(current.errors).toBeUndefined();
    expect(current.data?.mangaPages).toEqual([
      { volume: "vol1", page: 1, lang: "fr" },
      { volume: "vol1", page: 2, lang: "ja" },
    ]);
    expect(current.data?.p).toEqual({ volume: "vol1", page: 2, text: "かめはめ波" });

    const legacy = await gql(
      '{ mangaPages(series: "DB", tome: "vol1") { tome planche } p: mangaPage(series: "DB", tome: "vol1", planche: 2) { tome planche } }',
    );
    expect(legacy.errors).toBeUndefined();
    expect(legacy.data?.mangaPages).toEqual([
      { tome: "vol1", planche: 1 },
      { tome: "vol1", planche: 2 },
    ]);
    expect(legacy.data?.p).toEqual({ tome: "vol1", planche: 2 });
  });

  it("refuses a page query that names neither volume nor tome", async () => {
    const body = await gql('{ mangaPages(series: "DB") { page } }');
    expect(body.errors?.[0]?.message).toBe("The argument `volume` is required.");
    expect(body.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    const noPage = await gql('{ mangaPage(series: "DB", volume: "vol1") { page } }');
    expect(noPage.errors?.[0]?.message).toBe("The argument `page` is required.");
  });
});
