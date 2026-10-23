import "reflect-metadata";
import "./wiki-write-guard";
import { container } from "tsyringe";
import { botFile } from "~/lib/asset-files";
import type { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { dbCharacters, dbPlanets, dbTransformations } from "~/db/schema";
import { WikiService } from "~/services/WikiService";
import { logger } from "~/lib/logger";
import {
  EMPTY_INDEX,
  enrichmentGate,
  fetchAnilistChars,
  indexAnilist,
  NAME_OVERRIDES,
  PLANET_OVERRIDES,
  planCharacterEnrichment,
  planPlanetEnrichment,
} from "./anilist-enrichment";
import { resolveBotDatabaseUrl } from "./pg-url";

/**
 * dragonball-api.com est une base de fans : elle amorce les fiches (noms,
 * images, rattachements), jamais leurs chiffres. Ses `ki` / `maxKi` ne
 * viennent d'aucune source primaire et ne sont pas enregistrés.
 */
const BASE = "https://dragonball-api.com/api";
const LOCAL_IMG_ROOT = "./assets/dbz";

interface RemoteChar {
  id: number;
  name: string;
  /** Valeur de fans, ignorée (cf. `BASE`). */
  ki: string;
  /** Valeur de fans, ignorée (cf. `BASE`). */
  maxKi: string;
  race: string;
  gender: string;
  description: string;
  image: string;
  affiliation: string;
  originPlanet?: { id: number };
  transformations?: Array<{
    id: number;
    name: string;
    ki: string;
    image: string;
  }>;
}

interface RemotePlanet {
  id: number;
  name: string;
  isDestroyed: boolean;
  description: string;
  image: string;
}

function remapImage(
  remoteUrl: string,
  subdir: "characters" | "planetas" | "transformaciones",
): string {
  const m = remoteUrl.match(/\/([^/]+\.(?:webp|png|jpg))(?:\?.*)?$/i);
  if (!m) return remoteUrl;
  const filename = decodeURIComponent(m[1]!);
  const localPath = `${LOCAL_IMG_ROOT}/${subdir}/${filename}`;
  if (existsSync(botFile(localPath))) return localPath;
  return remoteUrl;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const first = await fetchJson<{ items: T[]; meta: { totalPages: number } }>(`${path}?limit=100`);
  const all = [...first.items];
  for (let p = 2; p <= first.meta.totalPages; p++) {
    const next = await fetchJson<{ items: T[] }>(`${path}?limit=100&page=${p}`);
    all.push(...next.items);
  }
  return all;
}

export type WikiSeedResult = {
  skipped: boolean;
  planets: number;
  characters: number;
  transformations: number;
  imgMapped: number;
  imgMissing: number;
  enriched: number;
};

/* ─── Enrichissement AniList (noms 日本語 + romaji) : cf. anilist-enrichment.ts ─── */

/** Marque (guild_settings) du dernier passage complet : pas de nouveau passage avant 7 jours. */
export const ENRICHMENT_MARK_KEY = "wiki.anilist_enriched_at";

export function readEnrichmentMark(sqlite: Database): number | null {
  const row = sqlite
    .query("SELECT value FROM guild_settings WHERE key = ?1")
    .get(ENRICHMENT_MARK_KEY) as { value: string } | null;
  const at = Number(row?.value);
  return Number.isFinite(at) && at > 0 ? at : null;
}

export function writeEnrichmentMark(sqlite: Database, at: number) {
  sqlite
    .query(
      "INSERT INTO guild_settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(ENRICHMENT_MARK_KEY, String(at), at);
}

async function enrichCharactersWithAnilist(
  log: (m: string) => void,
  { replicaFed }: { replicaFed: boolean },
): Promise<number> {
  const dbs = container.resolve(DatabaseService);
  const db = dbs.db;

  const gate = enrichmentGate({
    replicaFed,
    lastCompleteRunAt: readEnrichmentMark(dbs.sqlite),
    now: Date.now(),
  });
  if (!gate.run) {
    log(`  enrichment AniList ignoré : ${gate.reason}`);
    return 0;
  }

  const characters = await db.select().from(dbCharacters);
  const planets = await db.select().from(dbPlanets);

  // Explicit overrides first: the network is only worth it for rows they do not settle.
  let plan = planCharacterEnrichment(characters, NAME_OVERRIDES, EMPTY_INDEX);
  let complete = true;
  if (plan.unmatched > 0) {
    log("→ Fetching AniList Dragon Ball characters…");
    const fetched = await fetchAnilistChars({ log });
    const index = indexAnilist(fetched.chars);
    complete = fetched.truncated.length === 0;
    log(
      `  ${index.byName.size} noms indexés (${fetched.requests} requêtes)${
        complete ? "" : ` — INCOMPLET : ${fetched.truncated.join("; ")}`
      }`,
    );
    plan = planCharacterEnrichment(characters, NAME_OVERRIDES, index);
  }
  for (const u of plan.updates) {
    await db
      .update(dbCharacters)
      .set({ nameJa: u.nameJa, nameRomaji: u.nameRomaji })
      .where(eq(dbCharacters.id, u.id));
  }
  log(
    `✓ characters: ${plan.updates.length} enrichis, ${plan.alreadyComplete} déjà complets, ${plan.unmatched} sans correspondance (${characters.length} au total)`,
  );

  const planetPlan = planPlanetEnrichment(planets, PLANET_OVERRIDES);
  for (const u of planetPlan.updates) {
    await db
      .update(dbPlanets)
      .set({ nameJa: u.nameJa, nameRomaji: u.nameRomaji })
      .where(eq(dbPlanets.id, u.id));
  }
  log(
    `✓ planets: ${planetPlan.updates.length} enrichies, ${planetPlan.alreadyComplete} déjà complètes, ${planetPlan.unmatched} sans correspondance (${planets.length} au total)`,
  );

  // A truncated fetch must not postpone the next attempt by a week.
  if (complete) writeEnrichmentMark(dbs.sqlite, Date.now());
  return plan.updates.length + planetPlan.updates.length;
}

/**
 * Idempotent par défaut : skip si déjà seedé. `force: true` purge + reseed.
 * Réutilisable depuis le bot boot pour self-healing après perte de bot.db.
 */
export async function runWikiSeed(
  opts: {
    force?: boolean;
    log?: (msg: string) => void;
    /** PostgreSQL feeds this replica (default: a PostgreSQL URL is configured). */
    replicaFed?: boolean;
  } = {},
): Promise<WikiSeedResult> {
  const log = opts.log ?? ((m: string) => logger.info(m));
  const replicaFed = opts.replicaFed ?? resolveBotDatabaseUrl() !== null;
  const dbs = container.resolve(DatabaseService);
  const wiki = container.resolve(WikiService);
  const db = dbs.db;

  if (!opts.force && (await wiki.isSeeded())) {
    log("wiki seed: déjà présent, skip dragonball-api fetch");
    const enriched = await enrichCharactersWithAnilist(log, { replicaFed }).catch((err) => {
      log(`  enrichment AniList échoué (non-fatal): ${err}`);
      return 0;
    });
    const counts = await wiki.count();
    return {
      skipped: true,
      planets: counts.planets,
      characters: counts.characters,
      transformations: counts.transformations,
      imgMapped: 0,
      imgMissing: 0,
      enriched,
    };
  }

  log("→ Fetching planets…");
  const planets = await fetchAll<RemotePlanet>("/planets");
  log(`  ${planets.length} planets`);

  log("→ Fetching characters (list)…");
  const chars = await fetchAll<RemoteChar>("/characters");
  log(`  ${chars.length} characters`);

  if (opts.force) {
    await db.delete(dbTransformations);
    await db.delete(dbCharacters);
    await db.delete(dbPlanets);
  }

  for (const p of planets) {
    await db
      .insert(dbPlanets)
      .values({
        id: p.id,
        name: p.name,
        image: remapImage(p.image, "planetas"),
        isDestroyed: p.isDestroyed,
        description: p.description,
      })
      .onConflictDoNothing();
  }
  log(`✓ ${planets.length} planets inserted`);

  let totalTransfos = 0;
  let imgMapped = 0;
  let imgMissing = 0;

  for (const c of chars) {
    const full = await fetchJson<RemoteChar>(`/characters/${c.id}`);
    const localImg = remapImage(full.image, "characters");
    if (localImg.startsWith(LOCAL_IMG_ROOT)) imgMapped++;
    else imgMissing++;

    await db
      .insert(dbCharacters)
      .values({
        id: full.id,
        name: full.name,
        image: localImg,
        ki: null,
        maxKi: null,
        race: full.race,
        gender: full.gender,
        affiliation: full.affiliation,
        description: full.description,
        originPlanetId: full.originPlanet?.id ?? null,
      })
      .onConflictDoNothing();

    for (const t of full.transformations ?? []) {
      const tImg = remapImage(t.image, "transformaciones");
      if (tImg.startsWith(LOCAL_IMG_ROOT)) imgMapped++;
      else imgMissing++;
      await db
        .insert(dbTransformations)
        .values({
          id: t.id,
          name: t.name,
          image: tImg,
          ki: null,
          characterId: full.id,
        })
        .onConflictDoNothing();
      totalTransfos++;
    }
  }

  log(`✓ ${chars.length} characters + ${totalTransfos} transformations inserted`);
  log(`  Images mapped locally: ${imgMapped}, fallback network: ${imgMissing}`);

  const enriched = await enrichCharactersWithAnilist(log, { replicaFed }).catch((err) => {
    log(`  enrichment AniList échoué (non-fatal): ${err}`);
    return 0;
  });

  // L'enrichissement des descriptions depuis un dump Fandom FR a été retiré :
  // Fandom est une source interdite pour rédiger (cf. CLAUDE.md). Les descriptions
  // viennent désormais des seules sources éditoriales licites (manga, databooks,
  // AniList/Jikan pour les métadonnées).

  return {
    skipped: false,
    planets: planets.length,
    characters: chars.length,
    transformations: totalTransfos,
    imgMapped,
    imgMissing,
    enriched,
  };
}

// CLI standalone : `bun src/db/seed-wiki.ts [--force]`
if (import.meta.main) {
  const force = process.argv.includes("--force");
  runWikiSeed({ force, log: console.log })
    .then(() => {
      const dbs = container.resolve(DatabaseService);
      return dbs.close();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
