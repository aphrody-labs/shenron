// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-pipeline/ai/grounding` — fidelity of a grounded answer, with no model call.
 *
 * Runtime class: `pure`. Four jobs, all deterministic:
 * - rank the hits sent to the model: collected documents ("Cette fiche décrit un document
 *   collecté. Elle ne constitue pas une assertion canonique.") come after the canon sources;
 * - find the entities of the question and the ones no passage mentions (refusal);
 * - check the citations of an answer: an identifier that is not a provided passage is removed,
 *   a citation the passage does not support is replaced by the closest passage;
 * - drop a sentence that brings a proper noun found in no passage (invention).
 */
import { type AnswerLang, ANSWER_LANGS } from "./prompts";

// ── Language ────────────────────────────────────────────────────────────────────────────────

const KANA_HAN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const EN_WORDS = new Set([
  "the",
  "is",
  "are",
  "was",
  "were",
  "who",
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "does",
  "did",
  "do",
  "of",
  "in",
  "and",
  "or",
  "between",
  "stronger",
  "strongest",
  "about",
  "tell",
  "me",
  "his",
  "her",
  "with",
  "from",
  "has",
  "have",
  "can",
  "against",
  "than",
  "more",
  "powerful",
  "episode",
  "appear",
  "appears",
  "first",
]);

/** Language of a free text: ja when it holds kana or Han, en when English words lead, else fr. */
export function detectLang(text: string): AnswerLang {
  if (KANA_HAN.test(text)) return "ja";
  const words = fold(text).match(/[a-z]+/g) ?? [];
  if (words.length === 0) return "fr";
  const en = words.filter((word) => EN_WORDS.has(word)).length;
  const fr = words.filter((word) => FR_STOP.has(word)).length;
  return en > fr ? "en" : "fr";
}

/**
 * Language of a body of text (the passages, an answer): ja when kana and Han make up a large part
 * of its letters (French passages only carry a few Japanese names in parentheses), else the
 * Latin-script guess of {@link detectLang}.
 */
export function dominantLang(text: string): AnswerLang {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const cjk = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/gu)?.length ?? 0;
  if (letters > 0 && cjk / letters > 0.3) return "ja";
  return detectLang(text.replace(/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu, " "));
}

/** An explicit language (`fr`, `en-US`, `ja`…) wins; otherwise the question's own language. */
export function resolveAnswerLang(question: string, lang?: string | null): AnswerLang {
  const code = (lang ?? "").toLowerCase().slice(0, 2);
  return (ANSWER_LANGS as readonly string[]).includes(code)
    ? (code as AnswerLang)
    : detectLang(question);
}

// ── Text helpers ────────────────────────────────────────────────────────────────────────────

/** Lower-case, accents removed (same folding as `fold` of the bot's retrieval). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

const FR_STOP = new Set(
  (
    "le la les un une des du de d l et ou mais donc que qu qui quoi quel quelle quels quelles " +
    "est es sont etait ete etre a ai as ont avait dans en au aux par pour sur sous avec sans " +
    "ce cet cette ces se sa son ses leur leurs il elle ils elles on y ne pas plus moins tres " +
    "comme si car entre contre vers chez ainsi aussi alors lors puis fait faire peut peuvent " +
    "oh jeune mon ma mes ton ta tes votre notre cher ami voyageur disciple combattant"
  ).split(" "),
);
const EN_STOP = new Set(
  (
    "the a an of in on at to for from by with and or but is are was were be been being it its " +
    "this that these those as he she they them his her their there which who what when where"
  ).split(" "),
);

/** Content words of a text: folded, 3+ letters, no stop word; CJK as character bigrams. */
export function contentTokens(text: string): string[] {
  const out: string[] = [];
  const folded = fold(text);
  for (const word of folded.match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (KANA_HAN.test(word)) {
      const chars = [...word];
      if (chars.length === 1) out.push(word);
      for (let i = 0; i + 1 < chars.length; i++) out.push(`${chars[i]}${chars[i + 1]}`);
      continue;
    }
    if (word.length < 3 || FR_STOP.has(word) || EN_STOP.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

/** Cheap plural stem, so "saiyans" and "saiyan" meet. */
function stem(word: string): string {
  return word.length > 4 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

// ── Hits: collected documents behind the canon ─────────────────────────────────────────────

export interface RankableHit {
  id: string;
  title: string;
  url: string;
  content?: string;
  snippet?: string;
  /** Corpus of origin (`db_characters`, `wiki_pages`…). */
  sourceId?: string;
  kind?: string;
}

/** Sources that carry the canon (`db_*` corpora and the games they are not: see `isCanonSource`). */
export const CANON_SOURCE_IDS: ReadonlySet<string> = new Set([
  "db_characters",
  "db_wiki_sections",
  "db_techniques",
  "canon_references",
  "databooks",
  "manga",
]);

/** Canon corpora: the named ones and every other `db_*` encyclopaedia corpus except the games. */
export function isCanonSource(sourceId: string): boolean {
  return CANON_SOURCE_IDS.has(sourceId) || (sourceId.startsWith("db_") && sourceId !== "db_games");
}

/** Marker line of a collected document (`apps/site/scripts/_crawled-wiki-pages.ts`). */
export const COLLECTED_MARKER = "Cette fiche décrit un document collecté";

const COLLECTED_URL = /\/wiki\/source-[0-9a-f]{12,}/;

/** `true` for a `wiki_pages` fiche that only describes a collected document (not canon). */
export function isCollectedDocument(hit: RankableHit): boolean {
  if ((hit.content ?? "").includes(COLLECTED_MARKER)) return true;
  if ((hit.snippet ?? "").includes(COLLECTED_MARKER)) return true;
  return hit.sourceId === "wiki_pages" && COLLECTED_URL.test(hit.url);
}

/** 0 canon (or the page being read), 1 other editorial source, 2 collected document. */
export function hitTier(hit: RankableHit): 0 | 1 | 2 {
  if (hit.kind === "page_context") return 0;
  if (isCollectedDocument(hit)) return 2;
  const source = hit.sourceId ?? "";
  if (isCanonSource(source)) return 0;
  if (hit.kind && /^manga_|^databook|^canon$/.test(hit.kind)) return 0;
  return 1;
}

/** Collected documents are kept only when fewer than this many other passages exist. */
export const MIN_NON_COLLECTED = 3;

/**
 * Hits in the order the model sees them. The sort is stable (retrieval order inside a tier), and
 * nothing leaves the list: `selectContextHits` decides what the model gets.
 */
export function rankHitsForContext<T extends RankableHit>(hits: readonly T[]): T[] {
  return hits
    .map((hit, index) => ({ hit, index, tier: hitTier(hit) }))
    .toSorted((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.hit);
}

/** The first `limit` ranked hits; collected documents only fill what the others leave empty. */
export function selectContextHits<T extends RankableHit>(hits: readonly T[], limit: number): T[] {
  const ranked = rankHitsForContext(hits);
  const solid = ranked.filter((hit) => hitTier(hit) < 2);
  const pool = solid.length >= MIN_NON_COLLECTED ? solid : ranked;
  return pool.slice(0, limit);
}

// ── Entities of the question ────────────────────────────────────────────────────────────────

const ENTITY_STOP = new Set(
  (
    "qui quoi quel quelle quels quelles comment combien pourquoi quand ou est sont etait que qu " +
    "le la les un une des du de et ou mais donc dans en au aux par pour sur avec sans contre " +
    "entre vers chez parle parlez dis dit donne donnez explique expliquez compare comparez " +
    "raconte racontez cite citez liste listez presente decris montre peux peut pouvez sais " +
    "sait connais connait who what which when where why how is are was were does did do the " +
    "tell explain compare describe list give show can could would of in and or between " +
    "about with from his her their is vs versus " +
    "dragon ball balls dragonball super kai gt daima manga anime saga arc tome tomes chapitre " +
    "chapitres episode episodes film films movie movies chapter volume universe univers " +
    "terre earth saiyan saiyans saiyen saiyens"
  ).split(" "),
);

/** Words that may follow a sentence-initial name ("Goku est…", "Goku vs…"). */
const ENTITY_FOLLOWERS = new Set([
  "est",
  "is",
  "was",
  "a",
  "vs",
  "contre",
  "et",
  "and",
  "ou",
  "or",
]);

const JA_STOP = new Set([
  "戦闘力",
  "必殺技",
  "変身",
  "最強",
  "登場",
  "物語",
  "漫画",
  "原作",
  "比較",
  "強さ",
  "誰",
  "何",
  "エピソード",
  "キャラクター",
  "ドラゴンボール",
  "アニメ",
  "マンガ",
]);

/**
 * Named things the question is about: runs of capitalised words ("Kid Buu", "Vrombulon Prime"; not
 * question or franchise words), katakana and Han runs. A fully lower-case question yields none:
 * the prompt rules still apply.
 */
export function extractEntities(question: string): string[] {
  const entities = new Set<string>();
  const tokens = [...question.matchAll(/[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*/gu)];
  let run: string[] = [];
  let last = -2;
  const flush = (): void => {
    if (run.length > 0) entities.add(run.join(" "));
    run = [];
  };
  for (const [index, match] of tokens.entries()) {
    const word = match[0];
    if (KANA_HAN.test(word)) continue;
    if (word.length < 3 || !/^\p{Lu}/u.test(word)) continue;
    if (/^\p{Lu}+$/u.test(word) && word.length <= 4) continue; // DBZ, SSJ, GT
    if (ENTITY_STOP.has(fold(word))) continue;
    if (index === 0) {
      const next = fold(tokens[1]?.[0] ?? "").split("-")[0] ?? "";
      if (tokens.length > 1 && !ENTITY_FOLLOWERS.has(next)) continue;
    }
    if (index !== last + 1) flush();
    run.push(word);
    last = index;
  }
  flush();
  for (const kana of question.match(/[\p{Script=Katakana}ー]{2,}|\p{Script=Han}{2,}/gu) ?? []) {
    if (!JA_STOP.has(kana)) entities.add(kana);
  }
  return [...entities];
}

export interface PassageText {
  /** 1-based identifier shown to the model. */
  n: number;
  hit: RankableHit;
  text: string;
}

function haystack(passages: readonly PassageText[]): { latin: string; cjk: boolean; raw: string } {
  const raw = passages.map((p) => `${p.hit.title} ${p.text}`).join("\n");
  return { latin: fold(raw), cjk: KANA_HAN.test(raw), raw };
}

/** Other names of an entity (ja, fr, en, romaji): the lexicon, when the caller has one. */
export type EntityAliases = (entity: string) => readonly string[];

/**
 * Entities of the question that no passage mentions (accents, case and plurals ignored). A
 * several-word entity is covered when the whole name, one of its aliases, or every one of its
 * words appears.
 */
export function uncoveredEntities(
  entities: readonly string[],
  passages: readonly PassageText[],
  aliasesOf?: EntityAliases,
): string[] {
  const hay = haystack(passages);
  const present = (name: string): boolean => {
    if (KANA_HAN.test(name)) return hay.raw.includes(name);
    const key = fold(name);
    return hay.latin.includes(key) || hay.latin.includes(stem(key));
  };
  return entities.filter((entity) => {
    if (present(entity)) return false;
    if ((aliasesOf?.(entity) ?? []).some(present)) return false;
    const words = entity.split(" ");
    if (words.length > 1 && words.every(present)) return false;
    // No Japanese in the passages: a Japanese spelling cannot be judged, do not refuse for it.
    if (KANA_HAN.test(entity)) return hay.cjk;
    return true;
  });
}

/**
 * First passage that names an entity of the question (or one of its aliases): the citation of an
 * answer that shares no word with its passages because it is written in another language.
 */
export function anchorPassage(
  entities: readonly string[],
  passages: readonly PassageText[],
  aliasesOf?: EntityAliases,
): number | undefined {
  for (const passage of passages) {
    for (const entity of entities) {
      const names = [entity, ...(aliasesOf?.(entity) ?? [])];
      if (names.some((name) => hasName(name, passage))) {
        return passage.n;
      }
    }
  }
  return undefined;
}

function hasName(name: string, passage: PassageText): boolean {
  const text = `${passage.hit.title} ${passage.text}`;
  if (KANA_HAN.test(name)) return text.includes(name);
  const key = fold(name);
  const hay = fold(text);
  return hay.includes(key) || hay.includes(stem(key));
}

// ── Citations ───────────────────────────────────────────────────────────────────────────────

export interface GroundedCitation {
  /** Identifier shown in the answer (`[n]`). */
  n: number;
  id: string;
  title: string;
  url: string;
  sourceId?: string;
  kind?: string;
}

export interface FidelityReport {
  /** Sentences that state a fact (enough content words). */
  claims: number;
  /** Claims left with a valid citation. */
  cited: number;
  /** Citations replaced by the closest passage. */
  replaced: number;
  /** Citations removed because no passage supports the sentence. */
  removed: number;
  /** Sentences dropped for a proper noun found in no passage. */
  dropped: number;
}

export interface VerifiedAnswer {
  answer: string;
  citations: GroundedCitation[];
  report: FidelityReport;
}

const MARKER = /\s*[[【](\d{1,3}(?:\s*[,、]\s*\d{1,3})*)[\]】]/g;
/** Shared content words for a passage to support a sentence. */
const MIN_SUPPORT = 2;
const MIN_CLAIM_TOKENS = 3;
/** `(Source)`, `(Source : …)` the model slips into a sentence. */
const SOURCE_INLINE = /\s*[(*_]+\s*sources?\s*(?::[^)\n]{0,80})?\)[*_]*/gi;
/** A sentence that only labels a source: `Source :`, `*(Source : Whis)*`. */
const SOURCE_LABEL = /^[*_(\s]*sources?\s*:[^.!?\n]{0,80}[)*_\s.]*$/i;

/** Words the personas say and the passages never contain; never an invention. */
const VOICE_WORDS = new Set(
  (
    "oh hmpf pfff quoi hakai tamponne parle mortel whis beerus shenron kaio kaioshin zeno " +
    "sama enma gregory bubbles daishinkan saiyan saiyans super terre namek univers univers " +
    "dragon ball balls kamehameha"
  ).split(" "),
);

function overlap(sentenceTokens: readonly string[], passage: Set<string>): number {
  let shared = 0;
  for (const token of new Set(sentenceTokens)) if (passage.has(token)) shared++;
  return shared;
}

/** Proper nouns and numbers of a sentence that appear in neither a passage nor the question. */
function inventedTerms(sentence: string, known: string, question: string): string[] {
  const terms: string[] = [];
  const words = [...sentence.matchAll(/[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*/gu)];
  for (const [index, match] of words.entries()) {
    const word = match[0];
    const key = fold(word);
    if (KANA_HAN.test(word)) continue;
    const isName = /^\p{Lu}/u.test(word) && word.length >= 4 && index > 0;
    const isNumber = /^\d{2,}$/.test(word);
    if (!isName && !isNumber) continue;
    if (VOICE_WORDS.has(key) || ENTITY_STOP.has(key)) continue;
    if (known.includes(key) || known.includes(stem(key))) continue;
    if (fold(question).includes(key)) continue;
    terms.push(word);
  }
  return terms;
}

function toCitation(passage: PassageText): GroundedCitation {
  const { hit } = passage;
  return {
    n: passage.n,
    id: hit.id,
    title: hit.title,
    url: hit.url,
    ...(hit.sourceId ? { sourceId: hit.sourceId } : {}),
    ...(hit.kind ? { kind: hit.kind } : {}),
  };
}

function markerNumbers(raw: string): number[] {
  return raw.split(/[,、]/).map((part) => Number(part.trim()));
}

/** Split keeping the separators: `[text, sep, text, sep, …]`. */
function sentences(answer: string): string[] {
  return answer.split(/((?<=[.!?…])[ \t]+|(?<=[。！？])[ \t]*|\n+)/u).filter((part) => part !== "");
}

/**
 * Rewrites the citations of `answer` so each one is a provided passage that supports its
 * sentence, and removes the sentences that invent a proper noun.
 */
export function verifyAnswer(
  answer: string,
  question: string,
  passages: readonly PassageText[],
  options: { lang?: AnswerLang; anchor?: number } = {},
): VerifiedAnswer {
  // An answer can be compared with the passages word for word only when both are in the same
  // language. Otherwise they share little more than names: one shared word supports a citation,
  // and no sentence is dropped for a name the passages spell differently.
  const strict = (options.lang ?? "fr") === dominantLang(passages.map((p) => p.text).join(" "));
  const minSupport = strict ? MIN_SUPPORT : 1;
  const byN = new Map(passages.map((p) => [p.n, p]));
  const tokenSets = new Map(
    passages.map((p) => [p.n, new Set(contentTokens(`${p.hit.title} ${p.text}`))]),
  );
  const known = fold(passages.map((p) => `${p.hit.title} ${p.text}`).join("\n"));
  const report: FidelityReport = { claims: 0, cited: 0, replaced: 0, removed: 0, dropped: 0 };
  const used = new Set<number>();
  const kept: string[] = [];

  const parts = sentences(answer);
  for (let i = 0; i < parts.length; i++) {
    const part = (parts[i] ?? "").replace(SOURCE_INLINE, "");
    if (/^\s+$/.test(part) || /^\n+$/.test(part)) {
      kept.push(part);
      continue;
    }
    const cited = [...part.matchAll(MARKER)].flatMap((m) => markerNumbers(m[1] ?? ""));
    const bare = part.replace(MARKER, "").trim();
    const tokens = contentTokens(bare);
    if (SOURCE_LABEL.test(bare)) {
      // "(Source : …)" the model appends by habit: the citations are the `[n]` markers.
      if (/^\s+$/.test(parts[i + 1] ?? "x")) i++;
      continue;
    }
    if (tokens.length < MIN_CLAIM_TOKENS || passages.length === 0) {
      kept.push(bare);
      continue;
    }
    report.claims++;

    const scores = passages.map((p) => ({
      n: p.n,
      shared: overlap(tokens, tokenSets.get(p.n) ?? new Set()),
    }));
    const best = scores.reduce((a, b) => (b.shared > a.shared ? b : a), scores[0]!);

    if (strict && best.shared <= MIN_SUPPORT && inventedTerms(bare, known, question).length > 0) {
      report.dropped++;
      kept.push("");
      // Drop the separator that followed the sentence as well.
      if (/^\s+$/.test(parts[i + 1] ?? "x")) i++;
      continue;
    }

    const valid = [...new Set(cited)].filter((n) => byN.has(n));
    let final: number[] = valid.filter(
      (n) => (scores.find((s) => s.n === n)?.shared ?? 0) >= minSupport,
    );
    if (cited.length > 0 && final.length === 0) {
      if (best.shared >= minSupport) {
        final = [best.n];
        report.replaced++;
      } else {
        report.removed++;
      }
    } else if (final.length > 0) {
      const top = Math.max(...final.map((n) => scores.find((s) => s.n === n)?.shared ?? 0));
      if (best.shared >= 2 * top && best.shared - top >= 2 && !final.includes(best.n)) {
        final = [best.n];
        report.replaced++;
      }
    } else if (best.shared >= minSupport) {
      final = [best.n]; // the model cited nothing: attach the closest passage
    }
    // Another language than the passages: nothing to compare word for word, so the passage that
    // names the entity of the question stands for the evidence.
    if (!strict && final.length === 0 && options.anchor !== undefined && byN.has(options.anchor)) {
      final = [options.anchor];
    }
    if (final.length > 0) {
      report.cited++;
      for (const n of final) used.add(n);
    }
    kept.push(`${bare}${final.length > 0 ? ` ${final.map((n) => `[${n}]`).join("")}` : ""}`);
    // Terminal punctuation was part of `bare`: move the marker before it for readability.
    const last = kept.length - 1;
    kept[last] = kept[last]!.replace(/([.!?…。！？]+)( (?:\[\d+\])+)$/u, "$2$1");
  }

  const text = kept
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const citations = [...used]
    .toSorted((a, b) => a - b)
    .map((n) => byN.get(n))
    .filter((p): p is PassageText => p !== undefined)
    .map(toCitation);
  return { answer: text, citations, report };
}

/** Citations of an answer already verified (cache hit): the markers read against the passages. */
export function citationsOf(answer: string, passages: readonly PassageText[]): GroundedCitation[] {
  const byN = new Map(passages.map((p) => [p.n, p]));
  const used = new Set<number>();
  for (const match of answer.matchAll(MARKER)) {
    for (const n of markerNumbers(match[1] ?? "")) if (byN.has(n)) used.add(n);
  }
  return [...used]
    .toSorted((a, b) => a - b)
    .map((n) => byN.get(n))
    .filter((p): p is PassageText => p !== undefined)
    .map(toCitation);
}

/** The answer without its `[n]` markers (a chat client that shows no citations). */
export function stripCitationMarkers(answer: string): string {
  return answer
    .replace(MARKER, "")
    .replace(/[ \t]+([.!?…,;:])/g, "$1")
    .trim();
}
