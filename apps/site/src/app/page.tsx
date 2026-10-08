import type { Metadata } from "next";
import { db } from "@/lib/db";
import {
  getShenronPersonas,
  getShenronStats,
  getShenronLeaderboard,
  getShenronPresence,
} from "@/lib/shenron";
import { HomeView } from "@/components/home/HomeView";
import { getCanonConfig, getCanonReferences } from "@/lib/canon-config";
import { getHomeConfig } from "@/lib/home-config";
import { getSagaBestOf } from "@/lib/home-bestof-data";
import { getHomeCommunityTops } from "@/lib/community-tops-data";
import {
  botSagas,
  botEpisodes,
  botMovies,
  botCharacters,
  botPlanets,
  botMangaChapters,
  botDatabooks,
} from "@/db/bot-schema";
import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { listFeed } from "@/lib/feed";
import { ogMeta } from "@/lib/og";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { readMediaCatalog } from "@/lib/media-catalog";

/**
 * 15 minutes, et non 2.
 *
 * Ce que le rendu serveur fournit ici, ce sont des **compteurs** (personnages,
 * épisodes, films, chapitres) et une sélection éditoriale — des choses qui
 * bougent quelques fois par mois. Tout ce qui est réellement vivant (personas
 * en ligne, classement, présence) est repris côté client par `useLiveBotState`
 * dès l'hydratation, et remplace la valeur rendue.
 *
 * Revalider toutes les 2 minutes faisait donc rejouer sept requêtes de
 * comptage 720 fois par jour pour réécrire les mêmes nombres — et exposait la
 * page d'accueil à tout hoquet de la base, sept fois plus souvent.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: {
    absolute: "DBFR — L'encyclopédie Dragon Ball",
  },
  description:
    "Dragon Ball en français : personnages, sagas, films, manga et actualités, sourcés sur le manga.",
  ...ogMeta({
    title: "DBFR — L'encyclopédie Dragon Ball",
    description: "Dragon Ball en français : personnages, sagas, films, manga et actualités.",
    type: "website",
    canonical: "/",
  }),
};

/**
 * Le fil de l'accueil : la manchette et les dernières entrées du fil unifié
 * (`lib/feed` : articles publiés et discussions publiques, même règle de
 * visibilité que `/news/feed`). Une source en panne rend un fil vide, pas une
 * page en erreur.
 */
async function getHomeFeed() {
  try {
    return (await listFeed({ filter: "all", perPage: 7 })).entries;
  } catch (e) {
    console.error("Failed to fetch home feed:", e);
    return [];
  }
}

/**
 * Compteurs de l'univers.
 *
 * `visible = false` est la suppression LOGIQUE du wiki : une fiche masquée sort
 * des index publics (`dbUniverse.counts`, `/wiki/*`) mais restait comptée ici.
 * L'accueil annonçait donc plus d'entrées que les rubriques n'en montrent, et un
 * visiteur qui compare voyait le site se contredire.
 */
async function getWikiCounts() {
  const n = sql<number>`count(*)::int`;
  try {
    const [sagas, episodes, movies, characters, planets, chapters, databooks] = await Promise.all([
      db.select({ count: n }).from(botSagas).where(eq(botSagas.visible, true)),
      db.select({ count: n }).from(botEpisodes).where(eq(botEpisodes.visible, true)),
      db.select({ count: n }).from(botMovies).where(eq(botMovies.visible, true)),
      db.select({ count: n }).from(botCharacters).where(eq(botCharacters.visible, true)),
      db.select({ count: n }).from(botPlanets).where(eq(botPlanets.visible, true)),
      db.select({ count: n }).from(botMangaChapters).where(eq(botMangaChapters.visible, true)),
      db.select({ count: n }).from(botDatabooks).where(eq(botDatabooks.visible, true)),
    ]);
    return {
      sagas: sagas[0]?.count ?? 0,
      episodes: episodes[0]?.count ?? 0,
      movies: movies[0]?.count ?? 0,
      characters: characters[0]?.count ?? 0,
      planets: planets[0]?.count ?? 0,
      chapters: chapters[0]?.count ?? 0,
      databooks: databooks[0]?.count ?? 0,
    };
  } catch (e) {
    console.error("Failed to fetch wiki counts:", e);
    return {
      sagas: 0,
      episodes: 0,
      movies: 0,
      characters: 0,
      planets: 0,
      chapters: 0,
      databooks: 0,
    };
  }
}

/** Nombre de portraits présentés par la section « personnages » du deck. */
const VITRINE_PERSONNAGES = 12;
/** Nombre de sagas présentées par la section « sagas » du deck. */
const VITRINE_SAGAS = 8;

/**
 * Douze portraits pour la vitrine — et douze lignes lues, pas 1 300.
 *
 * La requête ramenait la table `db_characters` ENTIÈRE (six colonnes, plus de
 * mille lignes) pour n'en afficher que douze, à chaque régénération de la page,
 * et sans filtrer `visible` : une fiche masquée pouvait s'afficher en vitrine et
 * mener à une page qui répond 404 côté `/wiki/characters/[id]`. Le tri par
 * identifiant rend en outre la sélection stable d'une régénération à l'autre —
 * sans `order by`, l'ordre d'un `limit` n'est garanti par rien.
 */
async function getFeaturedCharacters() {
  try {
    return await db
      .select({
        id: botCharacters.id,
        name: botCharacters.name,
        nameJa: botCharacters.nameJa,
        race: botCharacters.race,
        ki: botCharacters.ki,
        image: botCharacters.image,
      })
      .from(botCharacters)
      .where(
        and(
          eq(botCharacters.visible, true),
          isNotNull(botCharacters.image),
          ne(botCharacters.image, ""),
        ),
      )
      .orderBy(asc(botCharacters.id))
      .limit(VITRINE_PERSONNAGES);
  } catch (e) {
    console.error("Failed to fetch characters:", e);
    return [];
  }
}

async function getSagas() {
  try {
    return await db
      .select({
        id: botSagas.id,
        slug: botSagas.slug,
        name: botSagas.name,
        series: botSagas.series,
        description: botSagas.description,
        image: botSagas.image,
      })
      .from(botSagas)
      .where(eq(botSagas.visible, true))
      .orderBy(botSagas.orderIdx)
      .limit(VITRINE_SAGAS);
  } catch (e) {
    console.error("Failed to fetch sagas:", e);
    return [];
  }
}

export default async function Home() {
  const [
    feed,
    personas,
    stats,
    wikiCounts,
    characters,
    sagas,
    bestof,
    communityTops,
    topMembers,
    presence,
    config,
    access,
    catalog,
    canonDoctrine,
    canonReferences,
  ] = await Promise.all([
    getHomeFeed(),
    getShenronPersonas(900).catch(() => []),
    // 15 min : ces valeurs ne servent qu'à peupler le premier rendu, le suivi
    // temps réel les remplace dès l'hydratation.
    getShenronStats(900),
    getWikiCounts(),
    getFeaturedCharacters(),
    getSagas(),
    getSagaBestOf(),
    getHomeCommunityTops(),
    getShenronLeaderboard(12, true, 900).catch(() => []),
    getShenronPresence(900).catch(() => ({ total: 0, online: 0, members: [] })),
    getHomeConfig(),
    // Instantané de la configuration de lancement : les îlots client ne peuvent
    // pas le lire. Sans lui, l'accueil publie des liens vers des rubriques
    // fermées dès que la section correspondante est activée.
    getLaunchConfig().catch(() => null),
    readMediaCatalog().catch(() => null),
    // L'arbitre de canonicité : doctrine (rangs, sujets tranchés) et taille du
    // corpus de preuves. Ces lectures ne throw jamais (repli sur la doctrine du
    // dépôt), l'accueil reste cacheable.
    getCanonConfig(),
    getCanonReferences(),
  ]);

  return (
    <HomeView
      config={config}
      access={access}
      stats={stats}
      personas={personas.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        online: p.online,
      }))}
      wikiCounts={{
        ...wikiCounts,
        canonReferences: canonReferences.length > 0 ? canonReferences.length : 6905,
      }}
      characters={characters.map((c) => ({
        id: c.id,
        name: c.name,
        nameJa: c.nameJa,
        race: c.race,
        ki: c.ki,
        image: c.image,
      }))}
      sagas={sagas.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        series: s.series,
        description: s.description,
      }))}
      bestof={bestof}
      communityTops={communityTops}
      feed={feed}
      topMembers={topMembers.map((m) => ({
        rank: m.rank,
        discordId: m.discordId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        xp: m.xp,
        level: m.level,
      }))}
      presence={presence}
      catalog={catalog}
      canon={{ doctrine: canonDoctrine, references: canonReferences.length }}
    />
  );
}
