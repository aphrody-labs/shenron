import "./setup";
import { describe, expect, it } from "bun:test";
import { DatabaseService } from "../src/db/index";
import { WikiService } from "../src/services/WikiService";
import { graphqlHandler } from "../src/api/graphql";
import { publicCachedJson } from "../src/api/server";

const req = () =>
  new Request("http://localhost/api/public/wiki/planets?panne=1") as Request & {
    params: Record<string, string>;
  };

// Une panne de base ne doit jamais devenir un 200 `[]` mis en cache une heure.
describe("lectures wiki : une panne reste une panne", () => {
  // Base sans aucune table : chaque lecture échoue comme sur un réplica cassé.
  const broken = new WikiService(DatabaseService.forPath(":memory:"));

  it("les listes rejettent au lieu de rendre []", async () => {
    await expect(broken.listAll()).rejects.toThrow();
    await expect(broken.listPlanets()).rejects.toThrow();
    await expect(broken.listTransformations()).rejects.toThrow();
    await expect(broken.listRaces()).rejects.toThrow();
    await expect(broken.listTechniques()).rejects.toThrow();
    await expect(broken.listSagas()).rejects.toThrow();
    await expect(broken.listMovies()).rejects.toThrow();
    await expect(broken.listGames()).rejects.toThrow();
    await expect(broken.listTools()).rejects.toThrow();
    await expect(broken.listMangaVolumes("DB")).rejects.toThrow();
    await expect(broken.listNews(5)).rejects.toThrow();
    await expect(broken.search("goku")).rejects.toThrow();
  });

  it("les fiches rejettent au lieu de rendre null (donc 404)", async () => {
    await expect(broken.getCharacter(1)).rejects.toThrow();
    await expect(broken.getPlanet(1)).rejects.toThrow();
    await expect(broken.getRace("saiyan")).rejects.toThrow();
    await expect(broken.getTechnique("kamehameha")).rejects.toThrow();
    await expect(broken.getSaga("saiyan")).rejects.toThrow();
    await expect(broken.getArc("namek")).rejects.toThrow();
    await expect(broken.getEpisodeById(1)).rejects.toThrow();
    await expect(broken.getMovie("1")).rejects.toThrow();
    await expect(broken.getGame("budokai")).rejects.toThrow();
    await expect(broken.getTool("x")).rejects.toThrow();
    await expect(broken.getMangaVolume(1)).rejects.toThrow();
  });

  it("publicCachedJson : 500 sans cache, la requête suivante relit la base", async () => {
    let calls = 0;
    const build = async () => {
      calls += 1;
      if (calls === 1) await broken.listPlanets();
      return { planets: [] };
    };
    const first = await publicCachedJson(req(), 60 * 60_000, build, "127.0.0.1");
    expect(first.status).toBe(500);
    expect(first.headers.get("Cache-Control")).toBeNull();
    expect(await first.json()).toEqual({ error: "internal" });

    const second = await publicCachedJson(req(), 60 * 60_000, build, "127.0.0.1");
    expect(second.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("GraphQL mangaSearch : index FTS absent → erreur, pas une liste vide", async () => {
    const res = await graphqlHandler(
      new Request("http://localhost/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: '{ mangaSearch(q: "kamehameha") { id } }' }),
      }),
    );
    const body = (await res.json()) as {
      data: { mangaSearch: unknown[] } | null;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
    expect(body.data?.mangaSearch ?? null).toBeNull();
    expect(body.errors?.[0]?.message).toBe("Index manga indisponible");
    expect(body.errors?.[0]?.extensions?.code).toBe("SERVICE_UNAVAILABLE");
  });
});
