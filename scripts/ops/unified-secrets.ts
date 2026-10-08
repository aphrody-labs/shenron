#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * unified-secrets.ts — Gestionnaire universel et unifié des secrets pour Shenron & Aphrody.
 *
 * Fédère toutes les sources de secrets et configurations de l'infrastructure :
 *   1. Google / Gemini / Cloud (Gemini API, Google Cloud Project, GTM, AdSense)
 *   2. Discord (Bot Token, OAuth2 Client ID/Secret, Public Key, 20+ Channels & Guilds)
 *   3. SQL & Bases de données (PostgreSQL Neon Serverless / Local, SQLite VFS)
 *   4. Redis & KV (Upstash Serverless, Valkey, Redis loopback)
 *   5. Authentification & Sessions (Better Auth, HMAC secrets, Tokens Admin, MCP)
 *   6. Aphrody Core & AI (MCP HTTP, A2A Hub, LLaMA / Gemma4 / Qwen3, Ingestion BXC)
 *   7. Cloud Serverless (Vercel, Cloudflare, AWS Lambda, Docker Serverless)
 *
 * Utilisation :
 *   bun scripts/ops/unified-secrets.ts audit             # Affiche un audit sécurisé (masqué)
 *   bun scripts/ops/unified-secrets.ts sync-all         # Propage vers les apps et connecteurs
 *   bun scripts/ops/unified-secrets.ts export-serverless # Génère un profil .env.serverless
 *   bun scripts/ops/unified-secrets.ts export-json       # Export JSON structuré (Secret Managers)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chmod, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../..");

export type SecretCategory =
  | "Google"
  | "Discord"
  | "SQL"
  | "Redis"
  | "Auth"
  | "Aphrody"
  | "Serverless";

export interface SecretEntry {
  key: string;
  category: SecretCategory;
  description: string;
  requiredForServerless: boolean;
  sourceFile?: string;
  value?: string;
  isFallback?: boolean;
}

export const SECRET_DEFINITIONS: Record<
  string,
  {
    category: SecretCategory;
    description: string;
    requiredForServerless: boolean;
    defaultFallback?: string;
  }
> = {
  // 1. Google & AI
  GEMINI_API_KEY: {
    category: "Google",
    description: "Clé API Google Gemini / AI Studio",
    requiredForServerless: false,
  },
  GOOGLE_API_KEY: {
    category: "Google",
    description: "Clé API Google Cloud Platform",
    requiredForServerless: false,
  },
  GOOGLE_PROJECT_ID: {
    category: "Google",
    description: "ID du projet Google Cloud (aphrody)",
    requiredForServerless: false,
    defaultFallback: "aphrody",
  },
  NEXT_PUBLIC_GTM_ID: {
    category: "Google",
    description: "Identifiant Google Tag Manager",
    requiredForServerless: false,
    defaultFallback: "GTM-5KVR4G9",
  },
  NEXT_PUBLIC_ADSENSE_CLIENT: {
    category: "Google",
    description: "Identifiant client Google AdSense",
    requiredForServerless: false,
    defaultFallback: "ca-pub-6827010471026042",
  },
  APHRODY_SHENRON_GEMINI_COOKIE_FILE: {
    category: "Google",
    description: "Fichier de session cookie Gemini headless",
    requiredForServerless: false,
  },

  // 2. Discord
  DISCORD_TOKEN: {
    category: "Discord",
    description: "Jeton de bot Discord principal",
    requiredForServerless: false,
  },
  DISCORD_TOKEN_SHENRON: {
    category: "Discord",
    description: "Alias canonique jeton bot Shenron",
    requiredForServerless: false,
  },
  DISCORD_CLIENT_ID: {
    category: "Discord",
    description: "Client ID OAuth2 Discord",
    requiredForServerless: false,
    defaultFallback: "1497194276025663680",
  },
  DISCORD_CLIENT_SECRET: {
    category: "Discord",
    description: "Secret OAuth2 Discord",
    requiredForServerless: false,
  },
  DISCORD_PUBLIC_KEY: {
    category: "Discord",
    description: "Clé publique pour signatures d'interactions HTTP Discord",
    requiredForServerless: true,
  },
  APPLICATION_ID: {
    category: "Discord",
    description: "ID de l'application Discord",
    requiredForServerless: false,
    defaultFallback: "1497194276025663680",
  },
  GUILD_ID: {
    category: "Discord",
    description: "ID de la guilde principale Dragon Ball FR",
    requiredForServerless: false,
    defaultFallback: "934894610545770506",
  },
  ADDITIONAL_GUILD_IDS: {
    category: "Discord",
    description: "ID de la guilde Aphrody AI Lab",
    requiredForServerless: false,
    defaultFallback: "1554189180030947338",
  },
  OWNER_ID: {
    category: "Discord",
    description: "ID du propriétaire principal",
    requiredForServerless: false,
  },
  OWNER_IDS: {
    category: "Discord",
    description: "IDs des propriétaires autorisés",
    requiredForServerless: false,
  },
  SHENRON_AI_CHANNEL_ID: {
    category: "Discord",
    description: "Canal salon IA Shenron",
    requiredForServerless: false,
    defaultFallback: "1557354118710829117",
  },
  ADMIN_LAB_CHANNEL_ID: {
    category: "Discord",
    description: "Canal salon privé admin lab",
    requiredForServerless: false,
    defaultFallback: "1557354144149405806",
  },
  ANNOUNCE_CHANNEL_ID: {
    category: "Discord",
    description: "Canal annonces",
    requiredForServerless: false,
    defaultFallback: "1034768037217304606",
  },

  // 3. SQL & Bases
  DATABASE_URL: {
    category: "SQL",
    description: "URL de connexion PostgreSQL (Neon serverless ou PostgreSQL)",
    requiredForServerless: true,
    defaultFallback: "postgresql://shenron:shenron_dev_pass@127.0.0.1:5432/shenron_site",
  },
  DATABASE_PATH: {
    category: "SQL",
    description: "Chemin de la base SQLite réplica bot",
    requiredForServerless: false,
    defaultFallback: "data/bot.db",
  },
  APHRODY_MCP_DATABASE_URL: {
    category: "SQL",
    description: "URL base PostgreSQL pour le MCP Aphrody",
    requiredForServerless: false,
  },
  APHRODY_WEB_DATABASE_URL: {
    category: "SQL",
    description: "URL base crawl Aphrody Web",
    requiredForServerless: false,
  },
  APHRODY_SITE_DATABASE_URL: {
    category: "SQL",
    description: "URL base site Aphrody",
    requiredForServerless: false,
  },

  // 4. Redis & KV
  REDIS_URL: {
    category: "Redis",
    description: "URL Redis ou Upstash Serverless Redis (rediss://)",
    requiredForServerless: false,
    defaultFallback: "redis://127.0.0.1:6379",
  },
  VALKEY_URL: { category: "Redis", description: "Alias Valkey", requiredForServerless: false },

  // 5. Auth & Sessions
  BETTER_AUTH_SECRET: {
    category: "Auth",
    description: "Secret cryptographique Better Auth (32+ chars)",
    requiredForServerless: true,
    defaultFallback: "dev_fallback_better_auth_secret_minimum_32_chars_ok",
  },
  BETTER_AUTH_URL: {
    category: "Auth",
    description: "URL canonique de base Better Auth",
    requiredForServerless: true,
    defaultFallback: "https://dragonballfr.com",
  },
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: {
    category: "Auth",
    description: "Clé de chiffrement Next.js Server Actions",
    requiredForServerless: false,
  },
  SHENRON_ADMIN_TOKEN: {
    category: "Auth",
    description: "Jeton maître d'administration Shenron",
    requiredForServerless: false,
    defaultFallback: "dev_admin_master_token_aphrody_32char",
  },
  SHENRON_USER_SECRET: {
    category: "Auth",
    description: "Secret pour identité d'utilisateur agissant",
    requiredForServerless: false,
  },
  SHENRON_ADMIN_IPS: {
    category: "Auth",
    description: "Adresses IP staff autorisées",
    requiredForServerless: false,
  },

  // 6. Aphrody Core & AI
  APHRODY_MCP_HTTP_TOKEN: {
    category: "Aphrody",
    description: "Bearer token pour Aphrody MCP Streamable HTTP",
    requiredForServerless: false,
  },
  APHRODY_A2A_COORD_TOKEN: {
    category: "Aphrody",
    description: "Token de coordination A2A Hub",
    requiredForServerless: false,
  },
  APHRODY_AI_HTTP_URL: {
    category: "Aphrody",
    description: "URL API IA Aphrody",
    requiredForServerless: false,
    defaultFallback: "https://dragonballfr.com",
  },
  APHRODY_AI_HTTP_TOKEN: {
    category: "Aphrody",
    description: "Bearer token API IA Aphrody",
    requiredForServerless: false,
  },
  APHRODY_AI_CHAT_BASE_URL: {
    category: "Aphrody",
    description: "URL endpoint LLM Chat direct (OpenAI-compatible)",
    requiredForServerless: false,
    defaultFallback: "http://127.0.0.1:8798/v1",
  },
  APHRODY_AI_CHAT_MODEL: {
    category: "Aphrody",
    description: "Modèle LLM de chat (gemma4-e2b ou shenron-chat-v2)",
    requiredForServerless: false,
    defaultFallback: "gemma4-e2b",
  },
  APHRODY_AI_EMBED_BASE_URL: {
    category: "Aphrody",
    description: "URL endpoint embeddings E5",
    requiredForServerless: false,
  },
  APHRODY_AI_EMBED_MODEL: {
    category: "Aphrody",
    description: "Modèle d'embedding Xenova/multilingual-e5-small",
    requiredForServerless: false,
    defaultFallback: "Xenova/multilingual-e5-small",
  },
  APHRODY_AI_EMBED_DIMENSIONS: {
    category: "Aphrody",
    description: "Dimensions des vecteurs embeddings (384)",
    requiredForServerless: false,
    defaultFallback: "384",
  },

  // 7. Serverless & Cloud
  NEXT_PUBLIC_SITE_URL: {
    category: "Serverless",
    description: "Origine publique du site frontend",
    requiredForServerless: true,
    defaultFallback: "https://dragonballfr.com",
  },
  SHENRON_PUBLIC_SITE_URL: {
    category: "Serverless",
    description: "Alias origine publique",
    requiredForServerless: true,
    defaultFallback: "https://dragonballfr.com",
  },
  SHENRON_PUBLIC_API_URL: {
    category: "Serverless",
    description: "Origine publique de l'API",
    requiredForServerless: true,
    defaultFallback: "https://dragonballfr.com/api",
  },
  SHENRON_PUBLIC_ASSETS_URL: {
    category: "Serverless",
    description: "Origine publique des assets et CDN",
    requiredForServerless: true,
    defaultFallback: "https://cdn.dragonballfr.com",
  },
  NEXT_PUBLIC_CDN_URL: {
    category: "Serverless",
    description: "URL publique CDN",
    requiredForServerless: true,
    defaultFallback: "https://cdn.dragonballfr.com",
  },
  VERCEL_TOKEN: {
    category: "Serverless",
    description: "Token déploiement Vercel",
    requiredForServerless: false,
  },
  NPM_TOKEN: {
    category: "Serverless",
    description: "Token registre packages npm Aphrody",
    requiredForServerless: false,
  },
  NODE_ENV: {
    category: "Serverless",
    description: "Mode d'environnement Node/Bun",
    requiredForServerless: true,
    defaultFallback: "production",
  },
};

/**
 * Lit et parse un fichier .env de manière sécurisée.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      const val = rest
        .join("=")
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && val) {
        result[key.trim()] = val;
      }
    }
  } catch {}
  return result;
}

/**
 * Découvre et fusionne l'intégralité des secrets disponibles avec priorité décroissante :
 *   1. process.env
 *   2. ~/.aphrody/private/shenron/hosts/{dbfr,vps}
 *   3. ~/.aphrody/private/shenron/env/
 *   4. ~/.aphrody/private/env/
 *   5. Local workspace envs
 *   6. Valeurs de repli par défaut
 */
export function discoverUnifiedSecrets(): Map<string, SecretEntry> {
  const entries = new Map<string, SecretEntry>();

  // 1. Initialise avec les définitions
  for (const [key, meta] of Object.entries(SECRET_DEFINITIONS)) {
    entries.set(key, {
      key,
      category: meta.category,
      description: meta.description,
      requiredForServerless: meta.requiredForServerless,
    });
  }

  // 2. Fichiers du coffre privé Aphrody (par ordre croissant de spécificité)
  const candidateFiles: string[] = [
    join(homedir(), ".aphrody", "private", "env", "dev.env"),
    join(homedir(), ".aphrody", "private", "shenron", "env", "shenron-bot.env"),
    join(homedir(), ".aphrody", "private", "shenron", "env", "shenron-site.env"),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "rose-griffon",
      "shenron-bot.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "rose-griffon",
      "shenron-site.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "rose-griffon",
      "shenron-mcp-http.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "aphrody",
      "aphrody-mcp-http.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "aphrody",
      "aphrody-a2a.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "aphrody",
      "aphrody-ai-http.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "vps",
      "etc",
      "aphrody",
      "aphrody-site.next.env",
    ),
    join(homedir(), ".aphrody", "private", "shenron", "hosts", "dbfr", ".shenron-neon.env"),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "dbfr",
      "etc",
      "rose-griffon",
      "shenron-site.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "dbfr",
      "etc",
      "rose-griffon",
      "shenron-bot.env",
    ),
    join(
      homedir(),
      ".aphrody",
      "private",
      "shenron",
      "hosts",
      "dbfr",
      "etc",
      "aphrody",
      "shenron-compute.env",
    ),
    join(ROOT, "apps", "site", ".env.local"),
    join(ROOT, "apps", "bot", ".env"),
  ];

  for (const filePath of candidateFiles) {
    if (!existsSync(filePath)) continue;
    const kv = parseEnvFile(filePath);
    for (const [k, v] of Object.entries(kv)) {
      if (!v) continue;
      const existing = entries.get(k);
      if (existing) {
        existing.value = v;
        existing.sourceFile = filePath;
        existing.isFallback = false;
      } else {
        // Nouvelle clé découverte hors définition stricte
        entries.set(k, {
          key: k,
          category: guessCategory(k),
          description: "Clé additionnelle découverte",
          requiredForServerless: false,
          value: v,
          sourceFile: filePath,
          isFallback: false,
        });
      }
    }
  }

  // 3. Écrasement par les variables de processus explicites
  for (const [k, v] of Object.entries(process.env)) {
    if (!v) continue;
    const existing = entries.get(k);
    if (existing) {
      existing.value = v;
      existing.sourceFile = "process.env";
      existing.isFallback = false;
    }
  }

  // 4. Application des replis par défaut pour les clés manquantes
  for (const [k, entry] of entries.entries()) {
    if (!entry.value && SECRET_DEFINITIONS[k]?.defaultFallback) {
      entry.value = SECRET_DEFINITIONS[k]!.defaultFallback;
      entry.isFallback = true;
      entry.sourceFile = "default_fallback";
    }
  }

  return entries;
}

function guessCategory(key: string): SecretCategory {
  const upper = key.toUpperCase();
  if (
    upper.includes("GOOGLE") ||
    upper.includes("GEMINI") ||
    upper.includes("ADSENSE") ||
    upper.includes("GTM")
  )
    return "Google";
  if (
    upper.includes("DISCORD") ||
    upper.includes("GUILD") ||
    upper.includes("CHANNEL") ||
    upper.includes("ROLE") ||
    upper.includes("TICKET")
  )
    return "Discord";
  if (
    upper.includes("DATABASE") ||
    upper.includes("POSTGRES") ||
    upper.includes("SQL") ||
    upper.includes("NEON")
  )
    return "SQL";
  if (upper.includes("REDIS") || upper.includes("VALKEY")) return "Redis";
  if (
    upper.includes("AUTH") ||
    upper.includes("ADMIN") ||
    upper.includes("SECRET") ||
    upper.includes("SESSION") ||
    upper.includes("KEY")
  )
    return "Auth";
  if (
    upper.includes("APHRODY") ||
    upper.includes("SHENRON") ||
    upper.includes("BXC") ||
    upper.includes("RAG")
  )
    return "Aphrody";
  return "Serverless";
}

/**
 * Masque une valeur de secret pour l'affichage de diagnostic.
 */
export function maskSecretValue(val?: string): string {
  if (!val) return "(absent)";
  if (val.length <= 8) return "***";
  if (val.startsWith("postgresql://") || val.startsWith("postgres://")) {
    return val.replace(/:([^:@]+)@/, ":***@");
  }
  return `${val.slice(0, 4)}...${val.slice(-4)} (${val.length} chars)`;
}

/**
 * Affiche l'audit complet et sécurisé dans la console.
 */
export function printAuditReport(secrets: Map<string, SecretEntry>): void {
  console.log("=== 🛡️ Audit Unifié des Secrets Shenron & Aphrody (Zero-Leak) ===\n");

  const categories: SecretCategory[] = [
    "Google",
    "Discord",
    "SQL",
    "Redis",
    "Auth",
    "Aphrody",
    "Serverless",
  ];

  let totalKeys = 0;
  let presentKeys = 0;
  let fallbackKeys = 0;

  for (const cat of categories) {
    const inCat = Array.from(secrets.values()).filter((e) => e.category === cat);
    if (!inCat.length) continue;

    console.log(`📌 [${cat.toUpperCase()}] (${inCat.length} entrées) :`);
    for (const entry of inCat) {
      totalKeys++;
      let icon = "✗";
      let statusLabel = "ABSENT";

      if (entry.value && !entry.isFallback) {
        icon = "✓";
        statusLabel = "PRÉSENT";
        presentKeys++;
      } else if (entry.value && entry.isFallback) {
        icon = "⚑";
        statusLabel = "REPLI PAR DÉFAUT";
        fallbackKeys++;
      }

      const masked = maskSecretValue(entry.value);
      const reqMarker = entry.requiredForServerless ? " [REQUIS SERVERLESS]" : "";
      console.log(
        `  ${icon} ${entry.key.padEnd(35)} : ${statusLabel.padEnd(16)} ${masked.padEnd(28)} | ${entry.description}${reqMarker}`,
      );
    }
    console.log("");
  }

  console.log(
    `Résumé : ${presentKeys} réels, ${fallbackKeys} replis, ${totalKeys - presentKeys - fallbackKeys} manquants sur ${totalKeys} variables cataloguées.`,
  );
  console.log(
    "Mode Serverless : " +
      (presentKeys >= 10
        ? "✓ PRÊT AU DÉPLOIEMENT"
        : "! NÉCESSITE CONFIGURATION DES SECRETS MINIMAUX"),
  );
}

/**
 * Exporte un fichier .env.serverless consolidé pour l'infrastructure serverless.
 */
export async function exportServerlessEnv(
  secrets: Map<string, SecretEntry>,
  outputPath?: string,
): Promise<string> {
  const target = outputPath ?? join(ROOT, "deploy", "connectors", "local", ".env.serverless");
  const targetDir = resolve(target, "..");
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const lines: string[] = [
    "# SPDX-License-Identifier: Apache-2.0",
    "# -----------------------------------------------------------------------------",
    "# Shenron & Aphrody Unified Serverless Environment Profile",
    `# Généré le : ${new Date().toISOString()}`,
    "# Permissions : 0600 — Ne jamais commiter ce fichier dans Git",
    "# Compatible : Vercel, Cloudflare, AWS Lambda, Docker Serverless, Edge Functions",
    "# -----------------------------------------------------------------------------",
    "",
  ];

  const categories: SecretCategory[] = [
    "Serverless",
    "Google",
    "Discord",
    "SQL",
    "Redis",
    "Auth",
    "Aphrody",
  ];

  for (const cat of categories) {
    const inCat = Array.from(secrets.values()).filter((e) => e.category === cat && e.value);
    if (!inCat.length) continue;

    lines.push(`## ── Catégorie : ${cat} ──`);
    for (const e of inCat) {
      lines.push(`# ${e.description}`);
      lines.push(`${e.key}="${e.value}"`);
    }
    lines.push("");
  }

  const content = lines.join("\n");
  await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(target, 0o600);
  } catch {}

  console.log(`✓ Profil d'environnement serverless écrit avec succès (0600) : ${target}`);
  return target;
}

/**
 * Exporte les secrets sous format JSON structuré pour les Secret Managers cloud.
 */
export function exportSecretsJson(secrets: Map<string, SecretEntry>): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const [k, entry] of secrets.entries()) {
    if (entry.value) {
      dict[k] = entry.value;
    }
  }
  return dict;
}

/**
 * Synchronise les secrets découverts vers les emplacements applicatifs locaux.
 */
export async function syncAllSecrets(secrets: Map<string, SecretEntry>): Promise<void> {
  console.log("--> Synchronisation des secrets unifiés vers les applications locales...");

  // 1. apps/site/.env.local
  const siteKeys = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "SHENRON_ADMIN_TOKEN",
    "SHENRON_USER_SECRET",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_CDN_URL",
    "NEXT_PUBLIC_GTM_ID",
    "NEXT_PUBLIC_ADSENSE_CLIENT",
    "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
    "SHENRON_API_URL",
    "NEXT_PUBLIC_SHENRON_API_URL",
    "NEXT_PUBLIC_SHENRON_ASSETS_URL",
    "REDIS_URL",
    "SHENRON_MCP_URL",
    "NODE_ENV",
  ];
  const siteEnvPath = join(ROOT, "apps", "site", ".env.local");
  const siteLines = [
    "# Généré automatiquement par scripts/ops/unified-secrets.ts",
    "# Mode 0600 - Ignoré par Git",
    "",
  ];
  for (const k of siteKeys) {
    const v = secrets.get(k)?.value;
    if (v) siteLines.push(`${k}="${v}"`);
  }
  await writeFile(siteEnvPath, siteLines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(siteEnvPath, 0o600);
  } catch {}
  console.log(`✓ Synchronisé : ${siteEnvPath}`);

  // 2. apps/bot/.env
  const botKeys = [
    "DISCORD_TOKEN",
    "DISCORD_TOKEN_SHENRON",
    "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET",
    "DISCORD_PUBLIC_KEY",
    "APPLICATION_ID",
    "GUILD_ID",
    "ADDITIONAL_GUILD_IDS",
    "OWNER_ID",
    "DATABASE_PATH",
    "DATABASE_URL",
    "LOG_MESSAGE_CHANNEL_ID",
    "LOG_SANCTION_CHANNEL_ID",
    "LOG_ECONOMY_CHANNEL_ID",
    "LOG_JOIN_LEAVE_CHANNEL_ID",
    "LOG_LEVEL_ROLE_CHANNEL_ID",
    "LOG_TICKET_CHANNEL_ID",
    "MOD_NOTIFY_CHANNEL_ID",
    "COMMANDS_CHANNEL_ID",
    "ANNOUNCE_CHANNEL_ID",
    "SHENRON_AI_CHANNEL_ID",
    "ADMIN_LAB_CHANNEL_ID",
    "API_ADMIN_TOKEN",
    "API_USER_SECRET",
    "API_ENABLED",
    "API_PORT",
    "API_HOST",
    "NODE_ENV",
  ];
  const botEnvPath = join(ROOT, "apps", "bot", ".env");
  const botLines = [
    "# Généré automatiquement par scripts/ops/unified-secrets.ts",
    "# Mode 0600 - Ignoré par Git",
    "",
  ];
  for (const k of botKeys) {
    const v = secrets.get(k)?.value;
    if (v) botLines.push(`${k}="${v}"`);
  }
  await writeFile(botEnvPath, botLines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(botEnvPath, 0o600);
  } catch {}
  console.log(`✓ Synchronisé : ${botEnvPath}`);

  // 3. Export serverless
  await exportServerlessEnv(secrets);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const cmd = args[0] ?? "audit";

  const secrets = discoverUnifiedSecrets();

  switch (cmd) {
    case "audit":
      printAuditReport(secrets);
      break;
    case "export-serverless": {
      const outIdx = args.indexOf("--output") + 1;
      const out = outIdx > 0 && outIdx < args.length ? args[outIdx] : undefined;
      await exportServerlessEnv(secrets, out);
      break;
    }
    case "export-json": {
      const json = exportSecretsJson(secrets);
      console.log(JSON.stringify(json, null, 2));
      break;
    }
    case "sync-all":
      await syncAllSecrets(secrets);
      break;
    default:
      console.log(
        "Usage: bun unified-secrets.ts [audit|export-serverless|export-json|sync-all] [--output <path>]",
      );
  }
}
