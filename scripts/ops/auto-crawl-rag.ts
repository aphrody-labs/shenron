#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Automated Web Crawl & RAG Synchronizer for Dragon Ball FR.
 *
 * 1. Crawls official Dragon Ball content via Aphrody Web API
 * 2. Rebuilds public VFS knowledge database (`shenron-vfs.sqlite`)
 * 3. Syncs embeddings with Aphrody AI HTTP RAG index
 *
 * Usage:
 *   bun scripts/ops/auto-crawl-rag.ts [--watch] [--interval-hours 6] [--dry-run]
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

async function runStep(label: string, command: string[]): Promise<boolean> {
  console.log(`\n--> [RAG Pipeline] ${label}...`);
  const p = Bun.spawn(command, {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await p.exited;
  if (code !== 0) {
    console.error(`Échec de l'étape : ${label} (code ${code})`);
    return false;
  }
  console.log(`✓ Étape réussie : ${label}`);
  return true;
}

export async function executeCrawlAndRagUpdate(dryRun = false): Promise<boolean> {
  console.log("==========================================================");
  console.log("🐲 SHENRON — AUTO CRAWL WEB & SYNCHRONISATION DU RAG     ");
  console.log("==========================================================");

  // 1. Crawl officiel Dragon Ball
  const hasToken = Boolean(process.env.APHRODY_WEB_API_TOKEN || process.env.APHRODY_BXC_API_TOKEN);
  if (hasToken) {
    const crawlArgs = [
      "bun",
      "scripts/ops/crawl-dragon-ball-official-aphrody.ts",
      dryRun ? "--dry-run" : "--apply",
    ];
    const crawlOk = await runStep("Crawl du site officiel Dragon Ball (Aphrody Web)", crawlArgs);
    if (!crawlOk && !dryRun) return false;
  } else {
    console.log(
      "\n--> [Avertissement] APHRODY_WEB_API_TOKEN absent de l'environnement: étape de crawl en ligne ignorée.",
    );
  }

  console.error(
    "Les captures du crawl Aphrody ne sont pas encore ingérées dans les tables éditoriales du wiki. Aucun VFS/RAG n'a été reconstruit.",
  );
  return dryRun;
}

async function main() {
  const isWatch = process.argv.includes("--watch");
  const dryRun = process.argv.includes("--dry-run");
  const hoursArg = process.argv.find((a) => a.startsWith("--interval-hours="));
  const intervalHours = hoursArg ? parseFloat(hoursArg.split("=")[1]!) : 6;

  await executeCrawlAndRagUpdate(dryRun);

  if (isWatch) {
    console.log(`\n--> Surveillance continue RAG activée (toutes les ${intervalHours} heures)...`);
    setInterval(
      async () => {
        try {
          await executeCrawlAndRagUpdate(dryRun);
        } catch (err) {
          console.error("Erreur cycle auto-crawl RAG:", err);
        }
      },
      intervalHours * 3600 * 1000,
    );
  }
}

if (import.meta.main) {
  await main();
}
