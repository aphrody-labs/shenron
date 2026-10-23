/**
 * AniList enrichment of the wiki characters and planets: Japanese names and romaji.
 *
 * Pure planning (what to write, what is already there, what found no match) is kept apart
 * from the network and from the database, so it is testable offline. `seed-wiki.ts` owns the
 * writes (it carries the replica write guard); this module imports nothing from the bot runtime.
 *
 * Why the job reported `0/1311 enriched` in production (2026-10-23):
 *  - the media list held `21893`, which AniList resolves to a Gundam film, not Dragon Ball Super;
 *  - the fetch stopped silently on the first non-200 answer (AniList allows 30 requests per
 *    minute) and was capped at 8 pages of 25, so 187 names were indexed out of ~1000;
 *  - the counters only counted rows changed in this run, so "already complete" and "no match"
 *    both read as failure;
 *  - and it wrote into the SQLite replica, which the PostgreSQL reverse-sync (every 15 min)
 *    replaces wholesale: names written there cannot survive. See `enrichmentGate`.
 */

export const ANILIST_URL = "https://graphql.anilist.co";

/**
 * AniList anime that hold Dragon Ball characters. Identifiers verified against the API on
 * 2026-10-23 (`Media(id:)` titles); `pages` bounds the requests per title (50 per page).
 */
export const ANILIST_MEDIA = [
  { id: 223, title: "Dragon Ball", pages: 10 },
  { id: 813, title: "Dragon Ball Z", pages: 10 },
  { id: 225, title: "Dragon Ball GT", pages: 10 },
  { id: 21175, title: "Dragon Ball Super", pages: 10 },
  { id: 101302, title: "Dragon Ball Super: Broly", pages: 2 },
  { id: 133898, title: "Dragon Ball Super: Super Hero", pages: 2 },
  { id: 170083, title: "Dragon Ball DAIMA", pages: 4 },
] as const;

export const ANILIST_PAGE_SIZE = 50;
/** AniList's documented limit is 30 requests per minute. */
export const ANILIST_MIN_INTERVAL_MS = 2_100;
const ANILIST_RETRY_AFTER_MAX_S = 90;
/** A complete run is not repeated before this delay. */
export const ENRICHMENT_MIN_AGE_MS = 7 * 24 * 3_600_000;

export type AnilistChar = {
  name: { full: string; native: string | null; userPreferred: string };
};

/**
 * Overrides explicites pour les divergences nomenclature dragonball-api (ES)
 * vs AniList (EN/JP canon). Clés = nom dragonball-api normalisé.
 */
export const NAME_OVERRIDES: Record<string, { ja: string; romaji: string }> = {
  // Personnages avec divergences nomenclature ES → EN/JP canon
  celula: { ja: "セル", romaji: "Cell" },
  freezer: { ja: "フリーザ", romaji: "Frieza" },
  bills: { ja: "ビルス", romaji: "Beerus" },
  vermoudh: { ja: "ヴァーモッド", romaji: "Vermoud" },
  tenshinhan: { ja: "天津飯", romaji: "Tenshinhan" },
  vegetto: { ja: "ベジット", romaji: "Vegetto" },
  // Goku & famille
  goku: { ja: "孫悟空", romaji: "Son Gokuu" },
  gohan: { ja: "孫悟飯", romaji: "Son Gohan" },
  bardock: { ja: "バーダック", romaji: "Baadakku" },
  // Fusions
  gogeta: { ja: "ゴジータ", romaji: "Gogeta" },
  gotenks: { ja: "ゴテンクス", romaji: "Gotenks" },
  // Cyborgs (AniList = "Jinzouningen XX")
  android13: { ja: "人造人間13号", romaji: "Jinzouningen 13-gou" },
  android14: { ja: "人造人間14号", romaji: "Jinzouningen 14-gou" },
  android15: { ja: "人造人間15号", romaji: "Jinzouningen 15-gou" },
  android16: { ja: "人造人間16号", romaji: "Jinzouningen 16-gou" },
  android17: { ja: "人造人間17号", romaji: "Jinzouningen 17-gou" },
  android18: { ja: "人造人間18号", romaji: "Jinzouningen 18-gou" },
  android19: { ja: "人造人間19号", romaji: "Jinzouningen 19-gou" },
  android20drgero: { ja: "ドクター・ゲロ", romaji: "Dokutaa Gero" },
  // Super: Tournament of Power
  jiren: { ja: "ジレン", romaji: "Jiren" },
  toppo: { ja: "トッポ", romaji: "Toppo" },
  dyspo: { ja: "ディスポ", romaji: "Dyspo" },
  janemba: { ja: "ジャネンバ", romaji: "Janemba" },
  broly: { ja: "ブロリー", romaji: "Broly" },
  zeno: { ja: "全王", romaji: "Zen'ou" },
  marcarita: { ja: "マルカリータ", romaji: "Marcarita" },
  // Kaïos espagnol → canon
  grandpriest: { ja: "大神官", romaji: "Daishinkan" },
  grankaio: { ja: "大界王", romaji: "Daikaiou" },
  grankaioshin: { ja: "大界王神", romaji: "Daikaioushin" },
  kaiodeloeste: { ja: "西の界王", romaji: "Nishi no Kaiou" },
  kaiodelsur: { ja: "南の界王", romaji: "Minami no Kaiou" },
  kaiodeleste: { ja: "東の界王", romaji: "Higashi no Kaiou" },
  kaiodelnortekaito: { ja: "北の界王", romaji: "Kita no Kaiou" },
  kaioshindeleste: { ja: "東の界王神", romaji: "Higashi no Kaioushin" },
  kaioshindelnorte: { ja: "北の界王神", romaji: "Kita no Kaioushin" },
  kaioshindeloeste: { ja: "西の界王神", romaji: "Nishi no Kaioushin" },
  kaioshindelsur: { ja: "南の界王神", romaji: "Minami no Kaioushin" },
  // Autres
  kibito: { ja: "キビト", romaji: "Kibito" },
  kibitoshin: { ja: "キビト神", romaji: "Kibitoshin" },
  launch: { ja: "ランチ", romaji: "Lunch" },
  mrsatan: { ja: "ミスター・サタン", romaji: "Misutaa Satan" },
  nail: { ja: "ネイル", romaji: "Neiru" },
  // Last 6
  krillin: { ja: "クリリン", romaji: "Kuririn" },
  majinbuu: { ja: "魔人ブウ", romaji: "Majin Buu" },
  masterroshi: { ja: "亀仙人", romaji: "Kame-Sennin" },
  raditz: { ja: "ラディッツ", romaji: "Radittsu" },
  whis: { ja: "ウイス", romaji: "Whis" },
  zarbon: { ja: "ザーボン", romaji: "Zaabon" },
};

/**
 * Overrides planètes (l'API ES utilise des noms locaux : Tierra→Earth,
 * Vegeta→Planet Vegeta, etc.). AniList n'a pas de data planètes donc tout hardcodé.
 */
export const PLANET_OVERRIDES: Record<string, { ja: string; romaji: string }> = {
  namek: { ja: "ナメック星", romaji: "Namekku-sei" },
  tierra: { ja: "地球", romaji: "Chikyuu" },
  vegeta: { ja: "ベジータ星", romaji: "Bejiita-sei" },
  kanassa: { ja: "カナッサ星", romaji: "Kanassa-sei" },
  freezerno79: { ja: "フリーザ第79惑星", romaji: "Frieza Dai-79 Wakusei" },
  yardrat: { ja: "ヤードラット星", romaji: "Yaadoratto-sei" },
  makyo: { ja: "魔凶星", romaji: "Makyousei" },
  babari: { ja: "バブリ", romaji: "Baburi-sei" },
  monmar: { ja: "モンマール星", romaji: "Monmaaru-sei" },
  otromundo: { ja: "あの世", romaji: "Ano-yo" },
  // `planetasagrado` et `tsufuruniverso6` : aucune graphie sourcée,
  // la cellule reste vide (聖地 est la terre sainte de Karin, pas ce monde).
  planetadebills: { ja: "ビルスの星", romaji: "Birusu no Hoshi" },
  planetadelgrankaio: { ja: "大界王星", romaji: "Daikaiou-sei" },
  templomovildelreydetodo: { ja: "全王の宮殿", romaji: "Zen'ou no Kyuuden" },
  universo11: { ja: "第11宇宙", romaji: "Dai-11 Uchuu" },
  nuevoplanetatsufrui: { ja: "新ツフル星", romaji: "Shin Tsufuru-sei" },
  nucleodelmundo: { ja: "世界の中心", romaji: "Sekai no Chuushin" },
  kaiodelnorte: { ja: "北の界王星", romaji: "Kita no Kaiou-sei" },
  desconocido: { ja: "不明", romaji: "Fumei" },
};

/* ─── Name matching ─────────────────────────────────────────────────────── */

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Same letters whatever the order of the words: "Gokuu Son" (AniList) and "Son Gokuu". */
function sortedTokensKey(s: string): string {
  return s
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeName)
    .filter(Boolean)
    .toSorted()
    .join("");
}

const nativeKey = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

export type AnilistIndex = {
  byName: Map<string, AnilistChar>;
  byNative: Map<string, AnilistChar>;
};

export const EMPTY_INDEX: AnilistIndex = { byName: new Map(), byNative: new Map() };

/** Index of AniList characters; the first occurrence wins (media are listed main series first). */
export function indexAnilist(chars: readonly AnilistChar[]): AnilistIndex {
  const index: AnilistIndex = { byName: new Map(), byNative: new Map() };
  const put = (map: Map<string, AnilistChar>, key: string, char: AnilistChar) => {
    if (key && !map.has(key)) map.set(key, char);
  };
  for (const c of chars) {
    for (const label of [c.name.userPreferred, c.name.full]) {
      if (!label) continue;
      put(index.byName, normalizeName(label), c);
      put(index.byName, sortedTokensKey(label), c);
    }
    if (c.name.native) put(index.byNative, nativeKey(c.name.native), c);
  }
  return index;
}

/* ─── Planning ──────────────────────────────────────────────────────────── */

export type NamedRow = {
  id: number;
  name: string;
  nameJa: string | null;
  nameRomaji: string | null;
};
export type NameUpdate = { id: number; nameJa: string | null; nameRomaji: string | null };
export type Plan = {
  updates: NameUpdate[];
  /** Rows that already have both names. */
  alreadyComplete: number;
  /** Incomplete rows for which no source has anything to add. */
  unmatched: number;
};

type Override = { ja: string; romaji: string };

function lookup(index: AnilistIndex, row: NamedRow): AnilistChar | undefined {
  return (
    index.byName.get(normalizeName(row.name)) ??
    index.byName.get(sortedTokensKey(row.name)) ??
    // A row that has its Japanese name but no romaji is found through that name.
    (row.nameJa ? index.byNative.get(nativeKey(row.nameJa)) : undefined)
  );
}

/**
 * Fills the gaps only: a name already stored (possibly curated) is never replaced. Explicit
 * overrides win over AniList, which is looked up by name, word-order-insensitively, then by
 * Japanese name.
 */
export function planCharacterEnrichment(
  rows: readonly NamedRow[],
  overrides: Readonly<Record<string, Override>>,
  index: AnilistIndex,
): Plan {
  const plan: Plan = { updates: [], alreadyComplete: 0, unmatched: 0 };
  for (const row of rows) {
    if (row.nameJa && row.nameRomaji) {
      plan.alreadyComplete++;
      continue;
    }
    const override = overrides[normalizeName(row.name)];
    const hit = override ? undefined : lookup(index, row);
    const ja = override?.ja ?? hit?.name.native ?? null;
    const romaji = override?.romaji ?? hit?.name.userPreferred ?? hit?.name.full ?? null;
    const nameJa = row.nameJa || ja || null;
    const nameRomaji = row.nameRomaji || romaji || null;
    if (nameJa === (row.nameJa || null) && nameRomaji === (row.nameRomaji || null)) {
      plan.unmatched++;
      continue;
    }
    plan.updates.push({ id: row.id, nameJa, nameRomaji });
  }
  return plan;
}

/** Planets have no AniList data: explicit overrides only. */
export function planPlanetEnrichment(
  rows: readonly NamedRow[],
  overrides: Readonly<Record<string, Override>>,
): Plan {
  return planCharacterEnrichment(rows, overrides, EMPTY_INDEX);
}

/* ─── Gate ──────────────────────────────────────────────────────────────── */

export type Gate = { run: true } | { run: false; reason: string };

/**
 * Whether the job should run at all.
 *  - `replicaFed`: when PostgreSQL feeds the SQLite replica, the editorial names belong to the
 *    source; the reverse-sync overwrites the table every 15 minutes, so anything written here is
 *    lost and the job is pure network cost.
 *  - a complete run less than a week old is not repeated at every boot.
 */
export function enrichmentGate(input: {
  replicaFed: boolean;
  lastCompleteRunAt: number | null;
  now: number;
}): Gate {
  if (input.replicaFed) {
    return {
      run: false,
      reason:
        "the replica is fed by PostgreSQL (names live in the source; the reverse-sync overwrites local writes)",
    };
  }
  const last = input.lastCompleteRunAt;
  if (last !== null && input.now - last < ENRICHMENT_MIN_AGE_MS) {
    return {
      run: false,
      reason: `last complete run ${new Date(last).toISOString()}, less than 7 days ago`,
    };
  }
  return { run: true };
}

/* ─── Network ───────────────────────────────────────────────────────────── */

export type FetchDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  minIntervalMs?: number;
};

export type AnilistFetchResult = {
  chars: AnilistChar[];
  requests: number;
  /** One entry per title that stopped early (rate limit, HTTP or GraphQL error). */
  truncated: string[];
};

const QUERY = `query($id: Int!, $page: Int!, $perPage: Int!) {
  Media(id: $id) {
    characters(page: $page, perPage: $perPage, sort: ROLE) {
      pageInfo { hasNextPage }
      nodes { name { full native userPreferred } }
    }
  }
}`;

type AnilistResponse = {
  data?: {
    Media?: { characters?: { pageInfo: { hasNextPage: boolean }; nodes: AnilistChar[] } } | null;
  };
  errors?: { message: string }[];
};

/**
 * Characters of every listed title, throttled to AniList's limit. A 429 waits `Retry-After` and
 * retries that page once; any other failure stops that title and is reported in `truncated`
 * instead of being silent.
 */
export async function fetchAnilistChars({
  fetch: fetchImpl = fetch,
  sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  log = () => {},
  minIntervalMs = ANILIST_MIN_INTERVAL_MS,
}: FetchDeps = {}): Promise<AnilistFetchResult> {
  const result: AnilistFetchResult = { chars: [], requests: 0, truncated: [] };
  let first = true;
  const post = async (id: number, page: number) => {
    result.requests++;
    return fetchImpl(ANILIST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: { id, page, perPage: ANILIST_PAGE_SIZE },
      }),
    });
  };
  for (const media of ANILIST_MEDIA) {
    for (let page = 1; page <= media.pages; page++) {
      if (!first) await sleep(minIntervalMs);
      first = false;
      let res = await post(media.id, page);
      if (res.status === 429) {
        const header = Number(res.headers.get("retry-after"));
        const wait = Math.min(header > 0 ? header : 60, ANILIST_RETRY_AFTER_MAX_S);
        log(`  AniList rate limit on ${media.title}, waiting ${wait}s`);
        await sleep(wait * 1000);
        res = await post(media.id, page);
      }
      if (!res.ok) {
        result.truncated.push(`${media.title} page ${page}: HTTP ${res.status}`);
        break;
      }
      const json = (await res.json().catch(() => null)) as AnilistResponse | null;
      const characters = json?.data?.Media?.characters;
      if (!characters) {
        const why = json?.errors?.[0]?.message ?? "no data";
        result.truncated.push(`${media.title} page ${page}: ${why}`);
        break;
      }
      result.chars.push(...characters.nodes);
      if (!characters.pageInfo.hasNextPage) break;
    }
  }
  return result;
}
