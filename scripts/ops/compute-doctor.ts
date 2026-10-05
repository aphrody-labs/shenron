#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Contrôle de bout en bout de la chaîne de calcul du RAG et du LLM (docs/operations/compute-rag.md).
 *
 *   bun scripts/ops/compute-doctor.ts [--local]   # --local : saute les contrôles qui passent par le vps
 *
 * Vérifie, depuis le poste de calcul : unités systemd utilisateur et cluster PostgreSQL du RAG,
 * liens d'unités morts (un lien mort a déjà coupé le RAG sans alerte), santé et statistiques de
 * `aphrody-ai-http`, accès aux bases de dbfr par `shenron-data-tunnel`, tunnel inverse vers le
 * vps, alignement du jeton des deux côtés (empreintes seulement, jamais la valeur) et recherche
 * RAG de production. Code de sortie non nul au premier contrôle en échec.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const HOME = homedir();
const ENV_FILE = join(HOME, ".aphrody/private/shenron/ai-http.env");
const USER_UNITS = join(HOME, ".config/systemd/user");
const AI_HTTP = "http://127.0.0.1:8789";
const localOnly = process.argv.includes("--local");
const checks: Check[] = [];

const record = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

const run = (cmd: string[]): { code: number; out: string } => {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? 1, out: `${p.stdout}`.trim() };
};

const fingerprint = (secret: string): string =>
  new Bun.CryptoHasher("sha256").update(secret).digest("hex").slice(0, 8);

const envValue = (text: string, key: string): string | undefined =>
  new RegExp(`^${key}=(.+)$`, "m")
    .exec(text)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, "");

/** Liens du dossier des unités utilisateur dont la cible n'existe plus. */
export function deadLinks(dir: string): string[] {
  const dead: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        if (!existsSync(path)) dead.push(path);
      } else if (stat.isDirectory()) walk(path);
    }
  };
  if (existsSync(dir)) walk(dir);
  return dead;
}

async function tcp(port: number): Promise<boolean> {
  try {
    const socket = await Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: { data() {}, open() {} },
    });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  // 1. unités et cluster
  for (const unit of [
    "aphrody-ai-http",
    "aphrody-shenron-embed",
    "aphrody-compute-vps-tunnel",
    "shenron-data-tunnel",
  ]) {
    const state = run(["systemctl", "--user", "is-active", unit]).out;
    record(`unité ${unit}`, state === "active", state);
  }
  const cluster = run(["systemctl", "is-active", "postgresql@16-rag"]).out;
  record("cluster PostgreSQL 16 rag", cluster === "active", cluster);
  const dead = deadLinks(USER_UNITS);
  record("liens d'unités morts", dead.length === 0, dead.length ? dead.join(", ") : "aucun");
  const failed = run(["systemctl", "--user", "--failed", "--no-legend"]).out;
  record("unités utilisateur en échec", failed === "", failed.split("\n")[0] ?? "");

  // 2. santé et statistiques du calcul
  const env = existsSync(ENV_FILE) ? await Bun.file(ENV_FILE).text() : "";
  const token = envValue(env, "APHRODY_AI_HTTP_TOKEN");
  record("jeton du calcul présent", Boolean(token), token ? `empreinte ${fingerprint(token)}` : "");
  if (token) {
    const headers = { authorization: `Bearer ${token}` };
    const call = async (path: string): Promise<unknown> => {
      const res = await fetch(`${AI_HTTP}/api/v1/shenron${path}`, {
        headers,
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      return res?.ok ? res.json().catch(() => null) : null;
    };
    const health = (await call("/health")) as { capabilities?: { rag?: boolean } } | null;
    record("calcul : rag actif", health?.capabilities?.rag === true, JSON.stringify(health));
    const stats = (await call("/rag/stats")) as { chunks?: number; vectors?: number } | null;
    const chunks = stats?.chunks ?? 0;
    const vectors = stats?.vectors ?? 0;
    record(
      "base RAG peuplée",
      chunks >= 200_000 && vectors >= chunks * 0.99,
      `${chunks} documents, ${vectors} vecteurs`,
    );
  }

  // 3. bases de dbfr par le tunnel de données
  record("dbfr : PostgreSQL (15433)", await tcp(15433));
  record("dbfr : Redis (16379)", await tcp(16379));

  // 4. côté vps
  if (!localOnly) {
    const ssh = (command: string): { code: number; out: string } =>
      run(["aphrody-infra", "ssh", "exec", "--host", "vps", "-c", command]);
    const tunnel = ssh("curl -s --max-time 5 http://127.0.0.1:8789/healthz");
    record("vps : tunnel inverse vers le calcul", /"status":"ok"/.test(tunnel.out), tunnel.out);
    const remote = ssh("sudo -n cat /etc/aphrody/shenron-compute-client.env").out;
    const remoteToken = envValue(remote, "APHRODY_AI_HTTP_TOKEN");
    record(
      "jeton identique des deux côtés",
      Boolean(token && remoteToken && fingerprint(token) === fingerprint(remoteToken)),
      remoteToken ? `vps ${fingerprint(remoteToken)}` : "jeton du vps illisible",
    );
    const bot = await fetch("https://bot.dragonballfr.com/api/public/rag/search?q=Kid%20Buu", {
      signal: AbortSignal.timeout(60_000),
    }).catch(() => null);
    const body = (await bot?.json().catch(() => null)) as { results?: unknown[] } | null;
    record(
      "production : recherche RAG du bot",
      bot?.status === 200 && (body?.results?.length ?? 0) > 0,
      `${bot?.status ?? "ERR"}, ${body?.results?.length ?? 0} résultats`,
    );
  }

  for (const check of checks) {
    console.log(
      `${check.ok ? "OK  " : "FAIL"} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`,
    );
  }
  const failures = checks.filter((check) => !check.ok);
  if (failures.length) {
    console.error(`${failures.length} contrôle(s) en échec`);
    process.exit(1);
  }
}

if (import.meta.main) await main();
