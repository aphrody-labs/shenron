#!/usr/bin/env bun
/**
 * Manifestes Antigravity (`agy`) du plugin « shenron », dérivés de sa source Claude Code.
 *
 * `agy plugin validate|install` lit `plugin.json` à la racine du plugin et ses serveurs MCP
 * dans `mcp_config.json` (il ignore `.mcp.json`). Claude Code, lui, lit
 * `.claude-plugin/plugin.json` et `.mcp.json` (stdio `shenron-mcp`), inchangés. Ce script
 * écrit donc, sans jamais recopier une version à la main :
 *
 *   plugin/plugin.json       nom, version, description, auteur de `.claude-plugin/plugin.json`
 *   plugin/mcp_config.json   le MCP HTTP public du site (`<site>/mcp`)
 *
 *   bun scripts/plugin/agy-manifest.ts           # régénère
 *   bun scripts/plugin/agy-manifest.ts --check   # échoue en cas de dérive (test:scripts)
 */
import { join } from "node:path";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { RACINE } from "./build-references";

const SOURCE = "plugin/.claude-plugin/plugin.json";

interface ClaudeManifest {
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string };
}

/** Sorties attendues (chemin relatif à la racine du dépôt → contenu). */
export async function agyManifests(root: string = RACINE): Promise<Record<string, string>> {
  const claude = (await Bun.file(join(root, SOURCE)).json()) as ClaudeManifest;
  const manifest = {
    name: claude.name,
    version: claude.version,
    description: claude.description ?? "",
    ...(claude.author ? { author: claude.author } : {}),
  };
  const mcp = { mcpServers: { shenron: { serverUrl: `${DEFAULT_PUBLIC_ORIGINS.site}/mcp` } } };
  return {
    "plugin/plugin.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "plugin/mcp_config.json": `${JSON.stringify(mcp, null, 2)}\n`,
  };
}

/** Chemins en dérive (absents ou différents de la génération). */
export async function agyDrift(root: string = RACINE): Promise<string[]> {
  const out: string[] = [];
  for (const [path, text] of Object.entries(await agyManifests(root))) {
    const file = Bun.file(join(root, path));
    if (!(await file.exists()) || (await file.text()) !== text) out.push(path);
  }
  return out;
}

if (import.meta.main) {
  if (Bun.argv.includes("--check")) {
    const drift = await agyDrift();
    if (drift.length) {
      console.error(`✗ manifestes agy en dérive : ${drift.join(", ")}`);
      console.error("→ bun scripts/plugin/agy-manifest.ts");
      process.exit(1);
    }
    console.log("✓ manifestes agy à jour");
  } else {
    for (const [path, text] of Object.entries(await agyManifests())) {
      await Bun.write(join(RACINE, path), text);
      console.log(`écrit : ${path}`);
    }
  }
}
