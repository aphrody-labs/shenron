#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * infinite-rag-eval.ts — Continuous / Infinite RAG Evaluation Harness for Shenron.
 *
 * Cycles continuously or boundedly across comprehensive test suites:
 * 1. Personnages canoniques
 * 2. Techniques & Transformations
 * 3. Cosmologie & Arcs
 * 4. Épisodes, Lecteurs vidéo & Streaming (VF / VOSTFR / Chapitres manga)
 * 5. Out-of-corpus / Hors-canon (Vérification du refus strict "non établi")
 *
 * Measures:
 * - Hit Rate / Recall@1, Recall@3, Recall@5
 * - Mode breakdown (hybrid, vector, lexical)
 * - Latency p50, p90, p95, min, max
 * - Faithfulness & Grounding (citations valides, zéro hallucination)
 * - Error rate & Uptime
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

export interface RagTestCase {
  id: string;
  category: "personnage" | "technique" | "cosmologie" | "episode_lecteur" | "out_of_corpus";
  q: string;
  persona?: "shenron" | "whis" | "beerus";
  expectedKeywords?: string[];
  expectedUrlPattern?: RegExp;
  shouldRefuse?: boolean;
}

export const EVAL_CASES: RagTestCase[] = [
  // 1. Personnages
  {
    id: "goku_identity",
    category: "personnage",
    q: "Qui est Son Goku ?",
    expectedKeywords: ["saiyan", "terre", "kakarot"],
    expectedUrlPattern: /\/personnages\/son-goku/i,
  },
  {
    id: "vegeta_prince",
    category: "personnage",
    q: "Quel est le statut de Vegeta sur sa planète d'origine ?",
    expectedKeywords: ["prince", "saiyan"],
    expectedUrlPattern: /\/personnages\/vegeta/i,
  },
  {
    id: "piccolo_origin",
    category: "personnage",
    q: "Quelle est l'origine du démon Piccolo et de sa réincarnation ?",
    expectedKeywords: ["namek", "kami", "tout-puissant"],
    expectedUrlPattern: /\/personnages\/piccolo/i,
  },
  // 2. Techniques
  {
    id: "kamehameha_creator",
    category: "technique",
    q: "Qui a créé la technique du Kamehameha ?",
    expectedKeywords: ["tortue", "kame", "sennin", "roshi"],
    expectedUrlPattern: /\/techniques\/kamehameha/i,
  },
  {
    id: "genkidama_nature",
    category: "technique",
    q: "Comment fonctionne le Genkidama enseigné par Kaio ?",
    expectedKeywords: ["kaio", "énergie", "ki", "terre"],
    expectedUrlPattern: /\/techniques\/genkidama/i,
  },
  // 3. Cosmologie
  {
    id: "namek_homeworld",
    category: "cosmologie",
    q: "Sur quelle planète vivent les Nameks dans l'univers 7 ?",
    expectedKeywords: ["namek"],
    expectedUrlPattern: /\/(cosmologie|planetes)\/namek/i,
  },
  // 4. Épisodes & Lecteurs
  {
    id: "ep1_lecteur",
    category: "episode_lecteur",
    q: "Où regarder l'épisode 1 de Dragon Ball Le Grand Départ et quels sont les lecteurs ?",
    expectedKeywords: ["1", "grand", "départ", "lecteur", "vf", "vostfr", "episodes/1"],
    expectedUrlPattern: /\/episodes\/1\b/i,
  },
  {
    id: "ep_dbz_saiyan",
    category: "episode_lecteur",
    q: "Quel est le titre et le lecteur de l'épisode 1 de Dragon Ball Z ?",
    expectedKeywords: ["mystérieux", "guerrier", "raditz", "episodes/"],
    expectedUrlPattern: /\/episodes\//i,
  },
  {
    id: "manga_ch1_reader",
    category: "episode_lecteur",
    q: "Quel est le premier chapitre du manga original et où le lire ?",
    expectedKeywords: ["chapitre", "1", "bulma", "manga"],
    expectedUrlPattern: /\/manga\//i,
  },
  // 5. Out of corpus / Non établi
  {
    id: "ooc_zorgalax",
    category: "out_of_corpus",
    q: "Quelle est la puissance du grand guerrier Zorgalax du clan Krypton ?",
    shouldRefuse: true,
  },
  {
    id: "ooc_super_saiyan_10",
    category: "out_of_corpus",
    q: "À quel moment Goku atteint-il le Super Saiyan 10 dans le canon Toriyama ?",
    shouldRefuse: true,
  },
];

export interface CaseRunResult {
  id: string;
  category: string;
  q: string;
  latencyMs: number;
  status: number;
  mode: string;
  hitCount: number;
  recall1: boolean;
  recall3: boolean;
  recall5: boolean;
  grounded: boolean;
  refusedCorrectly: boolean;
  error?: string;
  answerSnippet?: string;
}

export interface CycleStats {
  cycle: number;
  timestamp: string;
  casesTotal: number;
  successCount: number;
  errorCount: number;
  recall1Rate: number;
  recall3Rate: number;
  recall5Rate: number;
  groundedRate: number;
  refusalAccuracy: number;
  modes: Record<string, number>;
  latencyMs: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p90: number;
    p95: number;
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

export async function evaluateCase(
  c: RagTestCase,
  baseUrl: string,
  timeoutMs = 60_000,
): Promise<CaseRunResult> {
  const start = performance.now();
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/chat`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: c.q }],
        persona: c.persona ?? "shenron",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const elapsed = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        id: c.id,
        category: c.category,
        q: c.q,
        latencyMs: elapsed,
        status: res.status,
        mode: "error",
        hitCount: 0,
        recall1: false,
        recall3: false,
        recall5: false,
        grounded: false,
        refusedCorrectly: false,
        error: `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      answer?: string;
      content?: string;
      hits?: Array<{ title?: string; url?: string; content?: string; snippet?: string }>;
      mode?: string;
    };

    const text = (data.answer || data.content || "").toLowerCase();
    const hits = Array.isArray(data.hits) ? data.hits : [];
    const mode = data.mode || "unknown";

    let recall1 = false;
    let recall3 = false;
    let recall5 = false;

    if (c.expectedUrlPattern) {
      recall1 = hits.length > 0 && c.expectedUrlPattern.test(hits[0]?.url ?? "");
      recall3 = hits.slice(0, 3).some((h) => c.expectedUrlPattern!.test(h?.url ?? ""));
      recall5 = hits.slice(0, 5).some((h) => c.expectedUrlPattern!.test(h?.url ?? ""));
    } else {
      recall1 = hits.length > 0;
      recall3 = hits.length > 0;
      recall5 = hits.length > 0;
    }

    let grounded = false;
    if (c.expectedKeywords && c.expectedKeywords.length > 0) {
      const matchCount = c.expectedKeywords.filter((kw) => text.includes(kw.toLowerCase())).length;
      grounded = matchCount >= Math.min(2, c.expectedKeywords.length);
    } else {
      grounded = text.length > 0;
    }

    const looksRefused =
      text.includes("non établi") ||
      text.includes("pas établi") ||
      text.includes("aucune source") ||
      text.includes("not established") ||
      text.includes("pas mentionné");

    const refusedCorrectly = c.shouldRefuse ? looksRefused : !looksRefused;

    return {
      id: c.id,
      category: c.category,
      q: c.q,
      latencyMs: elapsed,
      status: 200,
      mode,
      hitCount: hits.length,
      recall1,
      recall3,
      recall5,
      grounded: c.shouldRefuse ? true : grounded,
      refusedCorrectly,
      answerSnippet: (data.answer || data.content || "").slice(0, 120),
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - start);
    return {
      id: c.id,
      category: c.category,
      q: c.q,
      latencyMs: elapsed,
      status: 0,
      mode: "error",
      hitCount: 0,
      recall1: false,
      recall3: false,
      recall5: false,
      grounded: false,
      refusedCorrectly: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function computeStats(cycle: number, results: CaseRunResult[]): CycleStats {
  const latencies = results.filter((r) => r.status === 200).map((r) => r.latencyMs);
  const success = results.filter((r) => r.status === 200);
  const total = results.length;

  const modes: Record<string, number> = {};
  for (const r of results) {
    modes[r.mode] = (modes[r.mode] ?? 0) + 1;
  }

  const validUrlCases = results.filter((r) => {
    const tc = EVAL_CASES.find((c) => c.id === r.id);
    return tc?.expectedUrlPattern != null;
  });

  const oocCases = results.filter((r) => {
    const tc = EVAL_CASES.find((c) => c.id === r.id);
    return tc?.shouldRefuse === true;
  });

  const r1Rate = validUrlCases.length > 0
    ? validUrlCases.filter((r) => r.recall1).length / validUrlCases.length
    : 1;
  const r3Rate = validUrlCases.length > 0
    ? validUrlCases.filter((r) => r.recall3).length / validUrlCases.length
    : 1;
  const r5Rate = validUrlCases.length > 0
    ? validUrlCases.filter((r) => r.recall5).length / validUrlCases.length
    : 1;

  const groundedRate = success.filter((r) => r.grounded).length / Math.max(1, success.length);
  const refusalAccuracy = oocCases.length > 0
    ? oocCases.filter((r) => r.refusedCorrectly).length / oocCases.length
    : 1;

  const sumLat = latencies.reduce((a, b) => a + b, 0);

  return {
    cycle,
    timestamp: new Date().toISOString(),
    casesTotal: total,
    successCount: success.length,
    errorCount: results.filter((r) => r.status !== 200).length,
    recall1Rate: Math.round(r1Rate * 1000) / 10,
    recall3Rate: Math.round(r3Rate * 1000) / 10,
    recall5Rate: Math.round(r5Rate * 1000) / 10,
    groundedRate: Math.round(groundedRate * 1000) / 10,
    refusalAccuracy: Math.round(refusalAccuracy * 1000) / 10,
    modes,
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : 0,
      max: latencies.length ? Math.max(...latencies) : 0,
      mean: latencies.length ? Math.round(sumLat / latencies.length) : 0,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
    },
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      url: { type: "string", default: "https://dragonballfr.com" },
      cycles: { type: "string", default: "1" },
      infinite: { type: "boolean", default: false },
      "sleep-sec": { type: "string", default: "5" },
      timeout: { type: "string", default: "90000" },
      report: { type: "string", default: "var/reports/infinite-rag-eval.json" },
    },
  });

  const baseUrl = values.url!;
  const maxCycles = values.infinite ? Infinity : Math.max(1, parseInt(values.cycles ?? "1", 10));
  const sleepSec = Math.max(0, parseInt(values["sleep-sec"] ?? "5", 10));
  const timeoutMs = parseInt(values.timeout ?? "90000", 10);
  const reportPath = values.report!;

  console.log(`[Shenron Infinite RAG Eval] Démarrage...`);
  console.log(`- Cible URL : ${baseUrl}`);
  console.log(`- Nombre de cas par cycle : ${EVAL_CASES.length}`);
  console.log(`- Mode : ${values.infinite ? "Infini (interrompre avec Ctrl+C)" : `${maxCycles} cycle(s)`}`);
  console.log(`- Rapport : ${reportPath}\n`);

  const history: CycleStats[] = [];

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    console.log(`=== Cycle ${cycle}${maxCycles === Infinity ? "" : `/${maxCycles}`} ===`);
    const results: CaseRunResult[] = [];

    for (const testCase of EVAL_CASES) {
      process.stdout.write(`  [${testCase.category}] ${testCase.id} ... `);
      const res = await evaluateCase(testCase, baseUrl, timeoutMs);
      results.push(res);
      if (res.status === 200) {
        console.log(`OK (${res.latencyMs}ms, mode: ${res.mode}, hits: ${res.hitCount})`);
      } else {
        console.log(`ERR (${res.error})`);
      }
    }

    const stats = computeStats(cycle, results);
    history.push(stats);

    console.log(`\n--- Bilan Cycle ${cycle} ---`);
    console.log(`  Succès: ${stats.successCount}/${stats.casesTotal} (${stats.errorCount} erreurs)`);
    console.log(`  Recall@1: ${stats.recall1Rate}% | Recall@3: ${stats.recall3Rate}% | Recall@5: ${stats.recall5Rate}%`);
    console.log(`  Grounding: ${stats.groundedRate}% | Refus canon strict: ${stats.refusalAccuracy}%`);
    console.log(`  Latence: p50=${stats.latencyMs.p50}ms | p90=${stats.latencyMs.p90}ms | p95=${stats.latencyMs.p95}ms | mean=${stats.latencyMs.mean}ms`);
    console.log(`  Modes RAG: ${JSON.stringify(stats.modes)}\n`);

    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          target: baseUrl,
          lastUpdated: new Date().toISOString(),
          totalCycles: cycle,
          latest: stats,
          history,
        },
        null,
        2,
      ) + "\n",
    );

    if (cycle < maxCycles && sleepSec > 0) {
      await Bun.sleep(sleepSec * 1000);
    }
  }

  console.log(`[Shenron Infinite RAG Eval] Terminé avec succès.`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Échec RAG eval:", err);
    process.exitCode = 1;
  });
}
