import "reflect-metadata";
import { container } from "tsyringe";
import { Client, DIService } from "discordx";
import { tsyringeDependencyRegistryEngine } from "@discordx/di";

DIService.engine = tsyringeDependencyRegistryEngine.setInjector(container);

import { Partials } from "discord.js";
import {
  createProductionCacheOptions,
  initApplicationCommandsSafe,
  registerGracefulShutdown,
  resolveGrantedIntents,
  safeExecuteInteraction,
} from "@aphrody/discord-kit";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { DatabaseService } from "./db/index";
import { ensureWikiReplicaSchema, ensureWikiVisibility } from "./db/wiki-visibility";
import { loadRaceLevelRoles } from "./lib/race-levels";
import { loadLevelThresholds } from "./lib/level-thresholds";
import { runBootAudit } from "./lib/boot-audit";
import { ApiServer } from "./api/server";
import { CronRegistry } from "./api/cron-registry";
import { assertRagEmbeddingSpace } from "./lib/rag";
import { existsSync } from "node:fs";
import { PERSONAS, PERSONA_IDS, type PersonaId } from "./lib/personas";

// Side-effect barrel — charge toutes les classes decorées @Discord
import "./_entries";
import { CommandPermissions } from "./guards/CommandPermissions";

// Migrations DB AVANT la création des clients (DatabaseService est singleton partagé)
const dbService = container.resolve(DatabaseService);
if (existsSync("./src/db/migrations")) {
  try {
    migrate(dbService.db, { migrationsFolder: "./src/db/migrations" });
    logger.info("✓ DB migrations applied");
  } catch (err) {
    logger.warn({ err }, "DB migration step skipped (first run?)");
  }
}
// Visibilité éditoriale du réplica wiki (SH-P0-004) : les migrations viennent
// de créer les tables d'une base neuve, la colonne `visible` doit les suivre.
ensureWikiReplicaSchema(dbService.sqlite);
const visibilityAdded = ensureWikiVisibility(dbService.sqlite);
if (visibilityAdded.length > 0) {
  logger.info({ tables: visibilityAdded }, "✓ wiki replica visibility column added");
}

// Espace d'embedding (contrat aphrody-infra `indexes.shenron-rag`) : un modèle ou
// une dimension configurés qui diffèrent de l'index sont une erreur fatale, jamais
// un mélange silencieux d'espaces vectoriels.
try {
  const space = assertRagEmbeddingSpace(dbService.sqlite);
  logger.info(
    { model: space.model, dimensions: space.dimensions },
    "✓ RAG embedding space matches the index",
  );
} catch (err) {
  logger.fatal({ err }, "RAG embedding space mismatch: refusing to start");
  process.exit(1);
}

// Hydrate le cache des rôles de palier PAR RACE depuis la DB (seed depuis
// RACE_LEVEL_ROLES si la table est vide) — APRÈS les migrations, AVANT tout
// level-up/sync de rôles (LevelService lit ce cache de façon synchrone).
try {
  loadRaceLevelRoles(dbService.db);
  logger.info("✓ race level roles loaded");
} catch (err) {
  logger.warn({ err }, "race level roles load skipped (first run?)");
}

// Hydrate la COURBE DE NIVEAUX éditable (guild_settings.xp.thresholds) — défaut
// en dur si absente. Lue par levelForXP/xpProgress (hot-path, synchrone).
try {
  loadLevelThresholds(dbService.db);
  logger.info("✓ level thresholds loaded");
} catch (err) {
  logger.warn({ err }, "level thresholds load skipped (first run?)");
}

// Un seul client Gateway : les anciens noms de personas restent des alias
// pour l'API et le dashboard, mais ne créent plus de connexions ni de caches.
const desiredIntents = [...new Set(Object.values(PERSONAS).flatMap((p) => p.intents))];
const intents = PERSONAS.shenron.token
  ? await resolveGrantedIntents(PERSONAS.shenron.token, {
      desiredIntents,
      logger: {
        warn: (msg) => logger.warn(msg),
        error: (msg) => logger.error(msg),
      },
    })
  : desiredIntents;

const client = new Client({
  botId: "shenron",
  intents,
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember,
    Partials.User,
    Partials.Reaction,
  ],
  silent: env.NODE_ENV === "production",
  botGuilds: [env.GUILD_ID],
  guards: [CommandPermissions],
  ...createProductionCacheOptions(),
});
const clients = new Map<PersonaId, Client>(PERSONA_IDS.map((id) => [id, client]));

// Shenron est le client "principal" — exposé en singleton pour DI
// (LogService, MessageTemplateService, StatsService, ApiServer le résolvent
// implicitement via @inject(Client)).
const shenron = client;
container.registerInstance(Client, shenron);
container.register("ClientMap", { useValue: clients });

// ────────────────────────────────────────────────────────
// Wiring identique pour tous les clients :
// - clientReady : mono-guild lock + initApplicationCommands
// - guildCreate : leave instantané si invité hors GUILD_ID
// - interactionCreate : routage discordx (filtré par botIds)
// Seul Shenron déclenche l'API REST + le boot audit.
// ────────────────────────────────────────────────────────
client.once("clientReady", async () => {
  // Mono-guild forcé sur chaque persona
  for (const [gid, guild] of client.guilds.cache) {
    if (gid === env.GUILD_ID) continue;
    logger.warn(
      { persona: "shenron", gid, name: guild.name },
      "guild non-prod détectée, leave en cours",
    );
    await guild.leave().catch((err) => logger.error({ err, gid }, "guild.leave failed"));
  }

  await initApplicationCommandsSafe(client, {
    logger: {
      info: (msg) => logger.info(msg),
      error: (msg, ...args) => logger.error({ args }, msg),
    },
  });
  logger.info(`✓ Shenron connecté en tant que ${client.user?.username}`);
  await runBootAudit(client).catch((err) => logger.error({ err }, "boot-audit failed"));
  try {
    container.resolve(ApiServer).start();
  } catch (err) {
    logger.error({ err }, "ApiServer start failed");
  }
});

client.on("guildCreate", async (guild) => {
  if (guild.id === env.GUILD_ID) return;
  logger.warn({ gid: guild.id, name: guild.name }, "guild non-prod invitée, leave instantané");
  await guild.leave().catch((err) => logger.error({ err, gid: guild.id }, "guild.leave failed"));
});

client.on("interactionCreate", async (interaction) => {
  await safeExecuteInteraction(client, interaction, {
    logger: {
      error: (msg, ...args) => logger.error({ args }, msg),
      warn: (msg, ...args) => logger.warn({ args }, msg),
    },
  });
});

// Arrêt propre (SIGINT/SIGTERM) par le cycle de vie du kit : les étapes s'exécutent dans
// l'ordre, une étape en échec n'empêche pas les suivantes, et une échéance globale force la
// sortie (code 1 si une étape a échoué). Chaque vidange garde son propre délai.
const DRAIN_TIMEOUT_MS = 10_000;
registerGracefulShutdown({
  // Deux vidanges de 10 s, puis Gateway, modèle natif et bases : marge comprise.
  timeoutMs: 2 * DRAIN_TIMEOUT_MS + 5_000,
  logger: {
    info: (msg) => logger.info(msg),
    warn: (msg, ...args) => logger.warn({ args }, msg),
    error: (msg, ...args) => logger.error({ args }, msg),
  },
  steps: [
    {
      // Minuteries effacées, tâches actives attendues.
      name: "cron registry",
      action: async () => {
        const drain = await container.resolve(CronRegistry).drain(DRAIN_TIMEOUT_MS);
        if (!drain.drained) {
          logger.warn({ pending: drain.pending }, "Cron drain timed out during shutdown");
        }
      },
    },
    {
      // Plus d'écoute, requêtes en vol attendues.
      name: "API server",
      action: async () => {
        const drain = await container.resolve(ApiServer).drain(DRAIN_TIMEOUT_MS);
        if (!drain.drained) {
          logger.warn(
            { pendingRequests: drain.pendingRequests },
            "API server drain timed out during shutdown",
          );
        }
      },
    },
    // Gateway fermée avant le modèle natif et les bases : plus aucun événement ne les atteint.
    { name: "Discord Gateway", action: () => client.destroy() },
    {
      name: "native inference",
      action: async () =>
        (await import("@shenron/pipeline/ai/native")).closeNativeShenronInference(),
    },
    { name: "databases", action: () => dbService.close() },
  ],
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

// Login : Shenron en premier (ApiServer dépend de son clientReady),
// les 5 autres en parallèle (Discord rate-limit identify est par-token, pas global)
// → boot ~10 s → ~2-3 s.
// Non-bloquant : si un persona échoue (privileged intents, token révoqué…),
// on log et on continue avec les autres. Shenron reste obligatoire.
try {
  await client.login(PERSONAS.shenron.token);
} catch (err) {
  logger.fatal({ err }, "Shenron failed to start — aborting (no API REST possible)");
  process.exit(1);
}

// ── Auto-seed wiki si DB vide (self-healing après perte bot.db) ─────────
// Enregistré comme tâche de démarrage avec suivi des métriques et idempotence.
const cron = container.resolve(CronRegistry);
cron.registerStartupJob({
  name: "wiki-auto-seed",
  owner: "wiki",
  description: "Auto-seed wiki si DB vide (self-healing après perte bot.db)",
  idempotent: true,
  duplicateBehavior: "skip",
  fn: async () => {
    const { runWikiSeed } = await import("~/db/seed-wiki");
    const result = await runWikiSeed({
      log: (m) => logger.info({ subsystem: "wiki-seed" }, m),
    });
    if (!result.skipped) {
      logger.info(
        {
          planets: result.planets,
          characters: result.characters,
          transformations: result.transformations,
        },
        "wiki auto-seeded on boot",
      );
    }
  },
});

void cron.run("wiki-auto-seed").catch((err) => {
  logger.warn({ err }, "wiki auto-seed failed (non-fatal)");
});
