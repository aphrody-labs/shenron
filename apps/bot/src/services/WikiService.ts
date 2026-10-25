import { singleton, inject } from "tsyringe";
import { and, asc, desc, eq, like, sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { DatabaseService } from "~/db/index";
import {
  dbCharacters,
  dbCharacterTechniques,
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
} from "~/db/schema";
import { logger } from "~/lib/logger";

/** Ligne publique : le drapeau éditorial `visible` n'est jamais exposé. */
export type Public<T> = Omit<T, "visible">;

export type DBCharacter = Public<typeof dbCharacters.$inferSelect>;
export type DBPlanet = Public<typeof dbPlanets.$inferSelect>;
export type DBTransformation = Public<typeof dbTransformations.$inferSelect>;
export type DBMovie = Public<typeof dbMovies.$inferSelect>;
export type DBTechnique = Public<typeof dbTechniques.$inferSelect>;
export type DBGame = Public<typeof dbGames.$inferSelect>;
export type DBMangaVolume = Public<typeof dbMangaVolumes.$inferSelect>;
export type DBSaga = Public<typeof dbSagas.$inferSelect>;
export type DBArc = Public<typeof dbArcs.$inferSelect>;
export type DBEpisode = Public<typeof dbEpisodes.$inferSelect>;
export type DBMangaChapter = Public<typeof dbMangaChapters.$inferSelect>;
export type DBNews = typeof dbNews.$inferSelect;
export type DBRace = Public<typeof dbRaces.$inferSelect>;
export type DBTool = Public<typeof dbTools.$inferSelect>;

export interface CharacterWithRelations extends DBCharacter {
  transformations: DBTransformation[];
  originPlanet: DBPlanet | null;
  techniques: { characterId: number; techniqueId: number; technique: DBTechnique }[];
}

export type TechniqueWithCreator = DBTechnique & {
  creatorName: string | null;
  creatorImage: string | null;
};

/**
 * Clé d'une fiche : des chiffres désignent l'id (celui que donnent les listes),
 * tout autre texte le slug.
 */
function byIdOrSlug(id: SQLiteColumn, slug: SQLiteColumn, key: string): SQL {
  return /^\d+$/.test(key) ? eq(id, Number(key)) : eq(slug, key);
}

/** Retire `visible` d'une ligne déjà filtrée. */
function publicRow<T extends { visible: boolean }>(row: T): Public<T> {
  const { visible: _visible, ...rest } = row;
  return rest;
}

/**
 * Lectures du wiki dans le réplica SQLite du bot.
 *
 * Suppression logique (SH-P0-004) : chaque lecture, relations comprises, ne
 * rend que les lignes `visible = 1` (colonne garantie par `db/wiki-visibility`),
 * comme le dépôt PostgreSQL de `/api/public/wiki/categories`.
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
   * Liste les outils communautaires visibles.
   */
  async listTools(): Promise<DBTool[]> {
    const rows = await this.db
      .select()
      .from(dbTools)
      .where(eq(dbTools.visible, true))
      .orderBy(desc(dbTools.stars));
    return rows.map(publicRow);
  }

  /**
   * Récupère un outil visible par son id ou son slug, avec son jeu cible s'il est visible.
   */
  async getTool(idOrSlug: string): Promise<(DBTool & { targetGame: DBGame | null }) | null> {
    const [tool] = await this.db
      .select()
      .from(dbTools)
      .where(and(byIdOrSlug(dbTools.id, dbTools.slug, idOrSlug), eq(dbTools.visible, true)))
      .limit(1);
    if (!tool) return null;
    const [game] =
      tool.targetGameId == null
        ? []
        : await this.db
            .select()
            .from(dbGames)
            .where(and(eq(dbGames.id, tool.targetGameId), eq(dbGames.visible, true)))
            .limit(1);
    return { ...publicRow(tool), targetGame: game ? publicRow(game) : null };
  }

  // --- Characters ---

  /**
   * Liste les personnages visibles (local DB, rapide).
   */
  async listAll(): Promise<DBCharacter[]> {
    const rows = await this.db.select().from(dbCharacters).where(eq(dbCharacters.visible, true));
    return rows.map(publicRow);
  }

  /**
   * Recherche fuzzy par nom (partial, case-insensitive) parmi les personnages
   * visibles ; sans `limit`, toutes les correspondances.
   */
  async search(query: string, limit?: number): Promise<DBCharacter[]> {
    const q = query.trim();
    const rows = await this.db
      .select()
      .from(dbCharacters)
      .where(
        q
          ? and(
              eq(dbCharacters.visible, true),
              like(sql`LOWER(${dbCharacters.name})`, `%${q.toLowerCase()}%`),
            )
          : eq(dbCharacters.visible, true),
      )
      .limit(limit ?? -1);
    return rows.map(publicRow);
  }

  /**
   * Récupère un personnage visible avec ses relations visibles (transformations,
   * planète d'origine, techniques).
   */
  async getCharacter(id: number): Promise<CharacterWithRelations | null> {
    const [character] = await this.db
      .select()
      .from(dbCharacters)
      .where(and(eq(dbCharacters.id, id), eq(dbCharacters.visible, true)))
      .limit(1);
    if (!character) return null;
    const [transformations, planets, techniques] = await Promise.all([
      this.db
        .select()
        .from(dbTransformations)
        .where(and(eq(dbTransformations.characterId, id), eq(dbTransformations.visible, true)))
        .orderBy(asc(dbTransformations.id)),
      character.originPlanetId == null
        ? Promise.resolve([])
        : this.db
            .select()
            .from(dbPlanets)
            .where(and(eq(dbPlanets.id, character.originPlanetId), eq(dbPlanets.visible, true)))
            .limit(1),
      this.db
        .select({ link: dbCharacterTechniques, technique: dbTechniques })
        .from(dbCharacterTechniques)
        .innerJoin(
          dbTechniques,
          and(
            eq(dbCharacterTechniques.techniqueId, dbTechniques.id),
            eq(dbTechniques.visible, true),
          ),
        )
        .where(eq(dbCharacterTechniques.characterId, id)),
    ]);
    const planet = planets[0];
    return {
      ...publicRow(character),
      transformations: transformations.map(publicRow),
      originPlanet: planet ? publicRow(planet) : null,
      techniques: techniques.map((r) =>
        Object.assign(r.link, { technique: publicRow(r.technique) }),
      ),
    };
  }

  // --- Transformations ---

  /**
   * Liste les transformations visibles (SSJ, SSJ2, etc.) tous personnages
   * confondus. Exposé en lecture publique pour le site (page wiki dédiée).
   */
  async listTransformations(): Promise<DBTransformation[]> {
    const rows = await this.db
      .select()
      .from(dbTransformations)
      .where(eq(dbTransformations.visible, true));
    return rows.map(publicRow);
  }

  /**
   * Récupère une transformation visible par son id.
   */
  async getTransformation(id: number): Promise<DBTransformation | null> {
    const [row] = await this.db
      .select()
      .from(dbTransformations)
      .where(and(eq(dbTransformations.id, id), eq(dbTransformations.visible, true)))
      .limit(1);
    return row ? publicRow(row) : null;
  }

  // --- Planets ---

  /**
   * Récupère une planète visible par son ID avec ses personnages visibles.
   */
  async getPlanet(id: number): Promise<(DBPlanet & { characters: DBCharacter[] }) | null> {
    const [planet] = await this.db
      .select()
      .from(dbPlanets)
      .where(and(eq(dbPlanets.id, id), eq(dbPlanets.visible, true)))
      .limit(1);
    if (!planet) return null;
    const characters = await this.db
      .select()
      .from(dbCharacters)
      .where(and(eq(dbCharacters.originPlanetId, id), eq(dbCharacters.visible, true)));
    return { ...publicRow(planet), characters: characters.map(publicRow) };
  }

  /**
   * Liste les planètes visibles.
   */
  async listPlanets(): Promise<DBPlanet[]> {
    const rows = await this.db.select().from(dbPlanets).where(eq(dbPlanets.visible, true));
    return rows.map(publicRow);
  }

  // --- Races ---

  /**
   * Liste les races visibles.
   */
  async listRaces(): Promise<DBRace[]> {
    const rows = await this.db.select().from(dbRaces).where(eq(dbRaces.visible, true));
    return rows.map(publicRow);
  }

  /**
   * Récupère une race visible par son id ou son slug avec ses personnages visibles.
   */
  async getRace(idOrSlug: string): Promise<(DBRace & { characters: DBCharacter[] }) | null> {
    const [race] = await this.db
      .select()
      .from(dbRaces)
      .where(and(byIdOrSlug(dbRaces.id, dbRaces.slug, idOrSlug), eq(dbRaces.visible, true)))
      .limit(1);
    if (!race) return null;
    return { ...publicRow(race), characters: await this.listByRace(race.name) };
  }

  /**
   * Liste les personnages visibles d'une race donnée.
   */
  async listByRace(race: string): Promise<DBCharacter[]> {
    const rows = await this.db
      .select()
      .from(dbCharacters)
      .where(and(eq(dbCharacters.race, race), eq(dbCharacters.visible, true)));
    return rows.map(publicRow);
  }

  // --- Techniques ---

  /** Technique + créateur (nom, image) ; un créateur masqué ne prête pas son visuel. */
  private techniquesWithCreator() {
    return this.db
      .select({
        t: dbTechniques,
        creatorName: dbCharacters.name,
        creatorImage: dbCharacters.image,
      })
      .from(dbTechniques)
      .leftJoin(
        dbCharacters,
        and(eq(dbTechniques.creatorId, dbCharacters.id), eq(dbCharacters.visible, true)),
      );
  }

  /**
   * Liste les techniques visibles, enrichies du créateur (nom + image) via un
   * left join sur `db_characters` — les techniques n'ayant pas d'image propre,
   * le portrait du personnage créateur sert de visuel côté site.
   */
  async listTechniques(): Promise<TechniqueWithCreator[]> {
    const rows = await this.techniquesWithCreator().where(eq(dbTechniques.visible, true));
    return rows.map((r) =>
      Object.assign(publicRow(r.t), {
        creatorName: r.creatorName ?? null,
        creatorImage: r.creatorImage ?? null,
      }),
    );
  }

  /**
   * Récupère une technique visible par son id ou son slug.
   */
  async getTechnique(idOrSlug: string): Promise<TechniqueWithCreator | null> {
    const [row] = await this.techniquesWithCreator()
      .where(
        and(
          byIdOrSlug(dbTechniques.id, dbTechniques.slug, idOrSlug),
          eq(dbTechniques.visible, true),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      ...publicRow(row.t),
      creatorName: row.creatorName ?? null,
      creatorImage: row.creatorImage ?? null,
    };
  }

  // --- Narration (Sagas, Arcs, Episodes) ---

  /**
   * Liste les sagas visibles ordonnées.
   */
  async listSagas(): Promise<DBSaga[]> {
    const rows = await this.db
      .select()
      .from(dbSagas)
      .where(eq(dbSagas.visible, true))
      .orderBy(dbSagas.orderIdx);
    return rows.map(publicRow);
  }

  /**
   * Récupère une saga visible (id ou slug) avec ses arcs visibles.
   */
  async getSaga(idOrSlug: string): Promise<(DBSaga & { arcs: DBArc[] }) | null> {
    const [saga] = await this.db
      .select()
      .from(dbSagas)
      .where(and(byIdOrSlug(dbSagas.id, dbSagas.slug, idOrSlug), eq(dbSagas.visible, true)))
      .limit(1);
    if (!saga) return null;
    const arcs = await this.db
      .select()
      .from(dbArcs)
      .where(and(eq(dbArcs.sagaId, saga.id), eq(dbArcs.visible, true)))
      .orderBy(asc(dbArcs.orderIdx));
    return { ...publicRow(saga), arcs: arcs.map(publicRow) };
  }

  /**
   * Liste les arcs visibles, dans l'ordre des sagas puis de la saga.
   */
  async listArcs(): Promise<DBArc[]> {
    const rows = await this.db
      .select()
      .from(dbArcs)
      .where(eq(dbArcs.visible, true))
      .orderBy(asc(dbArcs.sagaId), asc(dbArcs.orderIdx));
    return rows.map(publicRow);
  }

  /**
   * Récupère un arc visible (id ou slug) avec ses épisodes visibles.
   */
  async getArc(idOrSlug: string): Promise<(DBArc & { episodes: DBEpisode[] }) | null> {
    const [arc] = await this.db
      .select()
      .from(dbArcs)
      .where(and(byIdOrSlug(dbArcs.id, dbArcs.slug, idOrSlug), eq(dbArcs.visible, true)))
      .limit(1);
    if (!arc) return null;
    const episodes = await this.db
      .select()
      .from(dbEpisodes)
      .where(and(eq(dbEpisodes.arcId, arc.id), eq(dbEpisodes.visible, true)))
      .orderBy(asc(dbEpisodes.numberInSeries));
    return { ...publicRow(arc), episodes: episodes.map(publicRow) };
  }

  /**
   * Récupère un épisode visible par son ID.
   */
  async getEpisodeById(id: number): Promise<DBEpisode | null> {
    const [episode] = await this.db
      .select()
      .from(dbEpisodes)
      .where(and(eq(dbEpisodes.id, id), eq(dbEpisodes.visible, true)))
      .limit(1);
    return episode ? publicRow(episode) : null;
  }

  /**
   * Récupère un épisode visible par série et numéro.
   */
  async getEpisode(series: string, number: number): Promise<DBEpisode | null> {
    const [episode] = await this.db
      .select()
      .from(dbEpisodes)
      .where(
        and(
          eq(dbEpisodes.series, series),
          eq(dbEpisodes.numberInSeries, number),
          eq(dbEpisodes.visible, true),
        ),
      )
      .limit(1);
    return episode ? publicRow(episode) : null;
  }

  // --- Manga ---

  /**
   * Liste les volumes visibles d'un manga (DB, DBS).
   */
  async listMangaVolumes(series: string): Promise<DBMangaVolume[]> {
    const rows = await this.db
      .select()
      .from(dbMangaVolumes)
      .where(and(eq(dbMangaVolumes.series, series), eq(dbMangaVolumes.visible, true)))
      .orderBy(dbMangaVolumes.volumeNumber);
    return rows.map(publicRow);
  }

  /**
   * Récupère un volume visible avec ses chapitres visibles.
   */
  async getMangaVolume(
    id: number,
  ): Promise<(DBMangaVolume & { chapters: DBMangaChapter[] }) | null> {
    const [volume] = await this.db
      .select()
      .from(dbMangaVolumes)
      .where(and(eq(dbMangaVolumes.id, id), eq(dbMangaVolumes.visible, true)))
      .limit(1);
    if (!volume) return null;
    const chapters = await this.db
      .select()
      .from(dbMangaChapters)
      .where(and(eq(dbMangaChapters.volumeId, id), eq(dbMangaChapters.visible, true)))
      .orderBy(asc(dbMangaChapters.chapterNumber));
    return { ...publicRow(volume), chapters: chapters.map(publicRow) };
  }

  // --- Movies & Games ---

  /**
   * Liste les films visibles.
   */
  async listMovies(): Promise<DBMovie[]> {
    const rows = await this.db.select().from(dbMovies).where(eq(dbMovies.visible, true));
    return rows.map(publicRow);
  }

  /**
   * Récupère un film visible par son id ou son slug.
   */
  async getMovie(idOrSlug: string): Promise<DBMovie | null> {
    const [movie] = await this.db
      .select()
      .from(dbMovies)
      .where(and(byIdOrSlug(dbMovies.id, dbMovies.slug, idOrSlug), eq(dbMovies.visible, true)))
      .limit(1);
    return movie ? publicRow(movie) : null;
  }

  /**
   * Liste les jeux visibles.
   */
  async listGames(): Promise<DBGame[]> {
    const rows = await this.db.select().from(dbGames).where(eq(dbGames.visible, true));
    return rows.map(publicRow);
  }

  /**
   * Récupère un jeu visible par son id ou son slug.
   */
  async getGame(idOrSlug: string): Promise<DBGame | null> {
    const [game] = await this.db
      .select()
      .from(dbGames)
      .where(and(byIdOrSlug(dbGames.id, dbGames.slug, idOrSlug), eq(dbGames.visible, true)))
      .limit(1);
    return game ? publicRow(game) : null;
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
   * Compte les entrées (masquées comprises) dans les tables principales : sert
   * au seed et aux statistiques d'administration, pas aux lectures publiques.
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
