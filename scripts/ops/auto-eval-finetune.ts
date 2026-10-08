#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Automated Evaluation & Continuous Fine-tuning loop for Shenron Chat LLM with CUDA/CPU support.
 *
 * Capabilities:
 *   - Auto-detects NVIDIA CUDA GPUs (e.g. RTX 4070) or falls back to CPU
 *   - Evaluates RAG faithfulness and Recall@5 on gold sets
 *   - Runs iterative LoRA / SFT training cycles over DBFR chat rollouts
 *
 * Usage:
 *   bun scripts/ops/auto-eval-finetune.ts [--device cuda|cpu|auto] [--cycles 1] [--batch 25] [--watch]
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

export interface HardwareAcceleration {
  hasCuda: boolean;
  gpuName?: string;
  vramMb?: number;
  device: "cuda" | "cpu";
}

export async function detectHardwareAcceleration(): Promise<HardwareAcceleration> {
  try {
    const p = Bun.spawn(
      ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
      {
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    const out = (await new Response(p.stdout).text()).trim();
    const code = await p.exited;

    if (code === 0 && out) {
      const [name, mem] = out.split(",").map((s) => s.trim());
      return {
        hasCuda: true,
        gpuName: name,
        vramMb: mem ? parseInt(mem, 10) : undefined,
        device: "cuda",
      };
    }
  } catch {
    // nvidia-smi not in path
  }

  return {
    hasCuda: false,
    device: "cpu",
  };
}

async function runStep(
  label: string,
  command: string[],
  env: Record<string, string> = {},
): Promise<boolean> {
  console.log(`\n--> [LLM & Eval] ${label}...`);
  const p = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await p.exited;
  if (code !== 0) {
    console.warn(`[Avertissement] Étape non bloquante terminée avec code ${code} : ${label}`);
    return false;
  }
  console.log(`✓ Étape validée : ${label}`);
  return true;
}

export async function executeEvaluationAndFineTuning(
  options: {
    device?: "cuda" | "cpu" | "auto";
    cycles?: number;
    batchSize?: number;
  } = {},
): Promise<void> {
  console.log("==========================================================");
  console.log("⚡ SHENRON — AUTO-EVALUATION & FINE-TUNING LLM (CUDA/CPU)  ");
  console.log("==========================================================");

  const hw = await detectHardwareAcceleration();
  const selectedDevice = options.device && options.device !== "auto" ? options.device : hw.device;

  console.log(`• Accélération matérielle : ${selectedDevice.toUpperCase()}`);
  if (hw.hasCuda && hw.gpuName) {
    console.log(`  GPU : ${hw.gpuName} (${hw.vramMb ?? "N/A"} MiB VRAM)`);
  }

  const cudaEnv: Record<string, string> =
    selectedDevice === "cuda"
      ? {
          CUDA_VISIBLE_DEVICES: "0",
          TORCH_CUDA_ARCH_LIST: "8.9;9.0", // Ada Lovelace (RTX 4070)
          APHRODY_DEVICE: "cuda",
          APHRODY_CUDA: "1",
        }
      : {
          APHRODY_DEVICE: "cpu",
          APHRODY_CUDA: "0",
        };

  // 1. Évaluation RAG Faithfulness & Recall
  console.log("\n--> 1. Évaluation RAG & Fidélité sur le corpus Gold...");
  await runStep("Évaluation RAG Gold Set", [
    "bun",
    "scripts/ops/eval-rag-faithfulness.ts",
    "--limit",
    "10",
  ]).catch(() => {});

  // 2. Boucle de fine-tuning continu
  const cycles = options.cycles ?? 1;
  const batch = options.batchSize ?? 25;
  console.log(`\n--> 2. Exécution du fine-tuning (${cycles} cycles, lot: ${batch})...`);
  await runStep(
    "Boucle d'entraînement LoRA Shenron Chat",
    [
      "bun",
      "scripts/ops/train-shenron-chat-loop.ts",
      "--batch",
      String(batch),
      "--max-cycles",
      String(cycles),
      "--sleep-sec",
      "5",
    ],
    cudaEnv,
  );

  console.log("\n✓ Cycle d'évaluation et de fine-tuning complété.");
}

async function main() {
  const isWatch = process.argv.includes("--watch");
  const deviceArg = process.argv.find((a) => a.startsWith("--device="));
  const device = (deviceArg ? deviceArg.split("=")[1]! : "auto") as "cuda" | "cpu" | "auto";
  const cyclesArg = process.argv.find((a) => a.startsWith("--cycles="));
  const cycles = cyclesArg ? parseInt(cyclesArg.split("=")[1]!, 10) : 1;
  const batchArg = process.argv.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1]!, 10) : 25;

  await executeEvaluationAndFineTuning({ device, cycles, batchSize });

  if (isWatch) {
    console.log("\n--> Mode surveillance continue activé (intervalle: 1800s)...");
    setInterval(async () => {
      try {
        await executeEvaluationAndFineTuning({ device, cycles, batchSize });
      } catch (err) {
        console.error("Erreur lors de la boucle d'entraînement:", err);
      }
    }, 1800_000);
  }
}

if (import.meta.main) {
  await main();
}
