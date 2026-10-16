#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * setup-agent-connectors.ts — Outil universel de configuration des connecteurs
 * pour les agents : Codex, AGY (Antigravity) et Claude Code.
 *
 * Configure l'accès aux serveurs :
 *   1. Shenron MCP & A2A publics (https://dragonballfr.com/mcp & /api/a2a)
 *   2. Aphrody MCP Streamable HTTP (http://127.0.0.1:8793/mcp via tunnel ou VPN)
 *   3. Aphrody A2A Coordination Hub (http://127.0.0.1:8788 via tunnel ou VPN)
 *   4. LLM Gemma4 & Qwen3 Shenron Chat (http://127.0.0.1:8798 / 8799)
 *
 * Usage:
 *   bun scripts/ops/setup-agent-connectors.ts [--write] [--status]
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

export async function testEndpointsStatus(_tokens: ConnectorTokens): Promise<void> {
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
  const args = new Set(process.argv.slice(2));
  const shouldWrite = args.has("--write");
  const checkStatus = args.has("--status");

  const tokens = loadAphrodyTokens();

  if (tokens.mcpToken) {
    console.log("✓ Jeton Aphrody MCP détecté.");
  } else {
    console.log("! Aucun jeton Aphrody MCP détecté dans l'environnement local.");
  }

  if (tokens.a2aToken) {
    console.log("✓ Jeton Aphrody A2A détecté.");
  }

  if (shouldWrite) {
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
