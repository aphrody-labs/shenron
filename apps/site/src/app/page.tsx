import type { Metadata } from "next";
import { db } from "@/lib/db";
import {
  getShenronPersonas,
  getShenronStats,
  getShenronLeaderboardResult,
  getShenronPresence,
} from "@/lib/shenron";
import { HomeView } from "@/components/home/HomeView";
import { getCanonConfig, getCanonReferences } from "@/lib/canon-config";
import { getHomeConfig } from "@/lib/home-config";
import { getSagaBestOf } from "@/lib/home-bestof-data";
import { getHomeCommunityTops } from "@/lib/community-tops-data";
import { botSagas, botCharacters } from "@/db/bot-schema";
import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import { listFeed } from "@/lib/feed";
import { ogMeta } from "@/lib/og";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { readMediaCatalog } from "@/lib/media-catalog";
import { pageHero } from "@/lib/banner-config";

/** Editorial selections use ISR; live community state refreshes after hydration. */
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

/** Newest Beerus episode and the aired count, for the hero; null when the series cannot be read. */
async function getBeerusFeature(): Promise<BeerusFeature | null> {
  try {
    const data = await getEpisodesCached(DBS_BEERUS_SERIES_CODE, 200, 0);
    const aired = data.episodes.filter((episode) => !episode.air_date || episode.air_date * 1000 <= Date.now());
    const latest = aired.at(-1) ?? null;
    return {
      total: aired.length,
      latest: latest ? { id: latest.id, number: latest.number_in_series, title: latest.title } : null,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const [
    feed,
    personas,
    stats,
    characters,
    sagas,
    bestof,
    communityTops,
    leaderboard,
    presence,
    config,
    access,
    catalog,
    canonDoctrine,
    canonReferences,
    heroFrame,
    beerus,
  ] = await Promise.all([
    getHomeFeed(),
    getShenronPersonas(900).catch(() => []),
    // 15 min : ces valeurs ne servent qu'à peupler le premier rendu, le suivi
    // temps réel les remplace dès l'hydratation.
    getShenronStats(900),
    getFeaturedCharacters(),
    getSagas(),
    getSagaBestOf(),
    getHomeCommunityTops(),
    getShenronLeaderboardResult(12, true, 900),
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
    pageHero("episodes").catch(() => ""),
    getBeerusFeature(),
  ]);

  return (
    <HomeView
      config={config}
      heroFrame={heroFrame}
      beerus={beerus}
      access={access}
      stats={stats}
      personas={personas.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        online: p.online,
      }))}
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
      topMembers={leaderboard.entries.map((m) => ({
        rank: m.rank,
        discordId: m.discordId,
        username: m.username,
        avatarUrl: m.avatarUrl,
        xp: m.xp,
        level: m.level,
      }))}
      topMembersAvailable={leaderboard.available}
      presence={presence}
      catalog={catalog}
      canon={{ doctrine: canonDoctrine, references: canonReferences.length }}
    />
  );
}
