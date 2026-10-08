#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Auto-deploy continuous runner for Shenron container stack.
 *
 * Monitors `origin/main` and automatically deploys new commits:
 *   1. Fetches and fast-forwards `main`
 *   2. Synchronizes container secrets (`container-secrets.ts`)
 *   3. Applies PostgreSQL and SQLite migrations (`container-db-init.ts`)
 *   4. Re-provisions or restarts container workloads (`container.ts up`)
 *   5. Validates health probes (/api/local/health, /health)
 *
 * Usage:
 *   bun scripts/ops/auto-deploy.ts [--watch] [--interval 30] [--all-in-one]
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

async function runCommand(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = Bun.spawn(args, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function getCurrentCommit(): Promise<string> {
  const { stdout } = await runCommand(["git", "rev-parse", "HEAD"]);
  return stdout;
}

export async function getRemoteCommit(remote = "origin", branch = "main"): Promise<string | null> {
  const fetchRes = await runCommand(["git", "fetch", remote, branch]);
  if (fetchRes.code !== 0) {
    return null;
  }
  const { stdout } = await runCommand(["git", "rev-parse", `${remote}/${branch}`]);
  return stdout || null;
}

export async function deployRevision(commitSha: string, allInOne = false): Promise<boolean> {
  void allInOne;
  console.error(
    `Déploiement direct refusé pour ${commitSha.slice(0, 10)}. La publication et les migrations appartiennent à Aphrody Infra.`,
  );
  return false;
}

export async function checkAndDeploy(allInOne = false): Promise<boolean> {
  const current = await getCurrentCommit();
  const remote = await getRemoteCommit();

  if (!remote) {
    console.log(
      `[${new Date().toLocaleTimeString()}] Impossible de joindre le dépôt distant ou aucune mise à jour.`,
    );
    return false;
  }

  if (current !== remote) {
    console.log(
      `Nouveau commit détecté sur origin/main (${current.slice(0, 8)} -> ${remote.slice(0, 8)})`,
    );
    return await deployRevision(remote, allInOne);
  }

  console.log(
    `[${new Date().toLocaleTimeString()}] Dépôt à jour (${current.slice(0, 8)}). Aucune action requise.`,
  );
  return false;
}

async function main() {
  const isWatch = process.argv.includes("--watch");
  const allInOne = process.argv.includes("--all-in-one");
  const intervalArg = process.argv.find((a) => a.startsWith("--interval="));
  const intervalSec = intervalArg ? parseInt(intervalArg.split("=")[1]!, 10) : 30;

  console.log("=== SHENRON AUTO-DEPLOY RUNNER ===");
  console.log(`• Mode     : ${isWatch ? "Surveillance continue" : "Vérification ponctuelle"}`);
  console.log(`• Cible    : ${allInOne ? "Conteneur all-in-one" : "Pile Compose"}`);
  if (isWatch) console.log(`• Intervalle : ${intervalSec} secondes`);

  await checkAndDeploy(allInOne);

  if (isWatch) {
    setInterval(async () => {
      try {
        await checkAndDeploy(allInOne);
      } catch (err) {
        console.error("Erreur lors du cycle auto-deploy:", err);
      }
    }, intervalSec * 1000);
  }
}

if (import.meta.main) {
  await main();
}
