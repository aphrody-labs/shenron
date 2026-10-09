#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * setup-agent-connectors.ts — Outil universel de configuration des connecteurs
 * pour tous les agents : Codex, AGY (Antigravity), Claude Code et Omar.
 *
 * Configure l'accès aux serveurs :
 *   1. Shenron MCP & A2A publics (https://dragonballfr.com/mcp & /api/a2a)
 *   2. Aphrody MCP Streamable HTTP (http://127.0.0.1:8793/mcp via tunnel ou VPN)
 *   3. Aphrody A2A Coordination Hub (http://127.0.0.1:8788 via tunnel ou VPN)
 *   4. LLM Gemma4 & Qwen3 Shenron Chat (http://127.0.0.1:8798 / 8799)
 *
 * Usage:
 *   bun scripts/ops/setup-agent-connectors.ts [--write] [--omar-only] [--status]
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

export interface ConnectorTokens {
  mcpToken?: string;
  a2aToken?: string;
}

export function loadAphrodyTokens(): ConnectorTokens {
  const tokens: ConnectorTokens = {};

  // 1. Env vars
  if (process.env.APHRODY_MCP_HTTP_TOKEN) {
    tokens.mcpToken = process.env.APHRODY_MCP_HTTP_TOKEN;
  }
  if (process.env.APHRODY_A2A_COORD_TOKEN) {
    tokens.a2aToken = process.env.APHRODY_A2A_COORD_TOKEN;
  }

  // 2. Private host files in ~/.aphrody
  const mcpEnvPath = join(
    homedir(),
    ".aphrody",
    "private",
    "shenron",
    "hosts",
    "vps",
    "etc",
    "aphrody",
    "aphrody-mcp-http.env",
  );
  if (!tokens.mcpToken && existsSync(mcpEnvPath)) {
    try {
      const m = /APHRODY_MCP_HTTP_TOKEN=["']?([a-f0-9]+)["']?/i.exec(
        readFileSync(mcpEnvPath, "utf8"),
      );
      if (m?.[1]) tokens.mcpToken = m[1];
    } catch {}
  }

  const a2aEnvPath = join(
    homedir(),
    ".aphrody",
    "private",
    "shenron",
    "hosts",
    "vps",
    "etc",
    "aphrody",
    "aphrody-a2a.env",
  );
  if (!tokens.a2aToken && existsSync(a2aEnvPath)) {
    try {
      const m = /APHRODY_A2A_COORD_TOKEN=["']?([a-f0-9]+)["']?/i.exec(
        readFileSync(a2aEnvPath, "utf8"),
      );
      if (m?.[1]) tokens.a2aToken = m[1];
    } catch {}
  }

  return tokens;
}

export function buildClaudeMcpConfig(tokens: ConnectorTokens) {
  const mcpServers: Record<string, any> = {
    "shenron-public": {
      url: "https://dragonballfr.com/mcp",
    },
  };

  if (tokens.mcpToken) {
    mcpServers["aphrody-tunnel"] = {
      url: "http://127.0.0.1:8793/mcp",
      headers: {
        Authorization: `Bearer ${tokens.mcpToken}`,
      },
    };
  } else {
    mcpServers["aphrody-tunnel"] = {
      url: "http://127.0.0.1:8793/mcp",
      headers: {
        Authorization: "Bearer <VOTRE_JETON_APHRODY_MCP_HTTP>",
      },
    };
  }

  return { mcpServers };
}

export function buildAgyMcpConfig(tokens: ConnectorTokens) {
  const mcpServers: Record<string, any> = {
    "shenron-public": {
      serverUrl: "https://dragonballfr.com/mcp",
    },
  };

  if (tokens.mcpToken) {
    mcpServers["aphrody-tunnel"] = {
      serverUrl: "http://127.0.0.1:8793/mcp",
      headers: {
        Authorization: `Bearer ${tokens.mcpToken}`,
      },
    };
  } else {
    mcpServers["aphrody-tunnel"] = {
      serverUrl: "http://127.0.0.1:8793/mcp",
      headers: {
        Authorization: "Bearer <VOTRE_JETON_APHRODY_MCP_HTTP>",
      },
    };
  }

  return { mcpServers };
}

export function buildCodexTomlConfig(tokens: ConnectorTokens): string {
  const token = tokens.mcpToken ?? "<VOTRE_JETON_APHRODY_MCP_HTTP>";
  return `# Codex MCP Configuration — Shenron & Aphrody
[mcp_servers.shenron_public]
url = "https://dragonballfr.com/mcp"

[mcp_servers.aphrody_tunnel]
url = "http://127.0.0.1:8793/mcp"
http_headers = { "Authorization" = "Bearer ${token}" }
`;
}

export function buildOmarReadme(tokens: ConnectorTokens): string {
  const token = tokens.mcpToken ?? "<DEMANDER_AU_STAFF>";
  return `# 🚀 Guide de Connexion pour Omar — MCP, A2A & LLM

Bienvenue Omar ! Ce dossier contient tout ce qu'il faut pour connecter **Codex**, **AGY (Antigravity)** et **Claude Code** sur ton PC aux infrastructures de Shenron et Aphrody.

---

## 1. Démarrer le tunnel SSH

Avant de lancer tes agents sur ton PC, démarre le tunnel qui relie ton PC au VPS (compte Unix « omar », ta clé SSH) :

### Sous Windows (PowerShell) :
\`\`\`powershell
.\\connect-tunnel.ps1
\`\`\`

### Sous Linux / macOS / WSL :
\`\`\`bash
chmod +x ./connect-tunnel.sh
./connect-tunnel.sh
\`\`\`

Ce tunnel forwarde automatiquement les ports suivants sur ta machine locale (\`127.0.0.1\`) :
- **8793** : Aphrody MCP HTTP (outils avancés Web, Gemini, OCR, Docs)
- **8788** : Aphrody A2A Hub (coordination multi-agents)
- **8798** : LLM Gemma4
- **8799** : LLM Shenron Chat
- **15433** : PostgreSQL
- **16379** : Redis

---

## 2. Configuration pour tes outils d'agent

### A. Pour Claude Code
Copie ou fusionne le fichier \`.mcp.json\` de ce dossier dans ton dossier de travail ou dans ton \`~/.claude.json\` :
\`\`\`json
${JSON.stringify(buildClaudeMcpConfig(tokens), null, 2)}
\`\`\`

### B. Pour Antigravity / AGY
Copie \`mcp_config.json\` dans \`~/.gemini/antigravity-cli/mcp_config.json\` ou à la racine de ton workspace :
\`\`\`json
${JSON.stringify(buildAgyMcpConfig(tokens), null, 2)}
\`\`\`

### C. Pour Codex
Ajoute dans ton \`.codex/config.toml\` :
\`\`\`toml
${buildCodexTomlConfig(tokens)}
\`\`\`

---

## 3. Alternative sans tunnel (Mode Public Direct)
Si tu n'as pas de connexion SSH au VPS, tes agents peuvent directement utiliser :
- **Shenron MCP** : \`https://dragonballfr.com/mcp\` (100% public, lecture seule sans auth)
- **A2A Agent Card** : \`https://dragonballfr.com/.well-known/agent-card.json\`
- **A2A Coordination API** : \`https://dragonballfr.com/api/a2a\`
`;
}

export function buildOmarPs1Tunnel(): string {
  return `# Script PowerShell pour Omar — Lancement du tunnel SSH vers le VPS
$vpsHost = "51.77.147.152"
$user = "omar"

Write-Host "--> Lancement du tunnel vers le VPS Aphrody ($vpsHost)..." -ForegroundColor Cyan
Write-Host "Ports relayes vers 127.0.0.1 :"
Write-Host "  - 8793 : Aphrody MCP Server"
Write-Host "  - 8788 : Aphrody A2A Coordination Hub"
Write-Host "  - 8798 : LLM Gemma4"
Write-Host "  - 8799 : LLM Qwen3 Shenron Chat"
Write-Host "  - 15433: PostgreSQL"
Write-Host "  - 16379: Redis"

ssh -N -T \`
  -o ServerAliveInterval=20 \`
  -o ServerAliveCountMax=3 \`
  -o ExitOnForwardFailure=yes \`
  -L 127.0.0.1:8793:127.0.0.1:8793 \`
  -L 127.0.0.1:8788:127.0.0.1:8788 \`
  -L 127.0.0.1:8798:127.0.0.1:8798 \`
  -L 127.0.0.1:8799:127.0.0.1:8799 \`
  -L 127.0.0.1:15433:127.0.0.1:15433 \`
  -L 127.0.0.1:16379:127.0.0.1:6379 \`
  "$user@$vpsHost"
`;
}

export function buildOmarShTunnel(): string {
  return `#!/bin/bash
# Script Bash pour Omar — Lancement du tunnel SSH vers le VPS
VPS_HOST="51.77.147.152"
SSH_USER="omar"

echo "--> Lancement du tunnel vers le VPS Aphrody ($VPS_HOST)..."
echo "Ports relayés vers 127.0.0.1 :"
echo "  - 8793 : Aphrody MCP Server"
echo "  - 8788 : Aphrody A2A Coordination Hub"
echo "  - 8798 : LLM Gemma4"
echo "  - 8799 : LLM Qwen3 Shenron Chat"
echo "  - 15433: PostgreSQL"
echo "  - 16379: Redis"

exec ssh -N -T \\
  -o ServerAliveInterval=20 \\
  -o ServerAliveCountMax=3 \\
  -o ExitOnForwardFailure=yes \\
  -L 127.0.0.1:8793:127.0.0.1:8793 \\
  -L 127.0.0.1:8788:127.0.0.1:8788 \\
  -L 127.0.0.1:8798:127.0.0.1:8798 \\
  -L 127.0.0.1:8799:127.0.0.1:8799 \\
  -L 127.0.0.1:15433:127.0.0.1:15433 \\
  -L 127.0.0.1:16379:127.0.0.1:6379 \\
  "$SSH_USER@$VPS_HOST"
`;
}

export function buildOmarWireguardConfig(): string {
  return `# Reference only: Omar's peer is declared in Aphrody's wg1 inventory
# (tools/config/host/wireguard/aphrody-tunnel.json, rendered by "aphrody infra wg").
# The private key never leaves Omar's PC.
[Interface]
# Omar Native PC Peer (omar-pc)
PrivateKey = <METTRE_ICI_LA_CLE_PRIVEE_OMAR>
Address = 10.200.77.10/32
DNS = 1.1.1.1

[Peer]
# VPS Hub
PublicKey = McWuNyGdzU81q9MEyfvnxoGYIHqGW1UcRqpcge3NxB4=
Endpoint = 51.77.147.152:51821
AllowedIPs = 10.200.77.0/24
PersistentKeepalive = 25
`;
}

export async function writeOmarBundle(targetDir: string): Promise<void> {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const templateTokens: ConnectorTokens = {
    mcpToken: "<VOTRE_JETON_APHRODY_MCP_HTTP>",
    a2aToken: "<VOTRE_JETON_APHRODY_A2A>",
  };

  await writeFile(join(targetDir, "README.md"), buildOmarReadme(templateTokens), "utf8");
  await writeFile(join(targetDir, "connect-tunnel.ps1"), buildOmarPs1Tunnel(), "utf8");
  await writeFile(join(targetDir, "connect-tunnel.sh"), buildOmarShTunnel(), "utf8");
  await writeFile(
    join(targetDir, "wireguard-omar.conf.example"),
    buildOmarWireguardConfig(),
    "utf8",
  );
  await writeFile(
    join(targetDir, "mcp.claude.json.example"),
    JSON.stringify(buildClaudeMcpConfig(templateTokens), null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(targetDir, "mcp.agy.json.example"),
    JSON.stringify(buildAgyMcpConfig(templateTokens), null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(targetDir, "mcp.codex.toml.example"),
    buildCodexTomlConfig(templateTokens),
    "utf8",
  );

  console.log(`✓ Pack de connecteurs Omar généré (modèles sécurisés) dans : ${targetDir}`);
}

export async function testEndpointsStatus(tokens: ConnectorTokens): Promise<void> {
  console.log("--> Test des endpoints distants et locaux :\n");

  const endpoints = [
    { name: "Public Shenron MCP", url: "https://dragonballfr.com/mcp", method: "GET" },
    { name: "Public Shenron A2A", url: "https://dragonballfr.com/api/a2a", method: "GET" },
    {
      name: "Public Shenron Agent Card",
      url: "https://dragonballfr.com/.well-known/agent-card.json",
      method: "GET",
    },
    {
      name: "Local Aphrody MCP (via tunnel)",
      url: "http://127.0.0.1:8793/healthz",
      method: "GET",
    },
    {
      name: "Local Aphrody A2A (via tunnel)",
      url: "http://127.0.0.1:8788/ping",
      method: "GET",
    },
    {
      name: "Local Gemma4 LLM (via tunnel)",
      url: "http://127.0.0.1:8798/health",
      method: "GET",
    },
    {
      name: "Local Qwen3 Shenron Chat (via tunnel)",
      url: "http://127.0.0.1:8799/health",
      method: "GET",
    },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        signal: AbortSignal.timeout(2000),
      });
      const ok = res.status >= 200 && res.status < 400;
      console.log(`  ${ok ? "✓" : "!"} ${ep.name.padEnd(35)} : HTTP ${res.status} (${ep.url})`);
    } catch {
      console.log(`  ✗ ${ep.name.padEnd(35)} : Injoignable (${ep.url})`);
    }
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes("--write");
  const omarOnly = args.includes("--omar-only");
  const checkStatus = args.includes("--status");

  const tokens = loadAphrodyTokens();

  if (tokens.mcpToken) {
    console.log("✓ Jeton Aphrody MCP détecté.");
  } else {
    console.log("! Aucun jeton Aphrody MCP détecté dans l'environnement local.");
  }

  if (tokens.a2aToken) {
    console.log("✓ Jeton Aphrody A2A détecté.");
  }

  if (shouldWrite || omarOnly) {
    await writeOmarBundle(join(ROOT, "deploy", "connectors", "omar"));
  }

  if (!omarOnly && shouldWrite) {
    const localDir = join(ROOT, "deploy", "connectors", "local");
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true, mode: 0o700 });
    }
    const privateFile = { encoding: "utf8", mode: 0o600 } as const;

    const claudeMcpFile = join(localDir, "mcp.claude.json");
    await writeFile(
      claudeMcpFile,
      JSON.stringify(buildClaudeMcpConfig(tokens), null, 2) + "\n",
      privateFile,
    );
    console.log(`✓ Configuration locale Claude Code générée : ${claudeMcpFile}`);

    const agyMcpFile = join(localDir, "mcp.agy.json");
    await writeFile(
      agyMcpFile,
      JSON.stringify(buildAgyMcpConfig(tokens), null, 2) + "\n",
      privateFile,
    );
    console.log(`✓ Configuration locale AGY générée : ${agyMcpFile}`);

    const codexFile = join(localDir, "mcp.codex.toml");
    await writeFile(codexFile, buildCodexTomlConfig(tokens), privateFile);
    console.log(`✓ Configuration locale Codex générée : ${codexFile}`);
  }

  if (checkStatus) {
    console.log("");
    await testEndpointsStatus(tokens);
  }
}
