/**
 * graphql.ts — API GraphQL publique du wiki Dragon Ball (read-only).
 *
 * Schéma code-first Pothos + serveur graphql-yoga (fetch-native, monté sur le
 * `Bun.serve` du bot à `/graphql`). Expose les entités wiki (personnages,
 * planètes, sagas, épisodes, techniques, transformations, films, jeux, races),
 * leurs relations, le RAG hybride (`ragSearch`) et les compteurs.
 *
 * Source de données = SQLite local (`DatabaseService.sqlite`), requêtes brutes
 * paramétrées (même pattern que l'API REST). Lecture seule : aucune mutation.
 * Suppression logique (SH-P0-004) : chaque requête du wiki, relations et
 * compteurs compris, ne lit que les lignes `visible = 1` (db/wiki-visibility).
 * Garde-fou anti-abus : limite de profondeur de requête (cycles personnage ↔
 * transformation). GraphiQL activé pour l'exploration.
 */
import SchemaBuilder from "@pothos/core";
import { GraphQLError, type ValidationRule } from "graphql";
import { createYoga } from "graphql-yoga";
import type { Database } from "bun:sqlite";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { logger } from "~/lib/logger";
import { hybridSearch } from "~/lib/rag";

// ── Lignes brutes (colonnes SQLite snake_case) ──────────────────────────────
interface CharacterRow {
  id: number;
  name: string;
  image: string | null;
  ki: string | null;
  max_ki: string | null;
  race: string | null;
  gender: string | null;
  affiliation: string | null;
  description: string | null;
  origin_planet_id: number | null;
  name_ja: string | null;
  name_romaji: string | null;
}
interface PlanetRow {
  id: number;
  name: string;
  image: string | null;
  is_destroyed: number | null;
  description: string | null;
  name_ja: string | null;
  name_romaji: string | null;
}
interface SagaRow {
  id: number;
  slug: string;
  name: string;
  name_ja: string | null;
  series: string | null;
  order_idx: number | null;
  description: string | null;
  image: string | null;
}
interface EpisodeRow {
  id: number;
  series: string;
  number_in_series: number | null;
  title: string;
  title_ja: string | null;
  title_romaji: string | null;
  arc_id: number | null;
  air_date: string | null;
  duration_sec: number | null;
  synopsis: string | null;
  image: string | null;
  mal_id: number | null;
  video_url: string | null;
}
interface TechniqueRow {
  id: number;
  slug: string;
  name: string;
  name_ja: string | null;
  name_romaji: string | null;
  type: string | null;
  creator_id: number | null;
  description: string | null;
  debut_episode_id: number | null;
  debut_chapter_id: number | null;
}
interface TransformationRow {
  id: number;
  name: string;
  image: string | null;
  ki: string | null;
  character_id: number | null;
}
interface MovieRow {
  id: number;
  slug: string;
  title: string;
  title_ja: string | null;
  title_romaji: string | null;
  series: string | null;
  release_date: string | null;
  duration_min: number | null;
  synopsis: string | null;
  poster: string | null;
  mal_id: number | null;
  anilist_id: number | null;
  trailer_url: string | null;
}
interface GameRow {
  id: number;
  slug: string;
  title: string;
  title_ja: string | null;
  platforms: string | null;
  release_date: string | null;
  publisher: string | null;
  developer: string | null;
  description: string | null;
  cover: string | null;
  official_url: string | null;
}
interface RaceRow {
  id: number;
  slug: string;
  name: string;
  name_ja: string | null;
  home_planet_id: number | null;
  description: string | null;
}
interface RagHitRow {
  rowid: number;
  kind: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  sourceId?: string;
  lang?: string;
}

interface GqlContext {
  sqlite: Database;
  charById: (id: number) => CharacterRow | null;
}

// ── Helpers requêtes ────────────────────────────────────────────────────────
const all = <T>(ctx: GqlContext, sql: string, ...p: unknown[]): T[] =>
  ctx.sqlite.query(sql).all(...(p as never[])) as T[];
const one = <T>(ctx: GqlContext, sql: string, ...p: unknown[]): T | null =>
  (ctx.sqlite.query(sql).get(...(p as never[])) as T) ?? null;
const clampLimit = (n: number | null | undefined, def: number, max: number): number =>
  Math.min(Math.max(n ?? def, 1), max);

const builder = new SchemaBuilder<{ Context: GqlContext }>({});

// ── Refs (déclarés avant implémentation pour les relations circulaires) ─────
const Character = builder.objectRef<CharacterRow>("Character");
const Planet = builder.objectRef<PlanetRow>("Planet");
const Saga = builder.objectRef<SagaRow>("Saga");
const Episode = builder.objectRef<EpisodeRow>("Episode");
const Technique = builder.objectRef<TechniqueRow>("Technique");
const Transformation = builder.objectRef<TransformationRow>("Transformation");
const Movie = builder.objectRef<MovieRow>("Movie");
const Game = builder.objectRef<GameRow>("Game");
const Race = builder.objectRef<RaceRow>("Race");
const RagHit = builder.objectRef<RagHitRow>("RagHit");

Character.implement({
  description: "Personnage de l'univers Dragon Ball.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    nameJa: t.string({ nullable: true, resolve: (c) => c.name_ja }),
    nameRomaji: t.string({ nullable: true, resolve: (c) => c.name_romaji }),
    image: t.exposeString("image", { nullable: true }),
    ki: t.exposeString("ki", { nullable: true }),
    maxKi: t.string({ nullable: true, resolve: (c) => c.max_ki }),
    race: t.exposeString("race", { nullable: true }),
    gender: t.exposeString("gender", { nullable: true }),
    affiliation: t.exposeString("affiliation", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    originPlanet: t.field({
      type: Planet,
      nullable: true,
      resolve: (c, _a, ctx) =>
        c.origin_planet_id
          ? one<PlanetRow>(
              ctx,
              "SELECT * FROM db_planets WHERE id=? AND visible = 1",
              c.origin_planet_id,
            )
          : null,
    }),
    transformations: t.field({
      type: [Transformation],
      resolve: (c, _a, ctx) =>
        all<TransformationRow>(
          ctx,
          "SELECT * FROM db_transformations WHERE character_id=? AND visible = 1 ORDER BY id",
          c.id,
        ),
    }),
    techniques: t.field({
      type: [Technique],
      description: "Techniques dont ce personnage est le créateur.",
      resolve: (c, _a, ctx) =>
        all<TechniqueRow>(
          ctx,
          "SELECT * FROM db_techniques WHERE creator_id=? AND visible = 1 ORDER BY name",
          c.id,
        ),
    }),
  }),
});

Planet.implement({
  description: "Planète de l'univers Dragon Ball.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    nameJa: t.string({ nullable: true, resolve: (p) => p.name_ja }),
    nameRomaji: t.string({ nullable: true, resolve: (p) => p.name_romaji }),
    image: t.exposeString("image", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    isDestroyed: t.boolean({ resolve: (p) => Boolean(p.is_destroyed) }),
    natives: t.field({
      type: [Character],
      description: "Personnages originaires de cette planète.",
      resolve: (p, _a, ctx) =>
        all<CharacterRow>(
          ctx,
          "SELECT * FROM db_characters WHERE origin_planet_id=? AND visible = 1 ORDER BY name",
          p.id,
        ),
    }),
  }),
});

Saga.implement({
  description: "Saga / arc narratif.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    nameJa: t.string({ nullable: true, resolve: (s) => s.name_ja }),
    series: t.exposeString("series", { nullable: true }),
    orderIdx: t.int({ nullable: true, resolve: (s) => s.order_idx }),
    description: t.exposeString("description", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
  }),
});

Episode.implement({
  description: "Épisode d'une série Dragon Ball.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    series: t.exposeString("series"),
    numberInSeries: t.exposeInt("number_in_series", { nullable: true }),
    title: t.exposeString("title"),
    titleJa: t.string({ nullable: true, resolve: (e) => e.title_ja }),
    titleRomaji: t.string({ nullable: true, resolve: (e) => e.title_romaji }),
    airDate: t.string({ nullable: true, resolve: (e) => e.air_date }),
    durationSec: t.int({ nullable: true, resolve: (e) => e.duration_sec }),
    synopsis: t.exposeString("synopsis", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    malId: t.int({ nullable: true, resolve: (e) => e.mal_id }),
    videoUrl: t.string({ nullable: true, resolve: (e) => e.video_url }),
  }),
});

Technique.implement({
  description: "Technique / capacité de combat.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    nameJa: t.string({ nullable: true, resolve: (x) => x.name_ja }),
    nameRomaji: t.string({ nullable: true, resolve: (x) => x.name_romaji }),
    type: t.exposeString("type", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    creator: t.field({
      type: Character,
      nullable: true,
      resolve: (x, _a, ctx) => (x.creator_id ? ctx.charById(x.creator_id) : null),
    }),
  }),
});

Transformation.implement({
  description: "Transformation (Super Saiyan, etc.).",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    image: t.exposeString("image", { nullable: true }),
    ki: t.exposeString("ki", { nullable: true }),
    character: t.field({
      type: Character,
      nullable: true,
      resolve: (x, _a, ctx) => (x.character_id ? ctx.charById(x.character_id) : null),
    }),
  }),
});

Movie.implement({
  description: "Film Dragon Ball.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    slug: t.exposeString("slug"),
    title: t.exposeString("title"),
    titleJa: t.string({ nullable: true, resolve: (m) => m.title_ja }),
    series: t.exposeString("series", { nullable: true }),
    releaseDate: t.string({ nullable: true, resolve: (m) => m.release_date }),
    durationMin: t.int({ nullable: true, resolve: (m) => m.duration_min }),
    synopsis: t.exposeString("synopsis", { nullable: true }),
    poster: t.exposeString("poster", { nullable: true }),
    trailerUrl: t.string({ nullable: true, resolve: (m) => m.trailer_url }),
  }),
});

Game.implement({
  description: "Jeu vidéo Dragon Ball.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    slug: t.exposeString("slug"),
    title: t.exposeString("title"),
    titleJa: t.string({ nullable: true, resolve: (g) => g.title_ja }),
    platforms: t.exposeString("platforms", { nullable: true }),
    releaseDate: t.string({ nullable: true, resolve: (g) => g.release_date }),
    publisher: t.exposeString("publisher", { nullable: true }),
    developer: t.exposeString("developer", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    cover: t.exposeString("cover", { nullable: true }),
    officialUrl: t.string({ nullable: true, resolve: (g) => g.official_url }),
  }),
});

Race.implement({
  description: "Race / espèce.",
  fields: (t) => ({
    id: t.exposeInt("id"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    nameJa: t.string({ nullable: true, resolve: (r) => r.name_ja }),
    description: t.exposeString("description", { nullable: true }),
    homePlanet: t.field({
      type: Planet,
      nullable: true,
      resolve: (r, _a, ctx) =>
        r.home_planet_id
          ? one<PlanetRow>(
              ctx,
              "SELECT * FROM db_planets WHERE id=? AND visible = 1",
              r.home_planet_id,
            )
          : null,
    }),
  }),
});

RagHit.implement({
  description: "Résultat de recherche RAG hybride.",
  fields: (t) => ({
    rowid: t.exposeInt("rowid", {
      description: "rowid du chunk RAG (déréférençable, ex. character(id: rowid)).",
    }),
    kind: t.exposeString("kind"),
    title: t.exposeString("title"),
    url: t.exposeString("url"),
    snippet: t.exposeString("snippet"),
    score: t.exposeFloat("score", {
      description:
        "Pertinence normalisée [0,1], comparable uniquement au sein de cette réponse et du même mode.",
    }),
    sourceId: t.string({
      nullable: true,
      description: "Corpus d'origine (db_characters, manga, databooks, canon_references…).",
      resolve: (h) => h.sourceId ?? null,
    }),
    lang: t.string({ nullable: true, description: "fr | en | ja", resolve: (h) => h.lang ?? null }),
  }),
});

const RagResult = builder.objectRef<{ mode: string; results: RagHitRow[] }>("RagResult").implement({
  fields: (t) => ({
    mode: t.exposeString("mode", { description: "hybrid+rerank | hybrid | lexical" }),
    results: t.field({ type: [RagHit], resolve: (r) => r.results }),
  }),
});

const Counts = builder.objectRef<Record<string, number>>("Counts").implement({
  fields: (t) => ({
    characters: t.int({ resolve: (c) => c.characters ?? 0 }),
    planets: t.int({ resolve: (c) => c.planets ?? 0 }),
    sagas: t.int({ resolve: (c) => c.sagas ?? 0 }),
    episodes: t.int({ resolve: (c) => c.episodes ?? 0 }),
    techniques: t.int({ resolve: (c) => c.techniques ?? 0 }),
    transformations: t.int({ resolve: (c) => c.transformations ?? 0 }),
    movies: t.int({ resolve: (c) => c.movies ?? 0 }),
    games: t.int({ resolve: (c) => c.games ?? 0 }),
    races: t.int({ resolve: (c) => c.races ?? 0 }),
  }),
});

// ── Manga (transcriptions OCR des planches, bilingue FR+JP) ──────────────────
interface MangaPageRow {
  id: number;
  series: string;
  tome: string;
  planche: number;
  lines: string; // JSON sérialisé en SQLite
  text: string;
  lang: string;
  has_ja: number;
  line_count: number;
  char_count: number;
}

const MangaPage = builder.objectRef<MangaPageRow>("MangaPage").implement({
  description: "Planche de manga transcrite (OCR PaddleOCR, bilingue FR+JP).",
  fields: (t) => ({
    id: t.exposeInt("id"),
    series: t.exposeString("series"),
    volume: t.exposeString("tome", { description: "Volume key (vol1, ch1321, t901)." }),
    page: t.exposeInt("planche", { description: "Page number inside the volume." }),
    tome: t.exposeString("tome", { deprecationReason: "Use `volume`." }),
    planche: t.exposeInt("planche", { deprecationReason: "Use `page`." }),
    lang: t.exposeString("lang"),
    hasJa: t.boolean({ resolve: (p) => !!p.has_ja }),
    lineCount: t.exposeInt("line_count"),
    text: t.exposeString("text"),
    lines: t.stringList({
      description: "Bulles OCR en ordre de lecture.",
      resolve: (p) => {
        try {
          return JSON.parse(p.lines) as string[];
        } catch {
          return [];
        }
      },
    }),
  }),
});

/** One transcribed manga volume (or chapter) and its counters. */
interface MangaVolumeRow {
  series: string;
  volume: string;
  pages: number;
  lines: number;
  pages_ja: number;
}

const MangaVolume = builder.objectRef<MangaVolumeRow>("MangaVolume").implement({
  description: "Tome/chapitre manga transcrit + compteurs.",
  fields: (t) => ({
    series: t.exposeString("series"),
    volume: t.exposeString("volume", { description: "Volume key (vol1, ch1321, t901)." }),
    pages: t.int({ resolve: (r) => r.pages }),
    lines: t.int({ resolve: (r) => r.lines }),
    pagesWithJa: t.int({ resolve: (r) => r.pages_ja }),
  }),
});

/** @deprecated Former name of {@link MangaVolume}, kept until 1.4.0. */
const MangaTome = builder.objectRef<MangaVolumeRow>("MangaTome").implement({
  description: "Deprecated: use MangaVolume. Tome/chapitre manga transcrit + compteurs.",
  fields: (t) => ({
    series: t.exposeString("series"),
    tome: t.exposeString("volume", { deprecationReason: "Use `MangaVolume.volume`." }),
    planches: t.int({
      deprecationReason: "Use `MangaVolume.pages`.",
      resolve: (r) => r.pages,
    }),
    lines: t.int({ resolve: (r) => r.lines }),
    planchesWithJa: t.int({
      deprecationReason: "Use `MangaVolume.pagesWithJa`.",
      resolve: (r) => r.pages_ja,
    }),
  }),
});

/** Counters per volume, shared by `mangaVolumes` and its deprecated alias `mangaTomes`. */
function mangaVolumeRows(ctx: GqlContext, series: string | null | undefined): MangaVolumeRow[] {
  return all<MangaVolumeRow>(
    ctx,
    `SELECT series, tome AS volume, COUNT(*) AS pages, SUM(line_count) AS lines, SUM(has_ja) AS pages_ja FROM db_manga_pages ${series ? "WHERE series=?" : ""} GROUP BY series, tome ORDER BY series, tome`,
    ...(series ? [series] : []),
  );
}

/** `volume` is the argument; the former `tome` is still read when `volume` is absent. */
function requireVolume(volume: string | null | undefined, tome: string | null | undefined): string {
  const value = volume ?? tome;
  if (!value) {
    throw new GraphQLError("The argument `volume` is required.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return value;
}

/** `page` is the argument; the former `planche` is still read when `page` is absent. */
function requirePage(page: number | null | undefined, planche: number | null | undefined): number {
  const value = page ?? planche;
  if (value === null || value === undefined) {
    throw new GraphQLError("The argument `page` is required.", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return value;
}

// ── Query root ──────────────────────────────────────────────────────────────
builder.queryType({
  fields: (t) => ({
    character: t.field({
      type: Character,
      nullable: true,
      args: { id: t.arg.int({ required: true }) },
      resolve: (_r, a, ctx) => ctx.charById(a.id),
    }),
    characters: t.field({
      type: [Character],
      args: {
        limit: t.arg.int(),
        offset: t.arg.int(),
        search: t.arg.string(),
        race: t.arg.string(),
      },
      resolve: (_r, a, ctx) => {
        const limit = clampLimit(a.limit, 20, 100);
        const offset = Math.max(a.offset ?? 0, 0);
        const where: string[] = ["visible = 1"];
        const params: unknown[] = [];
        if (a.search) {
          where.push("(name LIKE ? OR name_ja LIKE ? OR name_romaji LIKE ?)");
          params.push(`%${a.search}%`, `%${a.search}%`, `%${a.search}%`);
        }
        if (a.race) {
          where.push("race = ?");
          params.push(a.race);
        }
        const w = `WHERE ${where.join(" AND ")}`;
        return all<CharacterRow>(
          ctx,
          `SELECT * FROM db_characters ${w} ORDER BY name LIMIT ? OFFSET ?`,
          ...params,
          limit,
          offset,
        );
      },
    }),
    planet: t.field({
      type: Planet,
      nullable: true,
      args: { id: t.arg.int({ required: true }) },
      resolve: (_r, a, ctx) =>
        one<PlanetRow>(ctx, "SELECT * FROM db_planets WHERE id=? AND visible = 1", a.id),
    }),
    planets: t.field({
      type: [Planet],
      args: { limit: t.arg.int(), offset: t.arg.int() },
      resolve: (_r, a, ctx) =>
        all<PlanetRow>(
          ctx,
          "SELECT * FROM db_planets WHERE visible = 1 ORDER BY name LIMIT ? OFFSET ?",
          clampLimit(a.limit, 50, 200),
          Math.max(a.offset ?? 0, 0),
        ),
    }),
    saga: t.field({
      type: Saga,
      nullable: true,
      args: { id: t.arg.int(), slug: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.slug
          ? one<SagaRow>(ctx, "SELECT * FROM db_sagas WHERE slug=? AND visible = 1", a.slug)
          : a.id != null
            ? one<SagaRow>(ctx, "SELECT * FROM db_sagas WHERE id=? AND visible = 1", a.id)
            : null,
    }),
    sagas: t.field({
      type: [Saga],
      args: { series: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.series
          ? all<SagaRow>(
              ctx,
              "SELECT * FROM db_sagas WHERE series=? AND visible = 1 ORDER BY order_idx",
              a.series,
            )
          : all<SagaRow>(ctx, "SELECT * FROM db_sagas WHERE visible = 1 ORDER BY order_idx"),
    }),
    episode: t.field({
      type: Episode,
      nullable: true,
      args: { id: t.arg.int({ required: true }) },
      resolve: (_r, a, ctx) =>
        one<EpisodeRow>(ctx, "SELECT * FROM db_episodes WHERE id=? AND visible = 1", a.id),
    }),
    episodes: t.field({
      type: [Episode],
      args: { series: t.arg.string(), limit: t.arg.int(), offset: t.arg.int() },
      resolve: (_r, a, ctx) => {
        const limit = clampLimit(a.limit, 30, 100);
        const offset = Math.max(a.offset ?? 0, 0);
        return a.series
          ? all<EpisodeRow>(
              ctx,
              "SELECT * FROM db_episodes WHERE series=? AND visible = 1 ORDER BY number_in_series LIMIT ? OFFSET ?",
              a.series,
              limit,
              offset,
            )
          : all<EpisodeRow>(
              ctx,
              "SELECT * FROM db_episodes WHERE visible = 1 ORDER BY series, number_in_series LIMIT ? OFFSET ?",
              limit,
              offset,
            );
      },
    }),
    technique: t.field({
      type: Technique,
      nullable: true,
      args: { id: t.arg.int(), slug: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.slug
          ? one<TechniqueRow>(
              ctx,
              "SELECT * FROM db_techniques WHERE slug=? AND visible = 1",
              a.slug,
            )
          : a.id != null
            ? one<TechniqueRow>(ctx, "SELECT * FROM db_techniques WHERE id=? AND visible = 1", a.id)
            : null,
    }),
    techniques: t.field({
      type: [Technique],
      args: { type: t.arg.string(), limit: t.arg.int() },
      resolve: (_r, a, ctx) => {
        const limit = clampLimit(a.limit, 50, 200);
        return a.type
          ? all<TechniqueRow>(
              ctx,
              "SELECT * FROM db_techniques WHERE type=? AND visible = 1 ORDER BY name LIMIT ?",
              a.type,
              limit,
            )
          : all<TechniqueRow>(
              ctx,
              "SELECT * FROM db_techniques WHERE visible = 1 ORDER BY name LIMIT ?",
              limit,
            );
      },
    }),
    transformations: t.field({
      type: [Transformation],
      args: { characterId: t.arg.int() },
      resolve: (_r, a, ctx) =>
        a.characterId != null
          ? all<TransformationRow>(
              ctx,
              "SELECT * FROM db_transformations WHERE character_id=? AND visible = 1 ORDER BY id",
              a.characterId,
            )
          : all<TransformationRow>(
              ctx,
              "SELECT * FROM db_transformations WHERE visible = 1 ORDER BY name",
            ),
    }),
    movie: t.field({
      type: Movie,
      nullable: true,
      args: { id: t.arg.int(), slug: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.slug
          ? one<MovieRow>(ctx, "SELECT * FROM db_movies WHERE slug=? AND visible = 1", a.slug)
          : a.id != null
            ? one<MovieRow>(ctx, "SELECT * FROM db_movies WHERE id=? AND visible = 1", a.id)
            : null,
    }),
    movies: t.field({
      type: [Movie],
      resolve: (_r, _a, ctx) =>
        all<MovieRow>(ctx, "SELECT * FROM db_movies WHERE visible = 1 ORDER BY release_date"),
    }),
    game: t.field({
      type: Game,
      nullable: true,
      args: { id: t.arg.int(), slug: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.slug
          ? one<GameRow>(ctx, "SELECT * FROM db_games WHERE slug=? AND visible = 1", a.slug)
          : a.id != null
            ? one<GameRow>(ctx, "SELECT * FROM db_games WHERE id=? AND visible = 1", a.id)
            : null,
    }),
    games: t.field({
      type: [Game],
      args: { limit: t.arg.int() },
      resolve: (_r, a, ctx) =>
        all<GameRow>(
          ctx,
          "SELECT * FROM db_games WHERE visible = 1 ORDER BY release_date LIMIT ?",
          clampLimit(a.limit, 60, 200),
        ),
    }),
    race: t.field({
      type: Race,
      nullable: true,
      args: { id: t.arg.int(), slug: t.arg.string() },
      resolve: (_r, a, ctx) =>
        a.slug
          ? one<RaceRow>(ctx, "SELECT * FROM db_races WHERE slug=? AND visible = 1", a.slug)
          : a.id != null
            ? one<RaceRow>(ctx, "SELECT * FROM db_races WHERE id=? AND visible = 1", a.id)
            : null,
    }),
    races: t.field({
      type: [Race],
      resolve: (_r, _a, ctx) =>
        all<RaceRow>(ctx, "SELECT * FROM db_races WHERE visible = 1 ORDER BY name"),
    }),
    ragSearch: t.field({
      type: RagResult,
      description: "Recherche RAG hybride (BM25 + embeddings denses, fusion RRF, rerank).",
      args: {
        q: t.arg.string({ required: true }),
        limit: t.arg.int(),
        lang: t.arg.string({ description: "fr | en | ja" }),
        entity: t.arg.string({ description: "Entité canonique (ex. Vegeta)" }),
        sourceId: t.arg.string({ description: "Corpus (db_characters, manga, databooks…)" }),
        kind: t.arg.string({ description: "Type de passage (character, manga_page, canon…)" }),
      },
      resolve: async (_r, a, ctx) => {
        const limit = clampLimit(a.limit, 8, 25);
        const { results, mode } = await hybridSearch(ctx.sqlite, a.q, limit, {
          lang: a.lang ?? undefined,
          entity: a.entity ?? undefined,
          sourceId: a.sourceId ?? undefined,
          kind: a.kind ?? undefined,
        });
        return { mode, results: results as unknown as RagHitRow[] };
      },
    }),
    mangaVolumes: t.field({
      type: [MangaVolume],
      description: "Tomes/chapitres manga transcrits + compteurs.",
      args: { series: t.arg.string() },
      resolve: (_r, a, ctx) => mangaVolumeRows(ctx, a.series),
    }),
    mangaTomes: t.field({
      type: [MangaTome],
      description: "Deprecated: use mangaVolumes.",
      deprecationReason: "Use `mangaVolumes`.",
      args: { series: t.arg.string() },
      resolve: (_r, a, ctx) => mangaVolumeRows(ctx, a.series),
    }),
    mangaPages: t.field({
      type: [MangaPage],
      description: "Planches d'un tome (ordre de lecture).",
      args: {
        series: t.arg.string({ required: true }),
        volume: t.arg.string({ description: "Volume key (vol1, ch1321, t901). Required." }),
        tome: t.arg.string({ deprecationReason: "Use `volume`." }),
        limit: t.arg.int(),
        offset: t.arg.int(),
      },
      resolve: (_r, a, ctx) =>
        all<MangaPageRow>(
          ctx,
          "SELECT * FROM db_manga_pages WHERE series=? AND tome=? ORDER BY planche LIMIT ? OFFSET ?",
          a.series,
          requireVolume(a.volume, a.tome),
          clampLimit(a.limit, 60, 400),
          Math.max(a.offset ?? 0, 0),
        ),
    }),
    mangaPage: t.field({
      type: MangaPage,
      nullable: true,
      args: {
        series: t.arg.string({ required: true }),
        volume: t.arg.string({ description: "Volume key (vol1, ch1321, t901). Required." }),
        page: t.arg.int({ description: "Page number inside the volume. Required." }),
        tome: t.arg.string({ deprecationReason: "Use `volume`." }),
        planche: t.arg.int({ deprecationReason: "Use `page`." }),
      },
      resolve: (_r, a, ctx) =>
        one<MangaPageRow>(
          ctx,
          "SELECT * FROM db_manga_pages WHERE series=? AND tome=? AND planche=?",
          a.series,
          requireVolume(a.volume, a.tome),
          requirePage(a.page, a.planche),
        ),
    }),
    mangaSearch: t.field({
      type: [MangaPage],
      description: "Recherche plein-texte FTS5 (bilingue FR+JP) sur les planches.",
      args: { q: t.arg.string({ required: true }), series: t.arg.string(), limit: t.arg.int() },
      resolve: (_r, a, ctx) => {
        const tokens = a.q
          .split(/\s+/)
          .filter((x) => x.length > 1)
          .map((x) => `"${x.replace(/"/g, "")}"`);
        if (!tokens.length) return [];
        const params: (string | number)[] = [tokens.join(" OR ")];
        let sql =
          "SELECT p.* FROM db_manga_pages p JOIN manga_pages_fts ON manga_pages_fts.rowid = p.id WHERE manga_pages_fts MATCH ?";
        if (a.series) {
          sql += " AND p.series=?";
          params.push(a.series);
        }
        sql += " ORDER BY rank LIMIT ?";
        params.push(clampLimit(a.limit, 20, 100));
        try {
          return all<MangaPageRow>(ctx, sql, ...params);
        } catch (err) {
          // Index FTS absent ou cassé : une panne, pas une recherche sans résultat
          // (même règle que `/api/public/manga/search`, qui répond 503).
          // `originalError` ferait masquer le message par yoga : l'erreur SQLite
          // part dans le journal, le client reçoit le code.
          logger.error({ err }, "graphql mangaSearch: manga_pages_fts query failed");
          throw new GraphQLError("Index manga indisponible", {
            extensions: { code: "SERVICE_UNAVAILABLE" },
          });
        }
      },
    }),
    counts: t.field({
      type: Counts,
      description: "Compteurs par entité du wiki.",
      resolve: (_r, _a, ctx) => {
        const c = (table: string) =>
          one<{ n: number }>(ctx, `SELECT COUNT(*) n FROM ${table} WHERE visible = 1`)?.n ?? 0;
        return {
          characters: c("db_characters"),
          planets: c("db_planets"),
          sagas: c("db_sagas"),
          episodes: c("db_episodes"),
          techniques: c("db_techniques"),
          transformations: c("db_transformations"),
          movies: c("db_movies"),
          games: c("db_games"),
          races: c("db_races"),
        };
      },
    }),
  }),
});

const schema = builder.toSchema();

/**
 * Règle de validation : profondeur de sélection maximale (anti-abus — le schéma
 * a des cycles personnage ↔ transformation/technique). On compte les noeuds
 * `SelectionSet` dans la chaîne d'ancêtres de chaque champ.
 */
function maxDepthRule(max: number): ValidationRule {
  return (context) => ({
    Field(node, _key, _parent, _path, ancestors) {
      let depth = 0;
      for (const a of ancestors) {
        if (a && typeof a === "object" && (a as { kind?: string }).kind === "SelectionSet") depth++;
      }
      if (depth > max) {
        context.reportError(
          new GraphQLError(`Requête trop profonde (max ${max}). Simplifie la sélection.`, {
            nodes: [node],
          }),
        );
      }
    },
  });
}

// ── Serveur yoga monté sur /graphql ─────────────────────────────────────────
let yoga: ReturnType<typeof createYoga<GqlContext>> | null = null;

function getYoga() {
  yoga ??= createYoga<GqlContext>({
    schema,
    graphqlEndpoint: "/graphql",
    landingPage: false,
    graphiql: { title: "Shenron GraphQL — Dragon Ball France" },
    cors: { origin: "*", methods: ["GET", "POST", "OPTIONS"] },
    plugins: [
      {
        onValidate({ addValidationRule }: { addValidationRule: (r: ValidationRule) => void }) {
          addValidationRule(maxDepthRule(10));
        },
      },
    ],
  });
  return yoga;
}

/** Handler `/graphql` pour le `Bun.serve` du bot. */
export function graphqlHandler(req: Request): Response | Promise<Response> {
  const sqlite = container.resolve(DatabaseService).sqlite;
  const charCache = new Map<number, CharacterRow | null>();
  const ctx: GqlContext = {
    sqlite,
    charById: (id) => {
      if (charCache.has(id)) return charCache.get(id) ?? null;
      const row = one<CharacterRow>(
        { sqlite, charById: () => null },
        "SELECT * FROM db_characters WHERE id=? AND visible = 1",
        id,
      );
      charCache.set(id, row);
      return row;
    },
  };
  return getYoga().handleRequest(req, ctx);
}
