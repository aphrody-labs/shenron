#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Master CLI orchestrator for the Shenron (dragonballfr.com) container stack.
 *
 * Commands:
 *   bun scripts/ops/container.ts env [--prod|--dev]      Prepare secrets and environment files
 *   bun scripts/ops/container.ts build [--all-in-one]    Build Docker container images
 *   bun scripts/ops/container.ts up [--all-in-one]       Launch container stack (ensures env first)
 *   bun scripts/ops/container.ts down                    Stop container stack gracefully
 *   bun scripts/ops/container.ts status                  Check health of all services
 *   bun scripts/ops/container.ts db-init                 Run database schema and migrations
 *   bun scripts/ops/container.ts ovh                     Run OVH operations check
 *   bun scripts/ops/container.ts backup                  Backup container databases
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prepareContainerSecrets } from "./container-secrets";
import { initContainerDatabases } from "./container-db-init";
import { runOvhChecks } from "./ovh-shenron";

const ROOT = resolve(import.meta.dir, "../..");
const COMPOSE_FILE = join(ROOT, "deploy", "docker", "compose.complete.yaml");
const ALL_IN_ONE_DOCKERFILE = join(ROOT, "deploy", "docker", "all-in-one", "Dockerfile");
const IMAGE_TAG = "localhost/shenron:complete";

async function execCommand(command: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

async function cmdEnv(isProd: boolean) {
  console.log(`--> Préparation des secrets du conteneur (${isProd ? "production" : "développement"})...`);
  const report = await prepareContainerSecrets({ isProd });
  console.log(`✓ Secrets générés :`);
  console.log(`  - Sources trouvées : ${report.sourcesFound.length}`);
  console.log(`  - Clés Site : ${report.siteKeysCount}`);
  console.log(`  - Clés Bot : ${report.botKeysCount}`);
  console.log(`  - Fichiers émis sous deploy/docker/env/ (protégés 0600)`);
}

async function cmdBuild(allInOne: boolean) {
  console.log(`--> Construction de l'image Docker Shenron (${allInOne ? "all-in-one" : "compose"})...`);
  const dockerfile = allInOne ? ALL_IN_ONE_DOCKERFILE : join(ROOT, "deploy", "docker", "Dockerfile");
  const args = ["docker", "build", "-f", dockerfile, "-t", IMAGE_TAG, "."];
  
  const proc = Bun.spawn(args, {
    cwd: ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`Échec de la construction Docker (code ${code})`);
  }
  console.log(`✓ Image construite avec succès : ${IMAGE_TAG}`);
}

async function cmdUp(allInOne: boolean, isProd: boolean) {
  await cmdEnv(isProd);

  if (allInOne) {
    console.log("--> Lancement du conteneur complet all-in-one...");
    const args = [
      "docker", "run", "-d",
      "--name", "shenron-complete",
      "-p", "80:80",
      "-p", "5011:5011",
      "-p", "5006:5006",
      "-p", "5432:5432",
      "-p", "6379:6379",
      "--env-file", join(ROOT, "deploy", "docker", "env", "shenron-site.env"),
      IMAGE_TAG
    ];
    const { code, stdout, stderr } = await execCommand(args);
    if (code !== 0) {
      console.error("Erreur lors du lancement:", stderr);
      process.exit(1);
    }
    console.log(`✓ Conteneur all-in-one démarré (ID: ${stdout.trim().slice(0, 12)})`);
  } else {
    console.log("--> Lancement de la pile Docker Compose complète...");
    const args = ["docker", "compose", "-f", COMPOSE_FILE, "up", "-d"];
    const proc = Bun.spawn(args, {
      cwd: ROOT,
      stdio: ["inherit", "inherit", "inherit"],
    });
    const code = await proc.exited;
    if (code !== 0) {
      throw new Error(`Échec du lancement Compose (code ${code})`);
    }
    console.log("✓ Pile Docker Compose démarrée avec succès.");
  }
}

async function cmdDown() {
  console.log("--> Arrêt des conteneurs Shenron...");
  // Stop all-in-one if running
  await execCommand(["docker", "stop", "shenron-complete"]).catch(() => {});
  await execCommand(["docker", "rm", "shenron-complete"]).catch(() => {});

  // Stop compose stack
  if (existsSync(COMPOSE_FILE)) {
    const proc = Bun.spawn(["docker", "compose", "-f", COMPOSE_FILE, "down"], {
      cwd: ROOT,
      stdio: ["inherit", "inherit", "inherit"],
    });
    await proc.exited;
  }
  console.log("✓ Conteneurs arrêtés.");
}

async function probeHttp(url: string, name: string): Promise<{ name: string; ok: boolean; status?: number; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { name, ok: res.ok, status: res.status };
  } catch (e) {
    return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function cmdStatus() {
  console.log("--> Vérification de l'état des services du conteneur Shenron...");
  const probes = await Promise.all([
    probeHttp("http://127.0.0.1:80", "Nginx Gateway (port 80)"),
    probeHttp("http://127.0.0.1:5011/api/local/health", "Shenron Server Health (port 5011)"),
    probeHttp("http://127.0.0.1:5006/health", "Shenron Bot Health (port 5006)"),
    probeHttp("http://127.0.0.1:5011/mcp", "Shenron MCP Endpoint"),
  ]);

  console.log("\nSondes HTTP internes :");
  for (const p of probes) {
    const statusText = p.ok ? `OK (HTTP ${p.status})` : `ÉCHEC (${p.error ?? `HTTP ${p.status}`})`;
    console.log(`  - ${p.name.padEnd(35)} : ${statusText}`);
  }

  // Docker containers status
  const { stdout: psOut } = await execCommand(["docker", "ps", "--filter", "name=shenron", "--format", "{{.Names}}: {{.Status}}"]);
  console.log("\nConteneurs Docker en cours d'exécution :");
  if (psOut.trim()) {
    console.log(psOut.trim().split("\n").map(l => `  - ${l}`).join("\n"));
  } else {
    console.log("  (Aucun conteneur shenron en cours d'exécution)");
  }
}

async function cmdBackup() {
  const backupDir = join(ROOT, "var", "backups", "container");
  await mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log(`--> Sauvegarde des données du conteneur vers ${backupDir}...`);

  // SQLite Bot DB backup
  const botDbPath = join(ROOT, "apps", "bot", "data", "bot.db");
  if (existsSync(botDbPath)) {
    const target = join(backupDir, `bot-${timestamp}.db`);
    await Bun.write(target, await Bun.file(botDbPath).arrayBuffer());
    console.log(`✓ Sauvegarde SQLite Bot créée : ${target}`);
  }

  // Postgres dump if container is running
  const dumpFile = join(backupDir, `postgres-shenron_site-${timestamp}.sql`);
  const { code } = await execCommand([
    "docker", "exec", "shenron-postgres", "pg_dump", "-U", "shenron", "shenron_site"
  ]);
  if (code === 0) {
    console.log(`✓ Sauvegarde PostgreSQL créée : ${dumpFile}`);
  } else {
    console.log("  (Sauvegarde PostgreSQL sautée ou conteneur postgres non actif)");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const isProd = args.includes("--prod");
  const allInOne = args.includes("--all-in-one");

  switch (command) {
    case "env":
      await cmdEnv(isProd);
      break;
    case "build":
      await cmdBuild(allInOne);
      break;
    case "up":
      await cmdUp(allInOne, isProd);
      break;
    case "down":
      await cmdDown();
      break;
    case "status":
      await cmdStatus();
      break;
    case "db-init":
      const report = await initContainerDatabases({ dryRun: false });
      console.log(JSON.stringify(report, null, 2));
      break;
    case "ovh":
      const ovhReport = await runOvhChecks();
      console.log(JSON.stringify(ovhReport, null, 2));
      break;
    case "backup":
      await cmdBackup();
      break;
    case "help":
    default:
      console.log(`
Gestionnaire de Conteneur Shenron (dragonballfr.com)

Usage:
  bun scripts/ops/container.ts env [--prod|--dev]     Découvre et prépare les variables d'environnement
  bun scripts/ops/container.ts build [--all-in-one]   Construit l'image Docker
  bun scripts/ops/container.ts up [--all-in-one]      Démarre la pile conteneurisée
  bun scripts/ops/container.ts down                   Arrête les conteneurs proprement
  bun scripts/ops/container.ts status                 Vérifie l'état et la santé de tous les services
  bun scripts/ops/container.ts db-init                Applique les migrations PostgreSQL et SQLite
  bun scripts/ops/container.ts ovh                    Vérifie l'état OVH, le domaine et le VPS
  bun scripts/ops/container.ts backup                 Sauvegarde les bases du conteneur
`);
      break;
  }
}

if (import.meta.main) {
  await main().catch((err) => {
    console.error("Erreur:", err);
    process.exit(1);
  });
}
