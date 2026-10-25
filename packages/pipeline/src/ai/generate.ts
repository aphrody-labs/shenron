// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-pipeline/ai/generate` — grounded answer generation behind ports
 * (logic of `generateLlmAnswer` in `apps/bot/src/lib/llm.ts`).
 *
 * Runtime class: `pure`. `generateText` with `instructions` and
 * `maxRetries: 0`; persona fallbacks and session turns are never cached; a
 * missing chunk content or a failing port never throws.
 */
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { lexicon } from "@aphrody/shenron-lexicon/data";
import { generateText, type ModelMessage } from "ai";
import type {
  ChunkContentPort,
  ConcurrencyPort,
  HistoryPort,
  HistoryTurn,
  SemanticCachePort,
} from "./ports";
import { semanticCacheScope } from "./ports";
import {
  citationsOf,
  dominantLang,
  anchorPassage,
  type EntityAliases,
  extractEntities,
  type FidelityReport,
  hitTier,
  type GroundedCitation,
  type PassageText,
  resolveAnswerLang,
  selectContextHits,
  uncoveredEntities,
  verifyAnswer,
} from "./grounding";
import {
  type AnswerLang,
  buildGroundingInstructions,
  type HomePersona,
  INJECTION_GUARD,
  isChitchat,
  isNotEstablishedAnswer,
  notEstablished,
  PERSONAS,
  type PersonaId,
  PROMPT_VERSION,
  withHomePersona,
} from "./prompts";

export interface GroundedHit {
  id: string;
  title: string;
  url: string;
  /** Inline full text (Aphrody hits carry it); preferred over the chunk port. */
  content?: string;
  /** Last-resort text when neither `content` nor the port has the chunk. */
  snippet?: string;
  /** Corpus of origin (`db_characters`, `wiki_pages`…): collected documents rank last. */
  sourceId?: string;
  kind?: string;
}

export interface ContextLimits {
  /** Hits considered (llm.ts: 6). */
  hits: number;
  /** Characters per hit (llm.ts: LLM_CONTEXT_CHARS_PER_HIT, 700). */
  perHit: number;
  /** Stop once the context exceeds this many characters (llm.ts: 3200). */
  total: number;
}

export const DEFAULT_CONTEXT_LIMITS: Readonly<ContextLimits> = Object.freeze({
  hits: 6,
  perHit: 700,
  total: 3200,
});

/** Messages of session memory kept in the prompt (llm.ts: LLM_HISTORY_TURNS, 6). */
export const DEFAULT_HISTORY_TURNS = 6;

export interface GroundedAnswerInput {
  model: LanguageModelV4;
  persona: PersonaId;
  question: string;
  hits: readonly GroundedHit[];
  chunks: ChunkContentPort;
  history?: HistoryPort;
  cache?: SemanticCachePort;
  concurrency?: ConcurrencyPort;
  sessionId?: string;
  abortSignal?: AbortSignal;
  /** Explicit generation budget, forwarded unchanged to the model provider. */
  maxOutputTokens?: number;
  contextLimits?: Partial<ContextLimits>;
  historyTurns?: number;
  /**
   * Doctrine canon: cite `[n]`, verify the citations, refuse when the passages establish nothing.
   * Off by default (a task with no retrieval, `runIaTask`): the answer is the model's, unchecked.
   */
  strict?: boolean;
  /** Answer language (`fr`, `en`, `ja`); detected from the question when absent. */
  lang?: string;
  /** Other names of an entity of the question; defaults to the embedded ja/fr/en lexicon. */
  aliases?: EntityAliases;
  /** Tone, brevity and vibe of the user's agent home (SOUL.md, IDENTITY.md). */
  homePersona?: HomePersona | null;
  /** One more system line before the injection guard (the user's agent home fields). */
  systemNote?: string;
  /** Recalled memories of the user, as data in the user message (never sources, never instructions). */
  memories?: string;
  /** Diagnostics sink for swallowed port errors (never receives secrets). */
  onError?: (stage: "chunks" | "history" | "cache" | "generate", error: unknown) => void;
}

export interface GroundedAnswer {
  /** Answer text; factual sentences end with `[n]`, an identifier of `citations`. */
  answer: string;
  fallback: boolean;
  cached: boolean;
  promptVersion: string;
  /** Passages the answer cites, all taken from the hits provided. */
  citations: GroundedCitation[];
  /** `true` when the answer is the localised "not established in the sources". */
  refusal: boolean;
  lang: AnswerLang;
  /** Entities of the question that no passage mentions. */
  uncovered: string[];
  /** Counters of the citation check (absent for chit-chat, refusals and cache hits). */
  fidelity?: FidelityReport;
}

/**
 * Numbered passages of the context: `[n] title (source): text`. The identifier `n` is what the
 * model must cite and what `verifyAnswer` reads back.
 */
export async function buildGroundedPassages(
  hits: readonly GroundedHit[],
  chunks: ChunkContentPort,
  limits: ContextLimits,
  onError?: GroundedAnswerInput["onError"],
): Promise<PassageText[]> {
  const selected = selectContextHits(hits, limits.hits);
  let contents: ReadonlyMap<string, string> = new Map();
  const missing = selected.filter((hit) => !hit.content).map((hit) => hit.id);
  if (missing.length > 0) {
    try {
      contents = await chunks.contentFor(missing);
    } catch (error) {
      onError?.("chunks", error);
    }
  }
  const passages: PassageText[] = [];
  let length = 0;
  for (const hit of selected) {
    const text = (hit.content || contents.get(hit.id) || hit.snippet || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limits.perHit);
    if (!text) continue;
    passages.push({ n: passages.length + 1, hit, text });
    length += text.length;
    if (length > limits.total) break;
  }
  return passages;
}

/** Context text of the numbered passages (one per line). */
export function renderGroundedContext(passages: readonly PassageText[]): string {
  return passages
    .map(
      (p) => `[${p.n}] ${p.hit.title}${p.hit.sourceId ? ` (${p.hit.sourceId})` : ""} : ${p.text}`,
    )
    .join("\n");
}

/** Compact fact context (llm.ts `buildContext`), without dumping it to the user. */
export async function buildGroundedContext(
  hits: readonly GroundedHit[],
  chunks: ChunkContentPort,
  limits: ContextLimits,
  onError?: GroundedAnswerInput["onError"],
): Promise<string> {
  return renderGroundedContext(await buildGroundedPassages(hits, chunks, limits, onError));
}

/** Every form of the lexicon term an entity designates (ja, fr, en, romaji, aliases). */
export const lexiconAliases: EntityAliases = (entity) => {
  const term = lexicon().resolve(entity);
  if (!term) return [];
  const { ja, fr, en } = term.aliases ?? {};
  return [term.ja, term.fr, term.en, term.romaji ?? "", ...(ja ?? []), ...(fr ?? []), ...(en ?? [])]
    .map((form) => form.trim())
    .filter(Boolean);
};

/** Reminder of the answer language, last line of the user message (a persona is written in French). */
const LANG_REMINDER: Readonly<Record<AnswerLang, string>> = {
  fr: "",
  en: "\n\n(Answer in English.)",
  ja: "\n\n（日本語で答えてください。）",
};

/** `instructions` with `note` on its own line before the injection guard. */
function withSystemNote(instructions: string, note: string | undefined): string {
  if (!note?.trim()) return instructions;
  const body = instructions.endsWith(INJECTION_GUARD)
    ? instructions.slice(0, -INJECTION_GUARD.length).trimEnd()
    : instructions;
  return `${body}\n${note.trim()}\n${INJECTION_GUARD}`;
}

export async function generateGroundedAnswer(i: GroundedAnswerInput): Promise<GroundedAnswer> {
  const persona = i.persona;
  const fallbackText = PERSONAS[persona].fallback;
  const limits: ContextLimits = { ...DEFAULT_CONTEXT_LIMITS, ...i.contextLimits };
  const chit = isChitchat(i.question);
  const strict = i.strict === true && !chit;
  const lang = resolveAnswerLang(i.question, i.lang);
  const passages = chit ? [] : await buildGroundedPassages(i.hits, i.chunks, limits, i.onError);
  const context = renderGroundedContext(passages);

  const appendHistory = async (answer: string): Promise<void> => {
    if (!i.sessionId || !i.history) return;
    try {
      await i.history.append(i.sessionId, { q: i.question, a: answer });
    } catch (error) {
      i.onError?.("history", error);
    }
  };

  const base = { promptVersion: PROMPT_VERSION, lang, cached: false, fallback: false };

  // No passage, or none that mentions any entity of the question: the canon doctrine forbids
  // answering from the model's own memory. The refusal costs no generation.
  // Collected documents only describe what was collected: with no other passage there is nothing
  // established to answer from.
  const onlyCollected = passages.length > 0 && passages.every((p) => hitTier(p.hit) === 2);
  const entities = strict ? extractEntities(i.question) : [];
  const uncovered = strict
    ? uncoveredEntities(entities, passages, i.aliases ?? lexiconAliases)
    : [];
  if (
    strict &&
    (passages.length === 0 ||
      onlyCollected ||
      (entities.length > 0 && uncovered.length === entities.length))
  ) {
    const answer = notEstablished(lang, passages.length === 0 ? [] : uncovered);
    await appendHistory(answer);
    return { ...base, answer, citations: [], refusal: true, uncovered };
  }

  // A cached answer is valid only for the exact evidence, model, prompt version
  // and persona. Session history changes the prompt on every turn: never cached.
  const scope =
    context && !i.sessionId && i.cache
      ? `${persona}:${await semanticCacheScope(i.model.modelId, lang === "fr" ? context : `${lang}\u0000${context}`)}`
      : null;

  if (scope && i.cache) {
    try {
      const hit = await i.cache.lookup(scope, i.question);
      if (hit) {
        return {
          ...base,
          answer: hit,
          cached: true,
          citations: citationsOf(hit, passages),
          refusal: isNotEstablishedAnswer(hit),
          uncovered,
        };
      }
    } catch (error) {
      i.onError?.("cache", error);
    }
  }

  let history: readonly HistoryTurn[] = [];
  if (i.sessionId && i.history) {
    try {
      history = await i.history.load(i.sessionId, i.historyTurns ?? DEFAULT_HISTORY_TURNS);
    } catch (error) {
      i.onError?.("history", error);
    }
  }

  const absent =
    uncovered.length > 0
      ? `\n\nAucun passage ne mentionne : ${uncovered.join(", ")}. Pour ces éléments, écris « Non établi dans les sources », sans rien inventer.`
      : "";
  const memories = i.memories?.trim() ? `${i.memories.trim()}\n\n` : "";
  const userContent = context
    ? `${memories}Contexte (faits Dragon Ball, à reformuler${strict ? " ; cite les identifiants [n]" : ""}) :\n${context}${absent}\n\nMessage de l'utilisateur : ${i.question}${LANG_REMINDER[lang]}`
    : memories
      ? `${memories}Message de l'utilisateur : ${i.question}`
      : i.question;
  const messages: ModelMessage[] = [
    ...history
      .filter((turn) => turn.content)
      .map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: userContent },
  ];
  const instructions = withSystemNote(
    withHomePersona(
      buildGroundingInstructions(persona, undefined, { chitchat: chit, cite: strict, lang }),
      i.homePersona ?? {},
    ),
    i.systemNote,
  );

  const run = async (): Promise<string> => {
    try {
      const result = await generateText({
        model: i.model,
        instructions,
        messages,
        maxRetries: 0,
        ...(i.maxOutputTokens !== undefined ? { maxOutputTokens: i.maxOutputTokens } : {}),
        ...(i.abortSignal ? { abortSignal: i.abortSignal } : {}),
      });
      return result.text.trim();
    } catch (error) {
      i.onError?.("generate", error);
      return "";
    }
  };

  let raw = "";
  if (i.concurrency) {
    const outcome = await i.concurrency.run(run);
    raw = outcome === "busy" ? "" : outcome;
  } else {
    raw = await run();
  }

  if (!raw) {
    await appendHistory(fallbackText);
    return {
      ...base,
      answer: fallbackText,
      fallback: true,
      citations: [],
      refusal: false,
      uncovered,
    };
  }

  // The model's citations are checked against the passages it was given; the ones it got wrong
  // are replaced by the closest passage, and a sentence inventing a name is dropped.
  let answer = raw;
  let citations: GroundedCitation[] = [];
  let fidelity: FidelityReport | undefined;
  let refusal = false;
  if (strict) {
    const answerLang = dominantLang(raw);
    const anchor = anchorPassage(entities, passages, i.aliases ?? lexiconAliases);
    const sameLanguage = answerLang === dominantLang(passages.map((p) => p.text).join(" "));
    const verified = verifyAnswer(raw, i.question, passages, {
      lang: answerLang,
      ...(anchor === undefined ? {} : { anchor }),
    });
    fidelity = verified.report;
    citations = verified.citations;
    answer = verified.answer;
    // Every claim unsupported by the passages (and none of them cited): the model did not answer
    // from the sources. An answer in another language than the passages cannot be compared with them word for word.
    const ungrounded = sameLanguage && verified.report.claims > 0 && verified.report.cited === 0;
    if (!answer || ungrounded) {
      answer = notEstablished(lang, uncovered);
      citations = [];
    }
    refusal = isNotEstablishedAnswer(answer);
  }

  if (scope && i.cache) {
    try {
      await i.cache.store(scope, i.question, answer);
    } catch (error) {
      i.onError?.("cache", error);
    }
  }

  await appendHistory(answer);
  return {
    ...base,
    answer,
    citations,
    refusal,
    uncovered,
    ...(fidelity ? { fidelity } : {}),
  };
}
