import { singleton, inject } from "tsyringe";
import { eq, like, sql, desc } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import {
  dbCharacters,
  dbPlanets,
  dbTransformations,
  dbMovies,
  dbTechniques,
  dbGames,
  dbMangaVolumes,
  dbSagas,
  dbArcs,
  dbEpisodes,
  dbMangaChapters,
  dbNews,
  dbRaces,
  dbTools,
  type DBCharacter,
  type DBPlanet,
  type DBTransformation,
} from "~/db/schema";
import { logger } from "~/lib/logger";

export type { DBCharacter, DBPlanet, DBTransformation };
export type DBMovie = typeof dbMovies.$inferSelect;
export type DBTechnique = typeof dbTechniques.$inferSelect;
export type DBGame = typeof dbGames.$inferSelect;
export type DBMangaVolume = typeof dbMangaVolumes.$inferSelect;
export type DBSaga = typeof dbSagas.$inferSelect;
export type DBArc = typeof dbArcs.$inferSelect;
export type DBEpisode = typeof dbEpisodes.$inferSelect;
export type DBMangaChapter = typeof dbMangaChapters.$inferSelect;
export type DBNews = typeof dbNews.$inferSelect;
export type DBRace = typeof dbRaces.$inferSelect;
export type DBTool = typeof dbTools.$inferSelect;

export interface CharacterWithRelations extends DBCharacter {
  transformations: DBTransformation[];
  originPlanet: DBPlanet | null;
  techniques: { technique: DBTechnique }[];
}

/**
 * Lectures du wiki dans le réplica SQLite du bot.
 *
 * Une erreur de base se propage : une liste vide ou une fiche absente doivent
 * rester des faits, jamais le masque d'une panne. Les routes publiques la
 * rendent en 500 sans la mettre en cache (`publicCachedJson`).
 */
@singleton()
export class WikiService {
  constructor(@inject(DatabaseService) private dbs: DatabaseService) {}

  private get db() {
    return this.dbs.db;
  }

  // --- Tools ---

  /**
   * Liste tous les outils communautaires.
   */
  async listTools(): Promise<DBTool[]> {
    return await this.db.select().from(dbTools).orderBy(desc(dbTools.stars));
  }

  /**
   * Récupère un outil par son slug.
   */
  async getTool(slug: string): Promise<DBTool | null> {
    return (
      (await this.db.query.dbTools.findFirst({
        where: eq(dbTools.slug, slug),
        with: {
          targetGame: true,
        },
      })) ?? null
    );
  }

  // --- Characters ---

  /**
   * Liste tous les personnages (local DB, rapide).
   */
  async listAll(): Promise<DBCharacter[]> {
    return await this.db.select().from(dbCharacters);
  }

  /**
   * Recherche fuzzy par nom (partial, case-insensitive).
   */
  async search(query: string, limit = 25): Promise<DBCharacter[]> {
    const q = query.trim();
    if (!q) return this.db.select().from(dbCharacters).limit(limit);
    return await this.db
      .select()
      .from(dbCharacters)
      .where(like(sql`LOWER(${dbCharacters.name})`, `%${q.toLowerCase()}%`))
      .limit(limit);
  }

  /**
   * Récupère un personnage avec ses relations (transformations, planète, techniques).
   */
  async getCharacter(id: number): Promise<CharacterWithRelations | null> {
    const c = await this.db.query.dbCharacters.findFirst({
      where: eq(dbCharacters.id, id),
      with: {
        transformations: true,
        originPlanet: true,
        techniques: {
          with: {
            technique: true,
          },
        },
      },
    });
    return (c as CharacterWithRelations) ?? null;
  }

  // --- Transformations ---

  /**
   * Liste toutes les transformations (SSJ, SSJ2, etc.) tous personnages
   * confondus. Exposé en lecture publique pour le site (page wiki dédiée).
   */
  async listTransformations(): Promise<DBTransformation[]> {
    return await this.db.select().from(dbTransformations);
  }

  // --- Planets ---

  /**
   * Récupère une planète par son ID avec ses personnages.
   */
  async getPlanet(id: number): Promise<(DBPlanet & { characters: DBCharacter[] }) | null> {
    const p = await this.db.query.dbPlanets.findFirst({
      where: eq(dbPlanets.id, id),
      with: {
        characters: true,
      },
    });
    return p ?? null;
  }

  /**
   * Liste toutes les planètes.
   */
  async listPlanets(): Promise<DBPlanet[]> {
    return await this.db.select().from(dbPlanets);
  }

  // --- Races ---

  /**
   * Liste toutes les races.
   */
  async listRaces(): Promise<DBRace[]> {
    return await this.db.select().from(dbRaces);
  }

  /**
   * Récupère une race par son slug avec ses personnages.
   */
  async getRace(slug: string): Promise<(DBRace & { characters: DBCharacter[] }) | null> {
    const r = await this.db.query.dbRaces.findFirst({
      where: eq(dbRaces.slug, slug),
    });
    if (!r) return null;

    const characters = await this.db
      .select()
      .from(dbCharacters)
      .where(eq(dbCharacters.race, r.name));

    return { ...r, characters };
  }

  /**
   * Liste les personnages d'une race donnée.
   */
  async listByRace(race: string): Promise<DBCharacter[]> {
    return await this.db.select().from(dbCharacters).where(eq(dbCharacters.race, race));
  }

  // --- Techniques ---

  /**
   * Liste toutes les techniques, enrichies du créateur (nom + image) via un
   * left join sur `db_characters` — les techniques n'ayant pas d'image propre,
   * le portrait du personnage créateur sert de visuel côté site.
   */
  async listTechniques(): Promise<
    (DBTechnique & { creatorName: string | null; creatorImage: string | null })[]
  > {
    const rows = await this.db
      .select({
        t: dbTechniques,
        creatorName: dbCharacters.name,
        creatorImage: dbCharacters.image,
      })
      .from(dbTechniques)
      .leftJoin(dbCharacters, eq(dbTechniques.creatorId, dbCharacters.id));
    return rows.map((r) =>
      Object.assign({}, r.t, {
        creatorName: r.creatorName ?? null,
        creatorImage: r.creatorImage ?? null,
      }),
    );
  }

  /**
   * Récupère une technique par son slug.
   */
  async getTechnique(
    slug: string,
  ): Promise<(DBTechnique & { creatorName: string | null; creatorImage: string | null }) | null> {
    const [row] = await this.db
      .select({
        t: dbTechniques,
        creatorName: dbCharacters.name,
        creatorImage: dbCharacters.image,
      })
      .from(dbTechniques)
      .leftJoin(dbCharacters, eq(dbTechniques.creatorId, dbCharacters.id))
      .where(eq(dbTechniques.slug, slug))
      .limit(1);
    if (!row) return null;
    return {
      ...row.t,
      creatorName: row.creatorName ?? null,
      creatorImage: row.creatorImage ?? null,
    };
  }

  // --- Narration (Sagas, Arcs, Episodes) ---

  /**
   * Liste toutes les sagas ordonnées.
   */
  async listSagas(): Promise<DBSaga[]> {
    return await this.db.select().from(dbSagas).orderBy(dbSagas.orderIdx);
  }

  /**
   * Récupère une saga avec ses arcs.
   */
  async getSaga(slug: string): Promise<(DBSaga & { arcs: DBArc[] }) | null> {
    const s = await this.db.query.dbSagas.findFirst({
      where: eq(dbSagas.slug, slug),
      with: {
        arcs: {
          orderBy: (arcs, { asc }) => asc(arcs.orderIdx),
        },
      },
    });
    return s ?? null;
  }

  /**
   * Récupère un arc avec ses épisodes.
   */
  async getArc(slug: string): Promise<(DBArc & { episodes: DBEpisode[] }) | null> {
    const a = await this.db.query.dbArcs.findFirst({
      where: eq(dbArcs.slug, slug),
      with: {
        episodes: {
          orderBy: (ep, { asc }) => asc(ep.numberInSeries),
        },
      },
    });
    return a ?? null;
  }

  /**
   * Récupère un épisode spécifique par son ID.
   */
  async getEpisodeById(id: number): Promise<DBEpisode | null> {
    return (
      (await this.db.query.dbEpisodes.findFirst({
        where: eq(dbEpisodes.id, id),
      })) ?? null
    );
  }

  /**
   * Récupère un épisode spécifique par série et numéro.
   */
  async getEpisode(series: string, number: number): Promise<DBEpisode | null> {
    return (
      (await this.db.query.dbEpisodes.findFirst({
        where: sql`${dbEpisodes.series} = ${series} AND ${dbEpisodes.numberInSeries} = ${number}`,
      })) ?? null
    );
  }

  // --- Manga ---

  /**
   * Liste les volumes d'un manga (DB, DBS).
   */
  async listMangaVolumes(series: string): Promise<DBMangaVolume[]> {
    return await this.db
      .select()
      .from(dbMangaVolumes)
      .where(eq(dbMangaVolumes.series, series))
      .orderBy(dbMangaVolumes.volumeNumber);
  }

  /**
   * Récupère un volume avec ses chapitres.
   */
  async getMangaVolume(
    id: number,
  ): Promise<(DBMangaVolume & { chapters: DBMangaChapter[] }) | null> {
    const v = await this.db.query.dbMangaVolumes.findFirst({
      where: eq(dbMangaVolumes.id, id),
      with: {
        chapters: {
          orderBy: (ch, { asc }) => asc(ch.chapterNumber),
        },
      },
    });
    return v ?? null;
  }

  // --- Movies & Games ---

  /**
   * Liste tous les films.
   */
  async listMovies(): Promise<DBMovie[]> {
    return await this.db.select().from(dbMovies);
  }

  /**
   * Récupère un film par son slug.
   */
  async getMovie(idOrSlug: string): Promise<DBMovie | null> {
    const isId = /^\d+$/.test(idOrSlug);
    return (
      (await this.db.query.dbMovies.findFirst({
        where: isId ? eq(dbMovies.id, Number(idOrSlug)) : eq(dbMovies.slug, idOrSlug),
      })) ?? null
    );
  }

  /**
   * Liste tous les jeux.
   */
  async listGames(): Promise<DBGame[]> {
    return await this.db.select().from(dbGames);
  }

  /**
   * Récupère un jeu par son slug.
   */
  async getGame(slug: string): Promise<DBGame | null> {
    return (
      (await this.db.query.dbGames.findFirst({
        where: eq(dbGames.slug, slug),
      })) ?? null
    );
  }

  // --- News ---

  /**
   * Liste les dernières news.
   */
  async listNews(limit = 10): Promise<DBNews[]> {
    return await this.db.select().from(dbNews).orderBy(desc(dbNews.publishedAt)).limit(limit);
  }

  // --- Stats & Utility ---

  /**
   * Compte les entrées dans les tables principales.
   */
  async count(): Promise<{
    characters: number;
    transformations: number;
    planets: number;
    episodes: number;
    movies: number;
    games: number;
  }> {
    try {
      const [c] = await this.db.select({ n: sql<number>`count(*)` }).from(dbCharacters);
      const [t] = await this.db.select({ n: sql<number>`count(*)` }).from(dbTransformations);
      const [p] = await this.db.select({ n: sql<number>`count(*)` }).from(dbPlanets);
      const [e] = await this.db.select({ n: sql<number>`count(*)` }).from(dbEpisodes);
      const [m] = await this.db.select({ n: sql<number>`count(*)` }).from(dbMovies);
      const [g] = await this.db.select({ n: sql<number>`count(*)` }).from(dbGames);

      return {
        characters: Number(c?.n ?? 0),
        transformations: Number(t?.n ?? 0),
        planets: Number(p?.n ?? 0),
        episodes: Number(e?.n ?? 0),
        movies: Number(m?.n ?? 0),
        games: Number(g?.n ?? 0),
      };
    } catch (err) {
      logger.error({ err }, "WikiService.count failed");
      return {
        characters: 0,
        transformations: 0,
        planets: 0,
        episodes: 0,
        movies: 0,
        games: 0,
      };
    }
  }

  /**
   * Retourne true si la DB est déjà seedée (>0 personnages).
   */
  async isSeeded(): Promise<boolean> {
    const { characters } = await this.count();
    return characters > 0;
  }
}
