import "./setup";
import { beforeAll, describe, expect, it } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "../src/db/index";
import {
  dbArcs,
  dbGames,
  dbRaces,
  dbSagas,
  dbTechniques,
  dbTools,
  dbTransformations,
} from "../src/db/schema";
import { WikiService } from "../src/services/WikiService";
import { listVisibleEpisodes, numericId, pageParams } from "../src/api/wiki-replica";

// Routes historiques du wiki : une liste et sa fiche viennent du même réplica,
// une fiche se lit par l'id que donne la liste, les bornes ne cèdent jamais.
const dbs = container.resolve(DatabaseService);
const wiki = container.resolve(WikiService);

beforeAll(async () => {
  dbs.sqlite.exec(`CREATE TABLE IF NOT EXISTS db_tools (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL, slug text NOT NULL UNIQUE, name text NOT NULL,
    description text, url text NOT NULL, author text, language text, category text,
    target_game_id integer, stars integer DEFAULT 0, visible integer NOT NULL DEFAULT 1,
    archived integer NOT NULL DEFAULT 0, pushed_at integer, checked_at integer)`);
  const db = dbs.db;
  await db.insert(dbRaces).values([{ id: 7, slug: "saiyan", name: "Saiyan" }]);
  await db.insert(dbTechniques).values([{ id: 8, slug: "kamehameha", name: "Kamehameha" }]);
  await db
    .insert(dbSagas)
    .values([{ id: 9, slug: "saga-freezer", name: "Saga Freezer", series: "DBZ", orderIdx: 2 }]);
  await db.insert(dbArcs).values([
    { id: 10, sagaId: 9, slug: "arc-namek", name: "Arc Namek", orderIdx: 1 },
    { id: 11, sagaId: 9, slug: "arc-ginyu", name: "Arc Ginyu", orderIdx: 2 },
    { id: 12, sagaId: 9, slug: "arc-masque", name: "Arc masqué", orderIdx: 3, visible: false },
  ]);
  await db.insert(dbGames).values([{ id: 13, slug: "budokai", title: "Budokai" }]);
  await db.insert(dbTools).values([{ id: 14, slug: "outil", name: "Outil", url: "https://x.org" }]);
  await db.insert(dbTransformations).values([
    { id: 15, name: "Super Saiyan", image: "ssj.png", characterId: 1 },
    { id: 16, name: "Transformation masquée", image: "x.png", characterId: 1, visible: false },
  ]);
  for (let n = 1; n <= 3; n++) {
    dbs.sqlite
      .query("INSERT INTO db_episodes (series, number_in_series, title) VALUES ('DB', ?, ?)")
      .run(n, `Episode ${n}`);
  }
});

const page = (qs: string) =>
  pageParams(new URLSearchParams(qs), { defaultLimit: 100, maxLimit: 500 });

describe("bornes des listes publiques", () => {
  it("-1, 0 et le non-numérique ne lèvent jamais la limite", () => {
    expect(page("limit=-1")).toEqual({ limit: 1, offset: 0 });
    expect(page("limit=0")).toEqual({ limit: 1, offset: 0 });
    expect(page("limit=abc&offset=xyz")).toEqual({ limit: 100, offset: 0 });
    expect(page("")).toEqual({ limit: 100, offset: 0 });
    expect(page("limit=100000&offset=-5")).toEqual({ limit: 500, offset: 0 });
    expect(page("limit=20&offset=40")).toEqual({ limit: 20, offset: 40 });
  });

  it("la page d'épisodes respecte la borne au lieu de tout renvoyer", () => {
    const { limit, offset } = page("limit=-1");
    const res = listVisibleEpisodes(dbs.sqlite, { series: "DB", limit, offset });
    expect(res.episodes).toHaveLength(1);
    expect(res.total).toBe(3);
  });
});

describe("identifiants des fiches", () => {
  it("un slug ou un nom n'est pas un identifiant numérique (404, pas 400)", () => {
    expect(numericId("12")).toBe(12);
    expect(numericId("son-goku")).toBeNull();
    expect(numericId("12abc")).toBeNull();
    expect(numericId("-3")).toBeNull();
  });

  it("races, techniques, sagas, arcs, jeux et outils se lisent par id ou slug", async () => {
    expect((await wiki.getRace("7"))?.slug).toBe("saiyan");
    expect((await wiki.getRace("saiyan"))?.id).toBe(7);
    expect((await wiki.getTechnique("8"))?.slug).toBe("kamehameha");
    expect((await wiki.getSaga("9"))?.slug).toBe("saga-freezer");
    expect((await wiki.getArc("10"))?.slug).toBe("arc-namek");
    expect((await wiki.getArc("arc-namek"))?.id).toBe(10);
    expect((await wiki.getGame("13"))?.slug).toBe("budokai");
    expect((await wiki.getTool("14"))?.slug).toBe("outil");
    expect(await wiki.getArc("12")).toBeNull();
  });
});

describe("liste et fiche du même réplica", () => {
  it("arcs : la liste vient du réplica, filtrée comme la fiche", async () => {
    expect((await wiki.listArcs()).map((a) => a.slug)).toEqual(["arc-namek", "arc-ginyu"]);
  });

  it("transformations : la fiche suit la liste et son filtre", async () => {
    const listed = (await wiki.listTransformations()).map((t) => t.id);
    expect(listed).toContain(15);
    expect(listed).not.toContain(16);
    expect(await wiki.getTransformation(15)).toMatchObject({ id: 15, name: "Super Saiyan" });
    expect(await wiki.getTransformation(15)).not.toHaveProperty("visible");
    expect(await wiki.getTransformation(16)).toBeNull();
  });
});
