#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Faithfulness evaluation of the grounded RAG chat (`POST /api/public/rag/chat`).
 *
 * The set is deterministic (`packages/pipeline/test/ai/fixtures/eval/rag-faithfulness.json`:
 * questions in fr, en and ja, answerable ones and entities that do not exist in the canon). For
 * each question the script measures:
 * - citation validity: every citation (and every `[n]` marker) of the answer is a source of the
 *   `hits` the same response returned; an answer with no citation is not valid;
 * - invented references: "episode 142", "tome 7"… that no returned passage contains;
 * - refusal: an out-of-corpus entity must be refused ("not established in the sources"), an
 *   answerable question must not be;
 * - keyword coverage of the answerable ones, collected-document pollution of the top hits,
 *   latency (p50, p95).
 *
 * Usage: `bun scripts/ops/eval-rag-faithfulness.ts [--url <chat url>] [--label <name>]
 * [--persona whis] [--timeout 90000] [--only <id,id>] [--out <file>]`. The JSON report goes to
 * `var/reports/` (never `docs/`).
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  COLLECTED_MARKER,
  fold,
  isCollectedDocument,
} from "@aphrody/shenron-pipeline/ai/grounding";
import { isNotEstablishedAnswer } from "@aphrody/shenron-pipeline/ai/prompts";

const REPO_ROOT = Bun.fileURLToPath(new URL("../../", import.meta.url));
const DATASET = join(REPO_ROOT, "packages/pipeline/test/ai/fixtures/eval/rag-faithfulness.json");
export const DEFAULT_URL = "https://bot.dragonballfr.com/api/public/rag/chat";

export type CaseKind = "answerable" | "out_of_corpus";

export interface EvalCase {
  id: string;
  lang: "fr" | "en" | "ja";
  kind: CaseKind;
  category: string;
  q: string;
  expectAny?: string[];
}

export interface ChatHit {
  title?: string;
  url?: string;
  sourceId?: string;
  kind?: string;
  snippet?: string;
  content?: string;
}

export interface ChatCitation {
  n?: number;
  url?: string;
  title?: string;
  sourceId?: string;
}

export interface ChatResponse {
  answer?: string;
  hits?: ChatHit[];
  citations?: ChatCitation[];
  refusal?: boolean;
  error?: string;
}

export interface CaseScore {
  id: string;
  lang: string;
  kind: CaseKind;
  category: string;
  q: string;
  status: number;
  latencyMs: number;
  error?: string;
  answer: string;
  refused: boolean;
  /** Refusal behaviour is the expected one for this case. */
  refusalCorrect: boolean;
  /** `true`/`false` for an answer that is not a refusal; `null` for a refusal. */
  citationValid: boolean | null;
  citations: number;
  citationsOutsideHits: number;
  markersWithoutCitation: number;
  inventedReferences: string[];
  keywordHit: boolean | null;
  collectedInTop3: number;
  firstCollectedRank: number | null;
  hits: { rank: number; sourceId: string | null; kind: string | null; url: string | null }[];
}

const REFUSAL_TEXT = [
  /non établi/i,
  /not established/i,
  /出典では確認できません/,
  /aucun passage/i,
  /no sourced passage/i,
  /je ne possède pas cette information/i,
  /je n'ai (?:trouvé )?aucune? (?:information|donnée|source)/i,
  /i (?:do not|don't|can't|cannot) (?:have|find)/i,
  /情報(?:が)?(?:見つかりません|ありません)/,
];

/** The answer refuses: the API says so, or its text carries a refusal wording (older servers). */
export function looksRefused(response: ChatResponse): boolean {
  if (response.refusal === true) return true;
  const answer = response.answer ?? "";
  return isNotEstablishedAnswer(answer) || REFUSAL_TEXT.some((re) => re.test(answer));
}

const REFERENCE =
  /(?:épisode|episode|tome|chapitre|chapter|volume|film|saga)s?\s+n?°?\s*(\d{1,4})/giu;

/** "episode 142", "tome 7"… found in the answer but in none of the returned passages. */
export function inventedReferences(answer: string, hits: readonly ChatHit[]): string[] {
  const evidence = hits
    .map((hit) => `${hit.title ?? ""} ${hit.content ?? hit.snippet ?? ""}`)
    .join("\n");
  const found: string[] = [];
  for (const match of answer.matchAll(REFERENCE)) {
    const number = match[1] ?? "";
    if (!new RegExp(`(?<!\\d)${number}(?!\\d)`).test(evidence)) found.push(match[0]);
  }
  return found;
}

function markers(answer: string): number[] {
  return [...answer.matchAll(/\[(\d{1,3})\]/g)].map((match) => Number(match[1]));
}

export function scoreCase(
  item: EvalCase,
  response: ChatResponse,
  meta: { status: number; latencyMs: number; error?: string },
): CaseScore {
  const hits = response.hits ?? [];
  const answer = response.answer ?? "";
  const refused = looksRefused(response);
  const hitUrls = new Set(hits.map((hit) => hit.url ?? "").filter(Boolean));
  const citations = response.citations ?? [];
  const citationsOutsideHits = citations.filter((c) => !c.url || !hitUrls.has(c.url)).length;
  const known = new Set(citations.map((c) => c.n));
  const markersWithoutCitation = markers(answer).filter((n) => !known.has(n)).length;
  const answered = meta.status === 200 && !meta.error;
  let citationValid: boolean | null = null;
  if (answered && !refused) {
    citationValid =
      citations.length > 0 && citationsOutsideHits === 0 && markersWithoutCitation === 0;
  }
  const folded = fold(answer);
  const keywordHit =
    item.kind === "answerable" && answered
      ? (item.expectAny ?? []).some((word) => folded.includes(fold(word)))
      : null;
  const flags = hits.map((hit) =>
    isCollectedDocument({ ...hit, id: "", title: hit.title ?? "", url: hit.url ?? "" }),
  );
  const firstCollected = flags.indexOf(true);
  return {
    id: item.id,
    lang: item.lang,
    kind: item.kind,
    category: item.category,
    q: item.q,
    status: meta.status,
    latencyMs: meta.latencyMs,
    ...(meta.error ? { error: meta.error } : {}),
    answer,
    refused,
    refusalCorrect: answered && (item.kind === "out_of_corpus" ? refused : !refused),
    citationValid,
    citations: citations.length,
    citationsOutsideHits,
    markersWithoutCitation,
    inventedReferences: answered ? inventedReferences(answer, hits) : [],
    keywordHit,
    collectedInTop3: flags.slice(0, 3).filter(Boolean).length,
    firstCollectedRank: firstCollected < 0 ? null : firstCollected + 1,
    hits: hits.map((hit, index) => ({
      rank: index + 1,
      sourceId: hit.sourceId ?? null,
      kind: hit.kind ?? null,
      url: hit.url ?? null,
    })),
  };
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  ]!;
}

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : Math.round((num / den) * 1000) / 1000;

export interface Summary {
  cases: number;
  failedRequests: number;
  /** Answers (not refusals) whose citations all belong to the returned hits. */
  validCitationRate: number | null;
  answeredWithoutCitation: number;
  citationsOutsideHits: number;
  inventedReferences: number;
  /** Out-of-corpus questions refused. */
  refusalRate: number | null;
  /** Answerable questions refused by mistake. */
  falseRefusalRate: number | null;
  /** Answerable questions whose answer mentions an expected keyword. */
  keywordRate: number | null;
  /** Collected documents among the first three hits, averaged over the cases. */
  collectedInTop3Mean: number;
  latencyMs: { p50: number; p95: number; max: number };
}

export function summarize(scores: readonly CaseScore[]): Summary {
  const ok = scores.filter((s) => s.status === 200 && !s.error);
  const answered = ok.filter((s) => !s.refused);
  const ooc = ok.filter((s) => s.kind === "out_of_corpus");
  const answerable = ok.filter((s) => s.kind === "answerable");
  const latencies = scores.map((s) => s.latencyMs);
  return {
    cases: scores.length,
    failedRequests: scores.length - ok.length,
    validCitationRate: rate(
      answered.filter((s) => s.citationValid === true).length,
      answered.length,
    ),
    answeredWithoutCitation: answered.filter((s) => s.citations === 0).length,
    citationsOutsideHits: ok.reduce((sum, s) => sum + s.citationsOutsideHits, 0),
    inventedReferences: ok.reduce((sum, s) => sum + s.inventedReferences.length, 0),
    refusalRate: rate(ooc.filter((s) => s.refused).length, ooc.length),
    falseRefusalRate: rate(answerable.filter((s) => s.refused).length, answerable.length),
    keywordRate: rate(answerable.filter((s) => s.keywordHit === true).length, answerable.length),
    collectedInTop3Mean:
      ok.length === 0
        ? 0
        : Math.round((ok.reduce((sum, s) => sum + s.collectedInTop3, 0) / ok.length) * 100) / 100,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: Math.max(0, ...latencies),
    },
  };
}

/** Check the wire shape before scoring; HTTP success alone is not an answer. */
function isChatResponse(value: unknown): value is ChatResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  const optionalString = (item: unknown) => item === undefined || typeof item === "string";
  const records = (items: unknown, fields: readonly string[]) =>
    items === undefined ||
    (Array.isArray(items) &&
      items.every((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const record = item as Record<string, unknown>;
        return (
          fields.every((field) => optionalString(record[field])) &&
          (record.n === undefined || (Number.isSafeInteger(record.n) && Number(record.n) > 0))
        );
      }));
  return (
    optionalString(body.answer) &&
    optionalString(body.error) &&
    (body.refusal === undefined || typeof body.refusal === "boolean") &&
    records(body.hits, ["title", "url", "sourceId", "kind", "snippet", "content"]) &&
    records(body.citations, ["url", "title", "sourceId"])
  );
}

export async function ask(
  url: string,
  item: EvalCase,
  persona: string,
  timeoutMs: number,
): Promise<{ response: ChatResponse; status: number; latencyMs: number; error?: string }> {
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "accept-language": item.lang },
      body: JSON.stringify({ q: item.q, persona, lang: item.lang }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw: unknown = await res.json().catch(() => null);
    const body = isChatResponse(raw) ? raw : {};
    const error = !res.ok
      ? (body.error ?? `http_${res.status}`)
      : !isChatResponse(raw) || !body.answer?.trim()
        ? "invalid_chat_response"
        : body.error;
    return {
      response: body,
      status: res.status,
      latencyMs: Math.round(performance.now() - started),
      ...(error ? { error } : {}),
    };
  } catch (error) {
    return {
      response: {},
      status: 0,
      latencyMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.name : "fetch_failed",
    };
  }
}

function option(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const url = option(args, "url") ?? DEFAULT_URL;
  const label = (option(args, "label") ?? "run").replace(/[^\w.-]/g, "-");
  const persona = option(args, "persona") ?? "whis";
  const timeoutMs = Number(option(args, "timeout") ?? 90_000);
  const only = option(args, "only")?.split(",");
  const dataset = (await Bun.file(DATASET).json()) as { cases: EvalCase[] };
  const cases = dataset.cases.filter((item) => !only || only.includes(item.id));

  const scores: CaseScore[] = [];
  for (const item of cases) {
    // Sequential on purpose: one llama slot, and the latency of each question is measured alone.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const { response, ...meta } = await ask(url, item, persona, timeoutMs);
    const score = scoreCase(item, response, meta);
    scores.push(score);
    const verdict =
      score.error || score.status !== 200
        ? `ERREUR ${score.error ?? score.status}`
        : item.kind === "out_of_corpus"
          ? score.refused
            ? "refus"
            : "INVENTE"
          : score.refused
            ? "REFUS A TORT"
            : score.citationValid
              ? "cite"
              : "sans citation valide";
    console.log(`${item.id.padEnd(30)} ${String(score.latencyMs).padStart(6)} ms  ${verdict}`);
  }

  const summary = summarize(scores);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out =
    option(args, "out") ??
    join(REPO_ROOT, "var", "reports", `rag-faithfulness-${label}-${stamp}.json`);
  await mkdir(join(out, ".."), { recursive: true });
  await Bun.write(
    out,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), url, label, persona, collectedMarker: COLLECTED_MARKER, summary, cases: scores }, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
  console.log(`report: ${out}`);
  if (summary.failedRequests > 0 || cases.length === 0) process.exitCode = 1;
}

if (import.meta.main) await main();
