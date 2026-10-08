#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Master Autonomous Daemon for Shenron (dragonballfr.com).
 *
 * Continuously coordinates all infrastructure & AI automation:
 *   1. Native SSH / WireGuard tunnels to the two VPS (VPS & DBFR)
 *   2. Continuous container deployment on git push to `main`
 *   3. Autonomous web crawl of official sources and RAG rebuild
 *   4. Continuous RAG evaluation & LLM fine-tuning on CUDA (RTX 4070) or CPU
 *   5. Continuous OVH status, DNS validation and VPS renewal monitoring
 *
 * Usage:
 *   bun scripts/ops/shenron-daemon.ts [--status] [--all-in-one] [--device cuda|cpu]
 */

import { checkAndDeploy } from "./auto-deploy";
import { executeCrawlAndRagUpdate } from "./auto-crawl-rag";
import { executeEvaluationAndFineTuning, detectHardwareAcceleration } from "./auto-eval-finetune";
import { checkTunnelStatus } from "./native-tunnel";
import { runOvhChecks } from "./ovh-shenron";

export interface DaemonConfig {
  allInOne: boolean;
  device: "cuda" | "cpu" | "auto";
  deployIntervalSec: number;
  crawlIntervalHours: number;
  finetuneIntervalHours: number;
  ovhIntervalHours: number;
}

export async function runDaemonStatus(): Promise<void> {
  console.log("==========================================================");
  console.log("🐉 SHENRON MASTER DAEMON — ÉTAT DU SYSTÈME AUTOMATISÉ    ");
  console.log("==========================================================");

  // 1. Accélération matérielle
  const hw = await detectHardwareAcceleration();
  console.log(
    `• Accélération LLM : ${hw.device.toUpperCase()} ${hw.gpuName ? `(${hw.gpuName}, ${hw.vramMb} MiB)` : ""}`,
  );

  // 2. Tunnel natif
  console.log("\n[1/4] Tunnel Réseau Natif :");
  await checkTunnelStatus().catch((e) => console.log("  Erreur sondage tunnel:", e));

  // 3. Conteneurs
  console.log("\n[2/4] État des Conteneurs Shenron :");
  const statusProc = Bun.spawn(["bun", "scripts/ops/container.ts", "status"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await statusProc.exited;

  // 4. OVH et DNS
  console.log("\n[3/4] Surveillance OVH & DNS :");
  const ovh = await runOvhChecks();
  for (const d of ovh.dnsChecks) {
    console.log(
      `  - ${d.host} : ${d.ok ? `OK (${d.resolvedIp?.join(", ")})` : `ÉCHEC (${d.error})`}`,
    );
  }

  console.log("\n==========================================================");
}

export async function startMasterDaemon(config: DaemonConfig): Promise<void> {
  console.log("==========================================================");
  console.log("🐉 DÉMARRAGE DU SHENRON MASTER DAEMON (AUTONOME)          ");
  console.log("==========================================================");
  console.log(`• Mode Déploiement : ${config.allInOne ? "All-In-One Conteneur" : "Pile Compose"}`);
  console.log(`• Accélération     : ${config.device.toUpperCase()}`);
  console.log(`• Cycle Git Sync   : Toutes les ${config.deployIntervalSec}s`);
  console.log(`• Cycle RAG Crawl  : Toutes les ${config.crawlIntervalHours}h`);
  console.log(`• Cycle Fine-Tuning: Toutes les ${config.finetuneIntervalHours}h\n`);

  // Boucle 1 : Git Auto-Deploy sur push main (fréquent)
  setInterval(async () => {
    try {
      await checkAndDeploy(config.allInOne);
    } catch (err) {
      console.error("[Daemon Auto-Deploy] Erreur cycle:", err);
    }
  }, config.deployIntervalSec * 1000);

  // Boucle 2 : Auto-Crawl & RAG Update (périodique)
  setInterval(
    async () => {
      try {
        await executeCrawlAndRagUpdate();
      } catch (err) {
        console.error("[Daemon RAG Crawl] Erreur cycle:", err);
      }
    },
    config.crawlIntervalHours * 3600 * 1000,
  );

  // Boucle 3 : Auto-Eval & Fine-Tuning LLM (périodique)
  setInterval(
    async () => {
      try {
        await executeEvaluationAndFineTuning({ device: config.device });
      } catch (err) {
        console.error("[Daemon Fine-Tuning] Erreur cycle:", err);
      }
    },
    config.finetuneIntervalHours * 3600 * 1000,
  );

  // Exécution initiale immédiate d'un contrôle
  await checkAndDeploy(config.allInOne).catch(() => {});
  console.log("\n--> Master Daemon actif. Toutes les boucles tournent en continu.");
}

async function main() {
  const isStatus = process.argv.includes("--status");
  if (isStatus) {
    await runDaemonStatus();
    return;
  }

  const allInOne = process.argv.includes("--all-in-one");
  const deviceArg = process.argv.find((a) => a.startsWith("--device="));
  const device = (deviceArg ? deviceArg.split("=")[1]! : "auto") as "cuda" | "cpu" | "auto";

  await startMasterDaemon({
    allInOne,
    device,
    deployIntervalSec: 20,
    crawlIntervalHours: 4,
    finetuneIntervalHours: 6,
    ovhIntervalHours: 12,
  });
}

if (import.meta.main) {
  await main();
}
