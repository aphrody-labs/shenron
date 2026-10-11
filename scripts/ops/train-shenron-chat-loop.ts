#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * train-shenron-chat-loop.ts — Boucle d'entraînement continu de Shenron Chat :
 * 1. Synchronisation et vérification des triples DBFR (~/.aphrody/workspaces/dbfr/training/triples.jsonl).
 * 2. Génération / enrichment continu des rollouts de chat (build-chat-rollouts.ts).
 * 3. Entraînement LoRA / SFT itératif (aphrody-train).
 * 4. Évaluation sur le jeu de test gold et reporting des métriques.
 *
 * Usage:
 *   bun scripts/ops/train-shenron-chat-loop.ts [--batch 50] [--sleep-sec 30] [--teacher aphrody|antigravity]
 */

import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const home = homedir();
const defaultTriples = join(home, ".aphrody/workspaces/dbfr/training/triples.jsonl");
const defaultSoul = join(home, ".aphrody/workspaces/dbfr/SOUL.md");
const outDir = join(home, ".aphrody/private/training/shenron/chat");
const fallbackTriples = "C:\\Users\\omara\\.shenron-plugin\\dbfr\\shenron-trained\\training\\triples.jsonl";
const fallbackSoul = "C:\\Users\\omara\\.shenron-plugin\\dbfr\\SOUL.md";

const { values } = parseArgs({
  options: {
    batch: { type: "string", default: "50" },
    limit: { type: "string" },
    "sleep-sec": { type: "string", default: "30" },
    teacher: { type: "string", default: "antigravity" },
    model: { type: "string" },
    "max-cycles": { type: "string" },
  },
  strict: false,
});

const batchSize = Math.max(1, parseInt(values.limit ?? values.batch ?? "50", 10));
const sleepSec = Math.max(5, parseInt(values["sleep-sec"] ?? "30", 10));
const maxCycles = values["max-cycles"] ? parseInt(values["max-cycles"], 10) : null;
const teacher = values.teacher ?? "antigravity";

console.log("==========================================================");
console.log("🐉 SHENRON CHAT — BOUCLE CONTINUE D'ENTRAÎNEMENT         ");
console.log("==========================================================");
console.log(`• Source triples : ${defaultTriples}`);
console.log(`• Dossier sortie : ${outDir}`);
console.log(`• Taille de lot  : ${batchSize} exemples / cycle`);
console.log(`• Enseignant     : ${teacher}`);
console.log(`• Pause cycle    : ${sleepSec} secondes\n`);

// 1. Initialisation des répertoires et fichiers
mkdirSync(join(home, ".aphrody/workspaces/dbfr/training"), { recursive: true });
mkdirSync(outDir, { recursive: true });

if (!existsSync(defaultTriples) && existsSync(fallbackTriples)) {
  console.log(`Copie des triples sources depuis ${fallbackTriples}...`);
  copyFileSync(fallbackTriples, defaultTriples);
}

if (!existsSync(defaultSoul) && existsSync(fallbackSoul)) {
  console.log(`Copie de SOUL.md depuis ${fallbackSoul}...`);
  copyFileSync(fallbackSoul, defaultSoul);
}

if (!existsSync(defaultTriples)) {
  console.error(`❌ Impossible de trouver les triples d'entraînement : ${defaultTriples}`);
  process.exit(1);
}

const repoRoot = join(import.meta.dir, "../..");

// 2. Initialisation du split gold
console.log("Initialisation du split gold...");
const splitProc = Bun.spawn(
  ["bun", "packages/pipeline/scripts/build-chat-rollouts.ts", "--split-only", "--input", defaultTriples, "--out", outDir],
  { cwd: repoRoot, stdout: "inherit", stderr: "inherit" }
);
await splitProc.exited;

let cycle = 0;
let running = true;

process.on("SIGINT", () => {
  console.log("\nArrêt gracieux de la boucle d'entraînement demandé...");
  running = false;
});
process.on("SIGTERM", () => {
  console.log("\nArrêt gracieux demandé...");
  running = false;
});

while (running) {
  cycle++;
  console.log(`\n==========================================================`);
  console.log(`🔄 Cycle d'entraînement #${cycle} — ${new Date().toISOString()}`);
  console.log(`==========================================================`);

  // Étape A : Génération / complétion des rollouts
  console.log(`[A] Génération d'un lot de ${batchSize} rollouts (teacher: ${teacher})...`);
  const rolloutArgs = [
    "bun",
    "packages/pipeline/scripts/build-chat-rollouts.ts",
    "--input", defaultTriples,
    "--out", outDir,
    "--limit", String(batchSize),
    "--teacher", teacher,
    ...(values.model ? ["--model", values.model] : [])
  ];

  const rollProc = Bun.spawn(rolloutArgs, { cwd: repoRoot, stdout: "inherit", stderr: "inherit" });
  const rollCode = await rollProc.exited;

  if (rollCode !== 0) {
    console.warn(`⚠️ Génération des rollouts terminée avec le code ${rollCode}`);
  } else {
    console.log(`✓ Lot de rollouts complété avec succès.`);
  }

  // Étape B : Évaluation du modèle sur le benchmark gold
  const goldPath = join(outDir, "gold.jsonl");
  if (existsSync(goldPath)) {
    console.log(`[B] Évaluation rapide sur le benchmark gold...`);
    const evalProc = Bun.spawn(
      ["bun", "packages/pipeline/scripts/eval-chat-gold.ts", "--gold", goldPath, "--limit", "10", "--label", `cycle-${cycle}`],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" }
    );
    const evalOut = await new Response(evalProc.stdout).text();
    await evalProc.exited;
    if (evalOut.trim()) {
      console.log(`Rapport évaluation : ${evalOut.trim()}`);
    }
  }

  if (maxCycles !== null && cycle >= maxCycles) {
    console.log(`\nNombre maximal de cycles atteint (${maxCycles}). Fin.`);
    break;
  }

  if (running) {
    console.log(`En veille active (${sleepSec}s) avant le cycle #${cycle + 1}...`);
    await new Promise((r) => setTimeout(r, sleepSec * 1000));
  }
}

console.log("🏁 Boucle d'entraînement terminée.");
