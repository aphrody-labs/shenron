#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Côté hôte de `scripts/ops/admin-access.ts` : exécuté sur un VPS (utilisateur de service,
 * `sudo -n`) avec la liste des adresses d'administration en argument JSON.
 *
 *   bun admin-access-host.ts '{"ips":["81.64.138.142",…],"apply":false,"restartPostgres":false}'
 *   bun admin-access-host.ts addresses     # adresses publiques de l'hôte (JSON)
 *
 * Gère, par marqueur `shenron-admin`, sans toucher aux règles posées à la main :
 *  - ufw : `allow from <ip>` (tous ports : SSH, PostgreSQL…), règles périmées retirées ;
 *  - fail2ban : `ignoreip` dans `jail.d/90-shenron-admin.local` ;
 *  - PostgreSQL : `listen_addresses = '*'` (conf.d) et un bloc `pg_hba` en SCRAM — le pare-feu
 *    reste la seule porte, le mot de passe reste exigé ; le redémarrage n'a lieu qu'avec
 *    `restartPostgres` (sinon il est signalé « en attente ») ;
 *  - services Shenron (hôte qui porte `/etc/rose-griffon/shenron-site.env`) : `SHENRON_ADMIN_IPS`
 *    (site) et `SHENRON_MCP_ALLOWED_IPS` (MCP), service redémarré si la valeur change.
 * Redis n'est pas exposé (clients locaux sans mot de passe) : tunnel SSH depuis un poste admin.
 * Sortie : un objet JSON des actions, appliquées ou prévues.
 */
import { networkInterfaces } from "node:os";

const MARK = "shenron-admin";
const FAIL2BAN = "/etc/fail2ban/jail.d/90-shenron-admin.local";
const PG_DIR = "/etc/postgresql/18/main";
const PG_LISTEN = `${PG_DIR}/conf.d/90-shenron-admin.conf`;
const PG_HBA = `${PG_DIR}/pg_hba.conf`;
const ENV_DIR = process.env.SHENRON_ENV_DIR ?? "/etc/rose-griffon";

interface Input {
  ips: string[];
  apply: boolean;
  restartPostgres?: boolean;
}

function run(cmd: string[], stdin?: string): { code: number; out: string; err: string } {
  const p = Bun.spawnSync(cmd, {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
}

const sudo = (...cmd: string[]) => run(["sudo", "-n", ...cmd]);
const readRoot = (path: string): string | null => {
  const r = sudo("cat", path);
  return r.code === 0 ? r.out : null;
};
function writeRoot(path: string, content: string, mode = "0644"): void {
  const r = run(["sudo", "-n", "tee", path], content);
  if (r.code !== 0) throw new Error(`écriture ${path} : ${r.err.trim()}`);
  sudo("chmod", mode, path);
  sudo("chown", "root:root", path);
}

if (process.argv[2] === "addresses") {
  const out: string[] = [];
  // Adresses publiques et WireGuard (10.8.0.0/24) ; ni lien local, ni ponts Docker, ni RFC 1918.
  const privateV4 = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? []) {
      if (a.internal || a.address.startsWith("fe80") || /^f[cd]/i.test(a.address)) continue;
      if (a.address.startsWith("10.8.0.")) out.push("10.8.0.0/24");
      else if (!privateV4.test(a.address)) out.push(a.address);
    }
  console.log(JSON.stringify(out));
  process.exit(0);
}

const input = JSON.parse(process.argv[2] ?? "{}") as Input;
if (!Array.isArray(input.ips) || input.ips.length === 0) throw new Error("liste d'adresses vide");
for (const ip of input.ips)
  if (!/^[0-9a-fA-F:.]+(\/\d{1,3})?$/.test(ip)) throw new Error(`adresse refusée : ${ip}`);
const ips = [...new Set(input.ips)].toSorted();
const actions: string[] = [];
const pending: string[] = [];
const act = (what: string, fn: () => void) => {
  actions.push(what);
  if (input.apply) fn();
};

// ── ufw ──────────────────────────────────────────────────────────────────────
const status = sudo("ufw", "status", "numbered");
if (status.code === 0) {
  const managed = new Map<string, number[]>();
  for (const line of status.out.split("\n")) {
    const m = /^\[\s*(\d+)\]\s+Anywhere(?: \(v6\))?\s+ALLOW IN\s+(\S+)\s+#\s*shenron-admin\b/.exec(
      line,
    );
    if (m) managed.set(m[2]!, [...(managed.get(m[2]!) ?? []), Number(m[1])]);
  }
  const stale = [...managed.entries()].filter(([ip]) => !ips.includes(ip)).flatMap(([, n]) => n);
  for (const n of stale.toSorted((a, b) => b - a))
    act(`ufw delete ${n}`, () => sudo("ufw", "--force", "delete", String(n)));
  for (const ip of ips)
    if (!managed.has(ip))
      act(`ufw allow from ${ip}`, () => {
        const r = sudo("ufw", "allow", "from", ip, "comment", MARK);
        if (r.code !== 0) throw new Error(`ufw ${ip} : ${r.err.trim()}`);
      });
}

// ── fail2ban ─────────────────────────────────────────────────────────────────
if (sudo("test", "-d", "/etc/fail2ban/jail.d").code === 0) {
  const want = `# ${MARK} : géré par scripts/ops/admin-access.ts\n[DEFAULT]\nignoreip = 127.0.0.1/8 ::1 ${ips.join(" ")}\n`;
  if (readRoot(FAIL2BAN) !== want)
    act("fail2ban ignoreip", () => {
      writeRoot(FAIL2BAN, want);
      sudo("fail2ban-client", "reload");
    });
}

// ── PostgreSQL ───────────────────────────────────────────────────────────────
if (sudo("test", "-f", PG_HBA).code === 0) {
  const listen = `# ${MARK} : écoute publique ; seul le pare-feu (ufw, adresses admin) laisse passer.\nlisten_addresses = '*'\n`;
  if (readRoot(PG_LISTEN) !== listen)
    act("postgresql listen_addresses = '*'", () => writeRoot(PG_LISTEN, listen));
  const hba = readRoot(PG_HBA) ?? "";
  const begin = `# BEGIN ${MARK}`;
  const end = `# END ${MARK}`;
  const block = [
    begin,
    ...ips.map(
      (ip) =>
        `host    all    all    ${ip.includes("/") ? ip : ip.includes(":") ? `${ip}/128` : `${ip}/32`}    scram-sha-256`,
    ),
    end,
  ].join("\n");
  const start = hba.indexOf(begin);
  const stop = hba.indexOf(end);
  const next =
    start >= 0 && stop > start
      ? `${hba.slice(0, start)}${block}${hba.slice(stop + end.length)}`
      : `${hba.replace(/\n*$/, "\n")}${block}\n`;
  if (next !== hba)
    act("pg_hba bloc shenron-admin", () => {
      writeRoot(PG_HBA, next, "0640");
      sudo("chown", "postgres:postgres", PG_HBA);
      run(["sudo", "-n", "-u", "postgres", "psql", "-Atc", "select pg_reload_conf()"]);
    });
  const current = run([
    "sudo",
    "-n",
    "-u",
    "postgres",
    "psql",
    "-Atc",
    "show listen_addresses",
  ]).out.trim();
  if (current !== "*") {
    if (input.restartPostgres)
      act("postgresql restart (listen_addresses)", () =>
        sudo("systemctl", "restart", "postgresql@18-main"),
      );
    else pending.push("postgresql restart requis pour listen_addresses");
  }
}

// ── Services Shenron ─────────────────────────────────────────────────────────
function setEnvKey(file: string, key: string, value: string, service: string): void {
  const path = `${ENV_DIR}/${file}`;
  const text = readRoot(path);
  if (text === null) return;
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(text) ? text.replace(re, line) : `${text.replace(/\n*$/, "\n")}${line}\n`;
  if (next === text) return;
  // Un service arrêté (hôte de secours) ne démarre pas pour autant : seule la valeur change.
  const active = run(["systemctl", "is-active", "--quiet", service]).code === 0;
  act(`${file} ${key}${active ? ` + restart ${service}` : ""}`, () => {
    writeRoot(path, next, "0600");
    if (active) sudo("systemctl", "restart", service);
  });
}
const list = ips.join(",");
setEnvKey("shenron-site.env", "SHENRON_ADMIN_IPS", list, "shenron-site");
setEnvKey("shenron-mcp-http.env", "SHENRON_MCP_ALLOWED_IPS", list, "shenron-mcp-http");

console.log(
  JSON.stringify({ host: run(["hostname"]).out.trim(), apply: input.apply, ips, actions, pending }),
);
