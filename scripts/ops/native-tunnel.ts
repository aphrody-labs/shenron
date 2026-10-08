#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Native cross-platform tunnel manager between Windows natif and the two VPS (VPS & DBFR).
 *
 * Establishes SSH port forwardings and generates WireGuard client configuration:
 *   - VPS (Hub: 51.77.147.152, WG: 10.200.77.1)
 *   - DBFR (Prod: 51.255.162.6, WG: 10.200.77.3)
 *   - Windows native peer (WG: 10.200.77.4)
 *
 * Forwarded loopback ports:
 *   - 15433 -> 5432 (PostgreSQL shenron_site)
 *   - 16379 -> 6379 (Redis)
 *   - 8799  -> 8798 (Chat IA / Gemma4 direct)
 *   - 8793  -> 8793 (MCP HTTP)
 *   - 5011  -> 5011 (Shenron Server / Site)
 *   - 5006  -> 5006 (Shenron Bot API)
 *
 * Usage:
 *   bun scripts/ops/native-tunnel.ts up [--host vps|dbfr] [--daemon]
 *   bun scripts/ops/native-tunnel.ts down
 *   bun scripts/ops/native-tunnel.ts status
 *   bun scripts/ops/native-tunnel.ts generate-wireguard
 */

import { existsSync } from "node:fs";
import { writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");
const PID_FILE = join(ROOT, "var", "run", "native-tunnel.pid");

export interface TunnelEndpoint {
  name: string;
  publicIp: string;
  wireguardIp: string;
  user: string;
  identityCandidates: string[];
}

export const ENDPOINTS: Record<string, TunnelEndpoint> = {
  vps: {
    name: "vps-build",
    publicIp: "51.77.147.152",
    wireguardIp: "10.200.77.1",
    user: "ubuntu",
    identityCandidates: [
      join(homedir(), ".ssh", "id_ed25519_aphrody"),
      join(homedir(), ".ssh", "ovh_vps"),
      join(homedir(), ".ssh", "id_ed25519"),
      join(homedir(), ".ssh", "id_rsa"),
    ],
  },
  dbfr: {
    name: "dbfr-prod",
    publicIp: "51.255.162.6",
    wireguardIp: "10.200.77.3",
    user: "ubuntu",
    identityCandidates: [
      join(homedir(), ".ssh", "id_ed25519_aphrody"),
      join(homedir(), ".ssh", "id_ed25519"),
      join(homedir(), ".ssh", "ovh_vps"),
      join(homedir(), ".ssh", "id_rsa"),
    ],
  },
};

export const FORWARD_PORTS = [
  { local: 15433, remote: 15433, desc: "PostgreSQL (shenron_site)" },
  { local: 16379, remote: 6379, desc: "Redis" },
  { local: 8788, remote: 8788, desc: "Aphrody A2A Hub" },
  { local: 8793, remote: 8793, desc: "Aphrody MCP HTTP" },
  { local: 8790, remote: 8790, desc: "Shenron MCP HTTP" },
  { local: 8798, remote: 8798, desc: "LLM Gemma4 (Aphrody)" },
  { local: 8799, remote: 8799, desc: "LLM Qwen3 Shenron Chat (Aphrody)" },
  { local: 5011, remote: 5011, desc: "Shenron Server" },
  { local: 5006, remote: 5006, desc: "Shenron Bot" },
];

export function findSshKey(endpoint: TunnelEndpoint): string | null {
  for (const candidate of endpoint.identityCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function buildSshArgs(endpoint: TunnelEndpoint, identityFile: string, targetHost?: string): string[] {
  const args = [
    "-N",
    "-T",
    "-o", "ServerAliveInterval=20",
    "-o", "ServerAliveCountMax=3",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-i", identityFile,
  ];

  for (const f of FORWARD_PORTS) {
    args.push("-L", `127.0.0.1:${f.local}:127.0.0.1:${f.remote}`);
  }

  args.push(targetHost ?? `${endpoint.user}@${endpoint.publicIp}`);
  return args;
}

export async function startTunnel(targetHost = "vps", isDaemon = false): Promise<void> {
  const endpoint = ENDPOINTS[targetHost] ?? ENDPOINTS.vps!;
  const key = findSshKey(endpoint);

  console.log(`--> Démarrage du tunnel natif vers ${endpoint.name} (${endpoint.publicIp})...`);
  if (!key) {
    console.warn(`[Avertissement] Aucune clé SSH standard trouvée dans ~/.ssh. Tentative avec l'agent SSH local.`);
  }

  // Si on a un alias configuré dans ~/.ssh/config pour targetHost, l'utiliser en priorité
  const destination = targetHost || `${endpoint.user}@${endpoint.publicIp}`;
  const sshArgs = key ? buildSshArgs(endpoint, key, destination) : [
    "-N", "-T",
    "-o", "ServerAliveInterval=20",
    "-o", "ServerAliveCountMax=3",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    ...FORWARD_PORTS.flatMap(f => ["-L", `127.0.0.1:${f.local}:127.0.0.1:${f.remote}`]),
    destination
  ];

  console.log("Ports relayés vers la boucle locale :");
  for (const f of FORWARD_PORTS) {
    console.log(`  - 127.0.0.1:${f.local} -> distant:${f.remote} (${f.desc})`);
  }

  await Bun.write(PID_FILE, ""); // ensure dir
  const proc = Bun.spawn(["ssh", ...sshArgs], {
    stdio: isDaemon ? ["ignore", "ignore", "ignore"] : ["ignore", "inherit", "inherit"],
  });

  await writeFile(PID_FILE, JSON.stringify({
    pid: proc.pid,
    target: targetHost,
    startedAt: new Date().toISOString(),
  }));

  console.log(`✓ Tunnel actif (PID: ${proc.pid})`);

  if (isDaemon) {
    proc.unref();
  } else {
    const exitCode = await proc.exited;
    console.log(`Tunnel terminé avec le code ${exitCode}`);
  }
}

export async function stopTunnel(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log("Aucun tunnel actif enregistré.");
    return;
  }

  try {
    const raw = await readFile(PID_FILE, "utf8");
    const data = JSON.parse(raw);
    if (data.pid) {
      console.log(`--> Arrêt du tunnel (PID ${data.pid})...`);
      process.kill(data.pid, "SIGTERM");
    }
  } catch {
    // Process might already be dead
  }

  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(PID_FILE);
  } catch {}
  console.log("✓ Tunnel arrêté.");
}

export async function checkTunnelStatus(): Promise<void> {
  console.log("--> Vérification du tunnel natif...");
  let active = false;
  if (existsSync(PID_FILE)) {
    try {
      const data = JSON.parse(await readFile(PID_FILE, "utf8"));
      active = true;
      console.log(`État: ACTIF (PID: ${data.pid}, Cible: ${data.target}, Démarré le: ${data.startedAt})`);
    } catch {
      console.log("État: Fichier PID corrompu.");
    }
  } else {
    console.log("État: INACTIF");
  }

  console.log("\nTest des ports relayés en boucle locale :");
  for (const f of FORWARD_PORTS) {
    try {
      const s = await fetch(`http://127.0.0.1:${f.local}`, { signal: AbortSignal.timeout(1000) })
        .then(() => "RÉPOND")
        .catch((e) => (e.name === "TimeoutError" ? "TIMEOUT (PORT OUVERT)" : "FERMÉ"));
      console.log(`  - 127.0.0.1:${f.local} (${f.desc}) : ${s}`);
    } catch {
      console.log(`  - 127.0.0.1:${f.local} (${f.desc}) : ERREUR`);
    }
  }
}

export async function generateWireguardConfig(peer: "aphro" | "omar" = "aphro"): Promise<string> {
  const ip = peer === "omar" ? "10.200.77.5/32" : "10.200.77.4/32";
  const desc = peer === "omar" ? "Omar PC Peer (omar-pc)" : "Windows Native Peer (aphro-pc)";
  const filename = peer === "omar" ? "wireguard-omar-pc.conf.example" : "wireguard-aphro-pc.conf.example";

  const conf = `[Interface]
# ${desc}
PrivateKey = <METTRE_ICI_LA_CLE_PRIVEE_${peer.toUpperCase()}_0600>
Address = ${ip}
DNS = 1.1.1.1

[Peer]
# VPS Hub
PublicKey = McWuNyGdzU81q9MEyfvnxoGYIHqGW1UcRqpcge3NxB4=
Endpoint = 51.77.147.152:51821
AllowedIPs = 10.200.77.0/24
PersistentKeepalive = 25
`;
  const outPath = join(ROOT, "deploy", "docker", filename);
  await writeFile(outPath, conf, "utf8");
  console.log(`✓ Modèle WireGuard client généré (${peer}) : ${outPath}`);
  return outPath;
}

if (import.meta.main) {
  const cmd = process.argv[2] ?? "status";
  const target = process.argv.includes("--dbfr") ? "dbfr" : "vps";
  const isDaemon = process.argv.includes("--daemon");
  const peer = process.argv.includes("--omar") ? "omar" : "aphro";

  switch (cmd) {
    case "up":
      await startTunnel(target, isDaemon);
      break;
    case "down":
      await stopTunnel();
      break;
    case "status":
      await checkTunnelStatus();
      break;
    case "generate-wireguard":
      await generateWireguardConfig(peer);
      break;
    default:
      console.log("Usage: bun native-tunnel.ts [up|down|status|generate-wireguard] [--dbfr] [--daemon] [--omar]");
  }
}
