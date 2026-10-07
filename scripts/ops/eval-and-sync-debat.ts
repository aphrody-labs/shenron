#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * eval-and-sync-debat.ts
 *
 * Évaluation complète du RAG Shenron (172 cas dorés) accélérée sur GPU NVIDIA GeForce RTX 4070,
 * avec synchronisation en direct sur le salon Discord #debat d'Aphrody (1557364553283543161).
 *
 * Architecture :
 *   1. Calcul GPU CUDA parallèle (SentenceTransformer multilingue E5 sur RTX 4070)
 *   2. Retrieval Hybride RAG parallèle via le service Aphrody RAG (256 161 vecteurs)
 *   3. Agrégation des métriques (Recall@1/3/5/10, MRR, nDCG, latences p50/p95, stats VRAM)
 *   4. Publication d'un Embed enrichi dans le salon Discord #debat
 */

import { AphrodyComputeClient } from "../../packages/pipeline/src/aphrody/compute";
import {
  aggregate,
  aggregateByTag,
  parseGold,
  runCase,
  type CaseResult,
  type GoldCase,
} from "../../packages/pipeline/src/ai/eval";
import { join } from "node:path";
import { homedir } from "node:os";

const REPO_ROOT = join(import.meta.dir, "..", "..");
const GOLD_PATH = join(REPO_ROOT, "apps", "bot", "tests", "rag-gold.jsonl");
const MCP_ENV_PATH = join(homedir(), ".aphrody/private/mcp-environment/aphrody.json");
const DISCORD_CHANNEL_ID = "1557364553283543161"; // Salon #debat d'Aphrody
const PYTHON_VENV = "/home/aphro/aphrody/py/.venv/bin/python";
const MODEL_PATH = "/home/aphro/.aphrody/models/intfloat--multilingual-e5-small";

function renderBar(pct: number, max = 100, width = 10): string {
  const filled = Math.round((pct / max) * width);
  const empty = width - filled;
  return `[${"█".repeat(Math.max(0, filled))}${"░".repeat(Math.max(0, empty))}] ${pct.toFixed(1)}%`;
}

interface GpuBenchmarkResult {
  device: string;
  cudaVersion: string;
  totalQueries: number;
  totalElapsedSecs: number;
  qps: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  vramAllocatedMb: number;
  vramReservedMb: number;
}

async function runGpuBenchmark(queries: string[]): Promise<GpuBenchmarkResult> {
  console.log(`⚡ [GPU] Démarrage du banc CUDA sur NVIDIA RTX 4070 pour ${queries.length} requêtes...`);

  const pyScript = `
import torch
import time
import json
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("${MODEL_PATH}", device="cuda")
queries = json.loads('''${JSON.stringify(queries)}''')
formatted = [f"query: {q}" for q in queries]

torch.cuda.reset_peak_memory_stats()
torch.cuda.synchronize()

latencies = []
start = time.perf_counter()

# Warmup
_ = model.encode(formatted[:4], batch_size=4, normalize_embeddings=True)
torch.cuda.synchronize()

for q in formatted:
    t0 = time.perf_counter()
    _ = model.encode([q], normalize_embeddings=True)
    torch.cuda.synchronize()
    latencies.append((time.perf_counter() - t0) * 1000)

total_elapsed = time.perf_counter() - start
latencies.sort()

def pct(p):
    idx = min(len(latencies) - 1, max(0, int(len(latencies) * p)))
    return latencies[idx]

vram_alloc = torch.cuda.max_memory_allocated() / (1024 * 1024)
vram_res = torch.cuda.max_memory_reserved() / (1024 * 1024)
device_name = torch.cuda.get_device_name(0)
cuda_ver = torch.version.cuda

stats = {
    "device": device_name,
    "cudaVersion": str(cuda_ver),
    "totalQueries": len(queries),
    "totalElapsedSecs": round(total_elapsed, 3),
    "qps": round(len(queries) / total_elapsed, 2),
    "latencyP50Ms": round(pct(0.50), 2),
    "latencyP95Ms": round(pct(0.95), 2),
    "latencyP99Ms": round(pct(0.99), 2),
    "vramAllocatedMb": round(vram_alloc, 2),
    "vramReservedMb": round(vram_res, 2),
}
print("___JSON_START___" + json.dumps(stats) + "___JSON_END___")
`;

  const child = Bun.spawn([PYTHON_VENV, "-c", pyScript], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`GPU benchmark failed (exit ${exitCode}): ${stderr}`);
  }

  const match = stdout.match(/___JSON_START___(.*?)___JSON_END___/);
  if (!match) throw new Error("Impossible de décoder les statistiques GPU");
  return JSON.parse(match[1]!) as GpuBenchmarkResult;
}

async function runShenronRetrieval(
  gold: GoldCase[],
  client: AphrodyComputeClient,
  concurrency = 3,
): Promise<{ results: CaseResult[]; modes: Record<string, number>; elapsedMs: number }> {
  console.log(`🔍 [Retrieval] Évaluation de ${gold.length} cas dorés (concurrence ${concurrency})...`);
  const t0 = performance.now();
  const results: CaseResult[] = [];
  const modes: Record<string, number> = {};
  let cursor = 0;

  async function worker(id: number) {
    while (cursor < gold.length) {
      const idx = cursor++;
      const testCase = gold[idx]!;

      let res: CaseResult | null = null;
      let retries = 3;

      while (retries > 0) {
        try {
          res = await runCase(testCase, async (q) => {
            const { results: hits, mode } = await client.ragSearchWithMode(q, 10);
            return { mode, results: hits };
          });
          break;
        } catch (err: any) {
          retries--;
          if (retries === 0) {
            console.error(`  ✗ [Worker ${id}] Échec définitif cas ${idx} (${testCase.q}): ${err.message}`);
            res = {
              case: testCase,
              rank: 0,
              ndcg: 0,
              top: [],
              latencyMs: 0,
              mode: "error",
            };
          } else {
            await Bun.sleep(300);
          }
        }
      }

      if (res) {
        modes[res.mode] = (modes[res.mode] ?? 0) + 1;
        results.push(res);
        if (results.length % 35 === 0 || results.length === gold.length) {
          console.log(`  ✓ Progression retrieval : ${results.length}/${gold.length} cas traités`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
  const elapsedMs = Math.round(performance.now() - t0);
  return { results, modes, elapsedMs };
}

async function fetchDiscordToken(): Promise<string> {
  const proc = Bun.spawnSync([
    "ssh",
    "vps",
    "grep '^DISCORD_BOT_TOKEN=' /etc/aphrody-discord.env | cut -d= -f2 | tr -d '\"' | tr -d '\\r' | tr -d '\\n'",
  ]);
  const token = proc.stdout.toString().trim();
  if (!token) throw new Error("Impossible de récupérer le token Discord du bot");
  return token;
}

async function syncToDiscordDebate(
  token: string,
  agg: ReturnType<typeof aggregate>,
  gpu: GpuBenchmarkResult,
  stats: any,
  casesCount: number,
  retrievalElapsedMs: number,
  modes: Record<string, number>,
) {
  console.log(`📢 [Discord] Publication des résultats dans le salon #debat (${DISCORD_CHANNEL_ID})...`);

  const r1 = agg.recall[1] * 100;
  const r3 = agg.recall[3] * 100;
  const r5 = agg.recall[5] * 100;
  const r10 = agg.recall[10] * 100;
  const mrr = agg.mrr * 100;
  const ndcg = agg.ndcg * 100;

  const embed = {
    color: 0xf59e0b, // Or Dragon Ball
    author: {
      name: "SHENRON RAG · RAPPORT D'ÉVALUATION COMPLET (GPU ACCELERATED)",
      icon_url: "https://dragonballfr.com/favicon.ico",
    },
    title: `🎯 Benchmarking Retrieval : ${casesCount} cas dorés évalués`,
    description:
      `*Évaluation autonome haute précision exécutée sur l'accélérateur matériel local et synchronisée dans le salon Débat.*`,
    fields: [
      {
        name: "📊 Qualité de Récupération (Retrieval Accuracy)",
        value: [
          `**Recall@1 (Top 1) :** \`${renderBar(r1)}\``,
          `**Recall@3 (Top 3) :** \`${renderBar(r3)}\``,
          `**Recall@5 (Top 5) :** \`${renderBar(r5)}\``,
          `**Recall@10 (Top 10) :** \`${renderBar(r10)}\``,
          `**MRR (Mean Reciprocal Rank) :** \`${mrr.toFixed(1)}%\``,
          `**nDCG@10 (Qualité de placement) :** \`${ndcg.toFixed(1)}%\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "⚡ Accélération Matérielle GPU (Local Inference)",
        value: [
          `• **GPU :** \`${gpu.device}\``,
          `• **CUDA Version :** \`${gpu.cudaVersion}\``,
          `• **VRAM Allouée :** \`${gpu.vramAllocatedMb} MB\` (Peak: \`${gpu.vramReservedMb} MB\`)`,
          `• **Débit Inférence GPU :** \`${gpu.qps} QPS\``,
          `• **Latence Inférence :** p50 = \`${gpu.latencyP50Ms} ms\` · p95 = \`${gpu.latencyP95Ms} ms\` · p99 = \`${gpu.latencyP99Ms} ms\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📚 Couverture Corpus & Pipeline",
        value: [
          `• **Chunks Indexés :** \`${stats.chunks.toLocaleString("fr-FR")}\` documents`,
          `• **Vecteurs Denses :** \`${stats.vectors.toLocaleString("fr-FR")}\` embeddings (E5 384d)`,
          `• **Modes de Retrieval :** \`${Object.entries(modes).map(([m, c]) => `${m}: ${c}`).join(" · ")}\``,
          `• **Durée Totale Retrieval :** \`${(retrievalElapsedMs / 1000).toFixed(1)} s\` (\`${Math.round(retrievalElapsedMs / casesCount)} ms/requête\`)`,
          `• **Statut Gate CI (R@5 ≥ 80%) :** ${r5 >= 80 ? "✅ **VALIDÉ (PASS)**" : "❌ **RÉGRESSION**"}`,
        ].join("\n"),
        inline: false,
      },
    ],
    footer: {
      text: "Shenron Autonomous Engineering · Aphrody Fleet",
    },
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      content: `🐉 **[Shenron RAG Audit]** Évaluation complète du Retrieval & Accélération GPU terminée avec succès.`,
      embeds: [embed],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Échec publication Discord (${response.status}): ${errorText}`);
  }

  const message = await response.json();
  console.log(`✓ [Discord] Rapport publié avec succès ! Message ID: ${message.id}`);
  return message;
}

async function main() {
  console.log("🐉 ========================================================");
  console.log("   SHENRON RAG EVALUATION & GPU BENCHMARK (PARALLEL)");
  console.log("========================================================\n");

  // 1. Initialisation client Aphrody
  const mcpEnv = await Bun.file(MCP_ENV_PATH).json();
  process.env.APHRODY_AI_HTTP_URL = "http://127.0.0.1:8791";
  process.env.APHRODY_AI_HTTP_TOKEN = mcpEnv.APHRODY_AI_HTTP_TOKEN;

  const client = new AphrodyComputeClient({
    baseUrl: process.env.APHRODY_AI_HTTP_URL,
    token: process.env.APHRODY_AI_HTTP_TOKEN,
  });

  const health = await client.health();
  if (!health.rag) {
    throw new Error("Aphrody RAG est indisponible sur 127.0.0.1:8791");
  }
  const stats = await client.ragStats();
  console.log(`✓ Aphrody RAG en ligne : ${stats.chunks} chunks, ${stats.vectors} vecteurs denses.\n`);

  // 2. Chargement du dataset doré
  const goldText = await Bun.file(GOLD_PATH).text();
  const gold = parseGold(goldText);
  console.log(`✓ Jeu doré chargé : ${gold.length} cas de test (${GOLD_PATH})\n`);

  const queries = gold.map((c) => c.q);

  // 3. Exécution PARALLÈLE : GPU Benchmark + Retrieval Evaluation
  console.log("🚀 Lancement simultané du banc GPU CUDA et du Retrieval RAG...");
  const [gpuResult, retrievalResult, discordToken] = await Promise.all([
    runGpuBenchmark(queries),
    runShenronRetrieval(gold, client, 3),
    fetchDiscordToken(),
  ]);

  console.log("\n========================================================");
  console.log("   RÉSULTATS DE L'ÉVALUATION");
  console.log("========================================================");

  const agg = aggregate(retrievalResult.results);
  console.log(`Recall@1  : ${(agg.recall[1] * 100).toFixed(1)}%`);
  console.log(`Recall@3  : ${(agg.recall[3] * 100).toFixed(1)}%`);
  console.log(`Recall@5  : ${(agg.recall[5] * 100).toFixed(1)}%`);
  console.log(`Recall@10 : ${(agg.recall[10] * 100).toFixed(1)}%`);
  console.log(`MRR       : ${(agg.mrr * 100).toFixed(1)}%`);
  console.log(`nDCG@10   : ${(agg.ndcg * 100).toFixed(1)}%`);
  console.log(`GPU Dev   : ${gpuResult.device} (${gpuResult.vramAllocatedMb} MB VRAM)`);
  console.log(`GPU QPS   : ${gpuResult.qps} req/s`);
  console.log("========================================================\n");

  // 4. Enregistrement local des rapports
  const fullReport = {
    date: new Date().toISOString(),
    casesCount: gold.length,
    retrieval: {
      metrics: agg,
      modes: retrievalResult.modes,
      durationMs: retrievalResult.elapsedMs,
      byTag: aggregateByTag(retrievalResult.results),
    },
    gpu: gpuResult,
    stats,
  };

  const reportOut = join(REPO_ROOT, "var", "reports", "rag-eval-gpu-latest.json");
  await Bun.write(reportOut, JSON.stringify(fullReport, null, 2));
  console.log(`✓ Rapport complet JSON sauvegardé dans ${reportOut}`);

  const gpuStatsOut = join(REPO_ROOT, "var", "reports", "rag_gpu_stats.json");
  await Bun.write(gpuStatsOut, JSON.stringify(gpuResult, null, 2));
  console.log(`✓ Statistiques GPU sauvegardées dans ${gpuStatsOut}\n`);

  // 5. Synchronisation Discord dans le salon #debat
  await syncToDiscordDebate(
    discordToken,
    agg,
    gpuResult,
    stats,
    gold.length,
    retrievalResult.elapsedMs,
    retrievalResult.modes,
  );

  console.log("\n🎉 Évaluation Shenron RAG complète et synchronisation terminées !");
}

main().catch((err) => {
  console.error("\n❌ ERREUR FATALE :", err);
  process.exit(1);
});
