#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Postes d'administration de Shenron, tenus à jour automatiquement.
 *
 * Liste = l'IP publique de ce poste (Windows et WSL sortent par la même), les adresses
 * publiques des deux VPS (`vps`, `dbfr`), le sous-réseau WireGuard 10.8.0.0/24, plus le fichier
 * privé `~/.aphrody/private/shenron-admin-ips.json` : `extra` (adresses fixes) et `accounts`
 * (`ba_user.id` dont la dernière IP de session, sur 14 jours, est reprise à chaque passage).
 * Elle est appliquée sur chaque VPS par `admin-access-host.ts` (ufw, fail2ban, PostgreSQL,
 * `SHENRON_ADMIN_IPS` du site, `SHENRON_MCP_ALLOWED_IPS` du MCP) : SSH, base, MCP, pages et
 * API d'administration (donc desktop et CLI) acceptent ces postes comme super-admin.
 *
 *   bun scripts/ops/admin-access.ts                       # plan (aucune écriture)
 *   bun scripts/ops/admin-access.ts --apply               # applique
 *   bun scripts/ops/admin-access.ts --apply --restart-postgres
 *   bun scripts/ops/admin-access.ts --install-timer       # minuteur systemd utilisateur (WSL)
 *
 * Idempotent : sans changement d'adresse, `--apply` ne touche rien ; quand l'IP de la box
 * change, l'ancienne est retirée et la nouvelle ajoutée. Redis reste en boucle locale :
 * `aphrody-infra ssh tunnel` depuis un poste admin.
 */
import { homedir } from "node:os";
import { join } from "node:path";

const HOSTS = ["vps", "dbfr"] as const;
const HOST_SCRIPT = join(import.meta.dir, "admin-access-host.ts");
const REMOTE_BUN = "$HOME/.bun/bin/bun";
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const restartPostgres = args.has("--restart-postgres");

function infraCommand(args: string[]): string[] {
  return process.platform === "win32" ? ["aphrody", "infra", ...args] : ["aphrody-infra", ...args];
}

async function publicIp(url: string): Promise<string | null> {
  try {
    const text = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).text()).trim();
    return /^[0-9a-fA-F:.]+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** Exécute `admin-access-host.ts` sur `host` avec `arg`, via `aphrody-infra ssh exec`. */
function onHost(host: string, script: string, arg: string): string {
  const b64 = Buffer.from(script).toString("base64");
  const quoted = `'${arg.replace(/'/g, `'\\''`)}'`;
  const cmd = `f=$(mktemp --suffix=.ts) && echo ${b64} | base64 -d > "$f" && ${REMOTE_BUN} "$f" ${quoted}; c=$?; rm -f "$f"; exit $c`;
  const p = Bun.spawnSync(infraCommand(["ssh", "exec", "--host", host, "-c", cmd]), {
    env: { ...process.env, APHRODY_SSH_COMMAND_TIMEOUT_SECS: "300" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = p.stdout.toString().trim();
  if (p.exitCode !== 0) throw new Error(`${host} : ${p.stderr.toString().trim() || out}`);
  return out.split("\n").at(-1) ?? "";
}

/**
 * Dernière IP de session (14 jours) des comptes `ba_user.id` désignés, lue dans la base du
 * site sur `dbfr` : un administrateur dont la box change d'adresse la retrouve dès sa
 * prochaine connexion au site, sans intervention.
 */
function accountIps(accounts: readonly string[]): string[] {
  const ids = accounts.filter((id) => /^[A-Za-z0-9_-]{8,64}$/.test(id));
  if (ids.length === 0) return [];
  const sql = `select distinct on ("userId") "ipAddress" from public.ba_session where "userId" in (${ids.map((id) => `'${id}'`).join(",")}) and "updatedAt" > now() - interval '14 days' and "ipAddress" is not null order by "userId", "updatedAt" desc;`;
  const b64 = Buffer.from(sql).toString("base64");
  const p = Bun.spawnSync(
    infraCommand([
      "ssh",
      "exec",
      "--host",
      "dbfr",
      "-c",
      `echo ${b64} | base64 -d | sudo -n -u postgres psql -At -d shenron_site`,
    ]),
    { stdout: "pipe", stderr: "pipe" },
  );
  if (p.exitCode !== 0) return [];
  return p.stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-fA-F:.]+$/.test(line));
}

async function installTimer(): Promise<void> {
  const dir = join(homedir(), ".config", "systemd", "user");
  const repo = join(import.meta.dir, "..", "..");
  const bun = process.execPath;
  await Bun.write(
    join(dir, "shenron-admin-access.service"),
    `[Unit]\nDescription=Shenron : postes d'administration (IP publique, VPS) appliqués aux hôtes\n\n[Service]\nType=oneshot\nWorkingDirectory=${repo}\nEnvironment=PATH=${join(homedir(), ".local", "bin")}:${join(homedir(), ".bun", "bin")}:/usr/local/bin:/usr/bin:/bin\nExecStart=${bun} scripts/ops/admin-access.ts --apply\n`,
  );
  await Bun.write(
    join(dir, "shenron-admin-access.timer"),
    "[Unit]\nDescription=Shenron : postes d'administration, toutes les 15 minutes\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=15min\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n",
  );
  for (const cmd of [
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", "--now", "shenron-admin-access.timer"],
  ]) {
    const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
    if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")} : ${p.stderr.toString().trim()}`);
  }
  console.log(JSON.stringify({ timer: "shenron-admin-access.timer", every: "15min" }));
}

if (args.has("--install-timer")) {
  await installTimer();
  process.exit(0);
}

const script = await Bun.file(HOST_SCRIPT).text();
const ips = new Set<string>(["10.8.0.0/24"]);
const v4 = await publicIp("https://api.ipify.org");
const v6 = await publicIp("https://api6.ipify.org");
if (!v4 && !v6) throw new Error("IP publique de ce poste introuvable : rien n'est appliqué");
for (const ip of [v4, v6]) if (ip) ips.add(ip);
for (const host of HOSTS)
  for (const ip of JSON.parse(onHost(host, script, "addresses")) as string[]) ips.add(ip);
const extraFile = Bun.file(join(homedir(), ".aphrody", "private", "shenron-admin-ips.json"));
const extra = (await extraFile.exists())
  ? ((await extraFile.json()) as { extra?: string[]; accounts?: string[] })
  : {};
for (const ip of extra.extra ?? []) ips.add(ip);
for (const ip of accountIps(extra.accounts ?? [])) ips.add(ip);

const list = [...ips].toSorted();
const input = JSON.stringify({ ips: list, apply, restartPostgres });
const reports = HOSTS.map((host) => JSON.parse(onHost(host, script, input)));
console.log(JSON.stringify({ apply, local: { v4, v6 }, ips: list, hosts: reports }, null, 2));
