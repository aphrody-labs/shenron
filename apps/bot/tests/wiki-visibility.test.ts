import "./setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { container } from "tsyringe";
import { DatabaseService } from "../src/db/index";
import {
  dbArcs,
  dbCharacters,
  dbCharacterTechniques,
  dbEpisodes,
  dbGames,
  dbMangaChapters,
  dbMangaVolumes,
  dbMovies,
  dbPlanets,
  dbRaces,
  dbSagas,
  dbTechniques,
  dbTools,
  dbTransformations,
} from "../src/db/schema";
import { ensureWikiVisibility, WIKI_VISIBILITY_TABLES } from "../src/db/wiki-visibility";
import { WikiService } from "../src/services/WikiService";
import { countVisibleWiki, listVisibleEpisodes, searchVisibleWiki } from "../src/api/wiki-replica";
import { graphqlHandler } from "../src/api/graphql";

// SH-P0-004 : une fiche masquée (`visible = false` dans PostgreSQL, descendue
// dans le réplica) ne sort par aucune lecture publique du bot.
const dbs = container.resolve(DatabaseService);
const wiki = container.resolve(WikiService);

/** `db_tools` n'a pas de migration SQLite (le réplica la reçoit du reverse-sync). */
const TOOLS_DDL = `CREATE TABLE IF NOT EXISTS db_tools (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL, slug text NOT NULL UNIQUE, name text NOT NULL,
  description text, url text NOT NULL, author text, language text, category text,
  target_game_id integer, stars integer DEFAULT 0, visible integer NOT NULL DEFAULT 1,
  archived integer NOT NULL DEFAULT 0, pushed_at integer, checked_at integer)`;

beforeAll(async () => {
  dbs.sqlite.exec(TOOLS_DDL);
  const db = dbs.db;
  await db.insert(dbPlanets).values([
    { id: 1, name: "Terre", image: "terre.png" },
    { id: 2, name: "Planète masquée", image: "x.png", visible: false },
  ]);
  await db.insert(dbCharacters).values([
    { id: 1, name: "Goku", image: "goku.png", race: "Saiyan", originPlanetId: 2 },
    {
      id: 2,
      name: "Fiche masquée",
      image: "x.png",
      race: "Saiyan",
      originPlanetId: 1,
      visible: false,
    },
    { id: 3, name: "Krillin", image: "krillin.png", race: "Humain", originPlanetId: 1 },
  ]);
  await db.insert(dbTransformations).values([
    { id: 1, name: "Super Saiyan", image: "ssj.png", characterId: 1 },
    { id: 2, name: "Super Saiyan masqué", image: "x.png", characterId: 1, visible: false },
  ]);
  await db.insert(dbTechniques).values([
    { id: 1, slug: "kamehameha", name: "Kamehameha", creatorId: 1 },
    { id: 2, slug: "technique-masquee", name: "Kamehameha masqué", creatorId: 1, visible: false },
    { id: 3, slug: "kienzan", name: "Kienzan", creatorId: 2 },
  ]);
  await db.insert(dbCharacterTechniques).values([
    { characterId: 1, techniqueId: 1 },
    { characterId: 1, techniqueId: 2 },
  ]);
  await db.insert(dbRaces).values([
    { id: 1, slug: "saiyan", name: "Saiyan" },
    { id: 2, slug: "race-masquee", name: "Race masquée", visible: false },
  ]);
  await db.insert(dbSagas).values([
    { id: 1, slug: "saga-saiyan", name: "Saga Saiyan", series: "DBZ", orderIdx: 1 },
    {
      id: 2,
      slug: "saga-masquee",
      name: "Saga masquée",
      series: "DBZ",
      orderIdx: 2,
      visible: false,
    },
  ]);
  await db.insert(dbArcs).values([
    { id: 1, sagaId: 1, slug: "arc-namek", name: "Arc Namek", orderIdx: 1 },
    { id: 2, sagaId: 1, slug: "arc-masque", name: "Arc masqué", orderIdx: 2, visible: false },
  ]);
  await db.insert(dbEpisodes).values([
    { id: 1, series: "DBZ", numberInSeries: 1, title: "Episode un", arcId: 1 },
    { id: 2, series: "DBZ", numberInSeries: 2, title: "Episode masqué", arcId: 1, visible: false },
  ]);
  await db.insert(dbMovies).values([
    { id: 1, slug: "broly", title: "Broly", series: "DBS_MOVIE" },
    { id: 2, slug: "film-masque", title: "Film masqué", series: "DBZ_MOVIE", visible: false },
  ]);
  await db.insert(dbGames).values([
    { id: 1, slug: "budokai", title: "Budokai" },
    { id: 2, slug: "jeu-masque", title: "Jeu masqué", visible: false },
  ]);
  await db.insert(dbTools).values([
    { id: 1, slug: "outil", name: "Outil", url: "https://example.org/a", targetGameId: 2 },
    {
      id: 2,
      slug: "outil-masque",
      name: "Outil masqué",
      url: "https://example.org/b",
      visible: false,
    },
  ]);
  await db.insert(dbMangaVolumes).values([
    { id: 1, series: "DB", volumeNumber: 1, title: "Tome 1" },
    { id: 2, series: "DB", volumeNumber: 2, title: "Tome masqué", visible: false },
  ]);
  await db.insert(dbMangaChapters).values([
    { id: 1, series: "DB", chapterNumber: 1, volumeId: 1 },
    { id: 2, series: "DB", chapterNumber: 2, volumeId: 1, visible: false },
  ]);
});

const names = (rows: { name?: string; title?: string | null }[]) =>
  rows.map((r) => r.name ?? r.title);

describe("ensureWikiVisibility", () => {
  it("ajoute la colonne une seule fois et ignore les tables absentes", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec("CREATE TABLE db_characters (id integer PRIMARY KEY, name text)");
    sqlite.exec("INSERT INTO db_characters (id, name) VALUES (1, 'Goku')");
    expect(ensureWikiVisibility(sqlite)).toEqual(["db_characters"]);
    expect(ensureWikiVisibility(sqlite)).toEqual([]);
    expect(sqlite.query("SELECT visible FROM db_characters").get()).toEqual({ visible: 1 });
  });

  it("le réplica du bot porte la colonne sur chaque table wiki présente", () => {
    for (const table of WIKI_VISIBILITY_TABLES) {
      const cols = dbs.sqlite
        .query<{ name: string }, [string]>("SELECT name FROM pragma_table_info(?)")
        .all(table);
      if (cols.length > 0) expect(cols.map((c) => c.name)).toContain("visible");
    }
  });
});

describe("WikiService : listes et fiches", () => {
  it("les listes excluent les fiches masquées et n'exposent pas le drapeau", async () => {
    const characters = await wiki.listAll();
    expect(names(characters)).toEqual(["Goku", "Krillin"]);
    expect(characters[0]).not.toHaveProperty("visible");
    expect(names(await wiki.listPlanets())).toEqual(["Terre"]);
    expect(names(await wiki.listTransformations())).toEqual(["Super Saiyan"]);
    expect(names(await wiki.listRaces())).toEqual(["Saiyan"]);
    expect(names(await wiki.listTechniques())).toEqual(["Kamehameha", "Kienzan"]);
    expect(names(await wiki.listSagas())).toEqual(["Saga Saiyan"]);
    expect(names(await wiki.listMovies())).toEqual(["Broly"]);
    expect(names(await wiki.listGames())).toEqual(["Budokai"]);
    expect(names(await wiki.listTools())).toEqual(["Outil"]);
    expect(names(await wiki.listMangaVolumes("DB"))).toEqual(["Tome 1"]);
    expect(names(await wiki.search("masqu"))).toEqual([]);
    expect(names(await wiki.listByRace("Saiyan"))).toEqual(["Goku"]);
  });

  it("une fiche masquée est introuvable", async () => {
    expect(await wiki.getCharacter(2)).toBeNull();
    expect(await wiki.getPlanet(2)).toBeNull();
    expect(await wiki.getRace("race-masquee")).toBeNull();
    expect(await wiki.getTechnique("technique-masquee")).toBeNull();
    expect(await wiki.getSaga("saga-masquee")).toBeNull();
    expect(await wiki.getArc("arc-masque")).toBeNull();
    expect(await wiki.getEpisodeById(2)).toBeNull();
    expect(await wiki.getEpisode("DBZ", 2)).toBeNull();
    expect(await wiki.getMovie("film-masque")).toBeNull();
    expect(await wiki.getMovie("2")).toBeNull();
    expect(await wiki.getGame("jeu-masque")).toBeNull();
    expect(await wiki.getTool("outil-masque")).toBeNull();
    expect(await wiki.getMangaVolume(2)).toBeNull();
  });

  it("les relations ne font pas fuir les fiches masquées", async () => {
    const goku = await wiki.getCharacter(1);
    expect(goku).not.toBeNull();
    expect(goku).not.toHaveProperty("visible");
    expect(names(goku!.transformations)).toEqual(["Super Saiyan"]);
    expect(goku!.originPlanet).toBeNull();
    expect(goku!.techniques.map((t) => t.technique.slug)).toEqual(["kamehameha"]);
    expect(goku!.techniques[0]).toMatchObject({ characterId: 1, techniqueId: 1 });

    expect(names((await wiki.getPlanet(1))!.characters)).toEqual(["Krillin"]);
    expect(names((await wiki.getRace("saiyan"))!.characters)).toEqual(["Goku"]);
    expect(names((await wiki.getSaga("saga-saiyan"))!.arcs)).toEqual(["Arc Namek"]);
    expect(names((await wiki.getArc("arc-namek"))!.episodes)).toEqual(["Episode un"]);
    expect((await wiki.getMangaVolume(1))!.chapters.map((c) => c.chapterNumber)).toEqual([1]);
    expect((await wiki.getTool("outil"))!.targetGame).toBeNull();
    // Créateur masqué : la technique reste, sans emprunter son nom ni son portrait.
    const kienzan = (await wiki.listTechniques()).find((t) => t.slug === "kienzan");
    expect(kienzan).toMatchObject({ creatorName: null, creatorImage: null });
    expect(await wiki.getTechnique("kamehameha")).toMatchObject({ creatorName: "Goku" });
  });
});

describe("routes en SQL brut : épisodes, recherche, couverture", () => {
  it("la page d'épisodes et son total ne comptent que le visible", () => {
    const page = listVisibleEpisodes(dbs.sqlite, { series: "DBZ", limit: 10, offset: 0 });
    expect(page.total).toBe(1);
    expect(page.episodes.map((e) => e.title)).toEqual(["Episode un"]);
    expect(page.episodes[0]).not.toHaveProperty("visible");
    expect(listVisibleEpisodes(dbs.sqlite, { series: null, limit: 10, offset: 0 }).total).toBe(1);
  });

  it("la recherche transverse ignore les fiches masquées", () => {
    const hits = searchVisibleWiki(dbs.sqlite, "masqu");
    for (const key of [
      "characters",
      "planets",
      "sagas",
      "movies",
      "games",
      "techniques",
      "transformations",
      "races",
    ] as const) {
      expect(hits[key]).toEqual([]);
    }
    expect(searchVisibleWiki(dbs.sqlite, "Kame").techniques).toHaveLength(1);
  });

  it("la couverture compte les fiches visibles", () => {
    const wikiCounts = countVisibleWiki(dbs.sqlite);
    expect(wikiCounts).toMatchObject({
      db_characters: 2,
      db_planets: 1,
      db_transformations: 1,
      db_races: 1,
      db_techniques: 2,
      db_sagas: 1,
      db_arcs: 1,
      db_episodes: 1,
      db_movies: 1,
      db_games: 1,
      db_manga_volumes: 1,
      db_manga_chapters: 1,
      db_tools: 1,
    });
  });
});

const gql = async (query: string) => {
  const res = await graphqlHandler(
    new Request("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    }),
  );
  return (await res.json()) as { data: Record<string, unknown>; errors?: unknown[] };
};

describe("GraphQL", () => {
  it("listes, fiches, relations et compteurs filtrent le masqué", async () => {
    const { data, errors } = await gql(`{
      characters(limit: 50) { name originPlanet { name } transformations { name } techniques { slug } }
      hidden: character(id: 2) { name }
      planet(id: 1) { natives { name } }
      hiddenPlanet: planet(id: 2) { name }
      sagas { slug }
      movies { slug }
      games { slug }
      races { slug }
      techniques { slug creator { name } }
      transformations { name }
      episodes(series: "DBZ") { title }
      counts { characters planets sagas episodes techniques transformations movies games races }
    }`);
    expect(errors).toBeUndefined();
    expect(data.characters).toEqual([
      {
        name: "Goku",
        originPlanet: null,
        transformations: [{ name: "Super Saiyan" }],
        techniques: [{ slug: "kamehameha" }],
      },
      { name: "Krillin", originPlanet: { name: "Terre" }, transformations: [], techniques: [] },
    ]);
    expect(data.hidden).toBeNull();
    expect(data.hiddenPlanet).toBeNull();
    expect(data.planet).toEqual({ natives: [{ name: "Krillin" }] });
    expect(data.sagas).toEqual([{ slug: "saga-saiyan" }]);
    expect(data.movies).toEqual([{ slug: "broly" }]);
    expect(data.games).toEqual([{ slug: "budokai" }]);
    expect(data.races).toEqual([{ slug: "saiyan" }]);
    expect(data.techniques).toEqual([
      { slug: "kamehameha", creator: { name: "Goku" } },
      { slug: "kienzan", creator: null },
    ]);
    expect(data.transformations).toEqual([{ name: "Super Saiyan" }]);
    expect(data.episodes).toEqual([{ title: "Episode un" }]);
    expect(data.counts).toEqual({
      characters: 2,
      planets: 1,
      sagas: 1,
      episodes: 1,
      techniques: 2,
      transformations: 1,
      movies: 1,
      games: 1,
      races: 1,
    });
  });
});
