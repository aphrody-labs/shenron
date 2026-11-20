#!/usr/bin/env bun
/**
 * rag-lexique.ts — génère le lexique d'expansion des requêtes RAG.
 *
 * Le corpus parle surtout français, les visiteurs parfois anglais ou japonais :
 * « Frieza », « フリーザ » et « Freezer » désignent le même personnage, mais
 * BM25 ne trouve que la graphie qui figure dans le texte. Ce lexique regroupe
 * les graphies équivalentes d'une même entité ; `lib/rag.ts` ajoute à la clause
 * FTS les autres formes du groupe dès qu'une d'elles apparaît dans la question.
 *
 * Sources, de la plus sûre à la moins sûre :
 *   1. PostgreSQL : `name` / `name_ja` / `name_romaji` des entités visibles ;
 *   2. le lexique canonique `@aphrody/shenron-lexicon` (`data/lexicon/terms.json` : ja, fr, en,
 *      romaji et alias) ;
 *   3. les groupes de recherche ci-dessous, pour les entités que le lexique ne porte pas encore.
 *
 * Écrit `apps/bot/data/rag/lexique-requetes.json` (ou `RAG_LEXIQUE`) :
 * `{ generatedAt, groups: string[][] }`.
 *
 * Usage : bun packages/pipeline/scripts/rag-lexique.ts
 */
import postgres from "postgres";
import { lexicon } from "@aphrody/shenron-lexicon/data";
import { urlPostgres } from "./_rag-sources-pg";
import { resolveLexiquePath } from "./lib/script-env";

// B6 : chemins dérivés par fileURLToPath ; sortie = le fichier que lit apps/bot/src/lib/rag.ts
// (apps/bot/data/rag/lexique-requetes.json), ou RAG_LEXIQUE.
const OUT = resolveLexiquePath(import.meta.url, process.env);

/**
 * Groupes de recherche hors lexique : graphies équivalentes d'entités que le lexique canonique
 * (`data/lexicon/terms.json`) ne porte pas encore. Les autres équivalences anglaises y vivent
 * désormais (`en`, `aliases`, `romaji`). La première forme est celle du wiki.
 */
const EQUIVALENCES: string[][] = [
  ["Kid Buu", "Boo originel", "Majin Buu pur"],
  ["C-17", "Android 17", "Cyborg 17", "人造人間17号"],
  ["C-18", "Android 18", "Cyborg 18", "人造人間18号"],
  ["C-16", "Android 16", "Cyborg 16", "人造人間16号"],
  ["Tout-Puissant", "Kami", "Kami-sama", "神様"],
  ["Tournoi du Pouvoir", "Tournament of Power", "力の大会"],
  ["Armée du Ruban Rouge", "Red Ribbon", "Red Ribbon Army", "レッドリボン軍"],
  ["Capsule Corporation", "Capsule Corp", "カプセルコーポレーション"],
  ["Ôzaru", "Oozaru", "Great Ape", "singe géant", "大猿"],
  ["Fusion Métamol", "Fusion Dance", "Metamoru", "フュージョン"],
  ["Daizenshuu", "Daizenshū", "大全集"],
  ["Chōzenshū", "Chozenshu", "超全集"],
];

const s = (v: unknown) => (v == null ? "" : String(v).trim());
/** Une graphie trop courte ou générique déclencherait l'expansion partout. */
const utile = (forme: string) => forme.length >= 3 && !/^\d+$/.test(forme);

const sql = postgres(await urlPostgres(), { max: 1, prepare: false });
const groupes: string[][] = [];
try {
  const tables: [string, string][] = [
    ["db_characters", "name, name_ja, name_romaji"],
    ["db_techniques", "name, name_ja, name_romaji"],
    ["db_planets", "name, name_ja, name_romaji"],
    ["db_races", "name, name_ja, NULL AS name_romaji"],
    ["db_items", "name, name_ja, name_romaji"],
    ["db_dragons", "name, name_ja, NULL AS name_romaji"],
    ["db_locations", "name, name_ja, name_romaji"],
    ["db_sagas", "name, name_ja, NULL AS name_romaji"],
  ];
  for (const [table, colonnes] of tables) {
    const rows = await sql
      .unsafe(`SELECT ${colonnes} FROM bot.${table} WHERE coalesce(visible::int, 1) <> 0`)
      .catch(() => [] as Record<string, unknown>[]);
    for (const r of rows) {
      // Le japonais porte parfois sa lecture entre parenthèses : « 如意棒 (ニョイボウ) ».
      // Seuls les morceaux réellement écrits en japonais (ou coréen) sont gardés :
      // les annotations « (nom français, AB Prod) » ne sont pas des graphies.
      const japonais = s(r.name_ja)
        .split(/[()（）/,、]/)
        .map((f) => f.trim())
        .filter((f) =>
          /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(f),
        );
      // Une romanisation ne porte ni accent français ni ponctuation de liste :
      // « Élite » ou « Aurore » en romaji agglutinaient des personnages sans lien.
      const romaji = /^[A-Za-zĀ-ſ' .-]+$/.test(s(r.name_romaji)) ? [s(r.name_romaji)] : [];
      const formes = [s(r.name), ...japonais, ...romaji]
        .map((f) => f.trim())
        .filter((f) => utile(f) && !/[,(（]/.test(f));
      if (new Set(formes).size >= 2) groupes.push([...new Set(formes)]);
    }
  }
} finally {
  await sql.end();
}

// Le lexique canonique : forme française, japonaise, anglaise, romaji et alias d'un terme.
for (const term of lexicon().terms) {
  const formes = [
    term.fr,
    term.ja,
    term.en,
    term.romaji ?? "",
    ...(term.aliases?.ja ?? []),
    ...(term.aliases?.fr ?? []),
    ...(term.aliases?.en ?? []),
  ].filter(utile);
  if (new Set(formes).size >= 2) groupes.push([...new Set(formes)]);
}
for (const groupe of EQUIVALENCES) groupes.push([...new Set(groupe)]);

// Fusion des groupes qui partagent une graphie (union-find sur la forme repliée).
const replie = (f: string) =>
  f
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase();
const parent = new Map<string, string>();
const racine = (k: string): string => {
  let r = k;
  while (parent.get(r) !== r) r = parent.get(r)!;
  parent.set(k, r);
  return r;
};
const formeDe = new Map<string, string>();
for (const g of groupes) {
  for (const f of g) {
    const k = replie(f);
    if (!parent.has(k)) parent.set(k, k);
    if (!formeDe.has(k)) formeDe.set(k, f);
  }
  for (const f of g.slice(1)) parent.set(racine(replie(f)), racine(replie(g[0]!)));
}
const fusion = new Map<string, Set<string>>();
for (const k of parent.keys()) {
  const r = racine(k);
  const set = fusion.get(r) ?? new Set<string>();
  set.add(formeDe.get(k)!);
  fusion.set(r, set);
}
// Un groupe géant signale un nom trop générique qui a tout aggloméré : on l'écarte.
const final: string[][] = [];
for (const groupe of fusion.values()) {
  const formes = [...groupe];
  if (formes.length >= 2 && formes.length <= 10) final.push(formes);
}

await Bun.write(
  OUT,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), groups: final })}\n`,
);
console.log(`✓ ${final.length} groupes d'équivalence → ${OUT}`);
