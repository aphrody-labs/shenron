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
} from "@aphrody/discord-kit";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { env } from "./lib/env";
import { admittedGuildIds } from "./lib/guild-admission";
import { logger } from "./lib/logger";
import { DatabaseService } from "./db/index";
import { ensureWikiReplicaSchema, ensureWikiVisibility } from "./db/wiki-visibility";
import { loadRaceLevelRoles } from "./lib/race-levels";
import { loadLevelThresholds } from "./lib/level-thresholds";
import { runBootAudit } from "./lib/boot-audit";
import { installComponentEmojiGuard } from "./lib/component-emoji";
import { installMemberFetchGuard } from "./lib/guild-members";
import { executeInteractionSafely } from "./lib/safe-interaction";
import { ApiServer } from "./api/server";
import { CronRegistry } from "./api/cron-registry";
import { registerSourcePipelineJob } from "./api/source-pipeline-job";
import { registerVectorRefreshJob, VECTOR_REFRESH_JOB } from "./api/vector-refresh-job";
import { dirname, resolve } from "node:path";
import { assertRagEmbeddingSpace } from "./lib/rag";
import { existsSync } from "node:fs";
import { PERSONAS, PERSONA_IDS, type PersonaId } from "./lib/personas";

// Side-effect barrel — charge toutes les classes decorées @Discord
import "./_entries";
import { CommandPermissions } from "./guards/CommandPermissions";

// Migrations DB AVANT la création des clients (DatabaseService est singleton partagé)
const dbService = container.resolve(DatabaseService);
if (process.env.RAG_BACKEND === "bun") {
  await (await import("./lib/bun-rag")).initializeBunRag();
}
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

// Garde-fous discord.js, posés avant tout client : une seule requête opcode 8 à la fois (sinon
// GatewayRateLimitError), et un emoji de bouton invalide réparé ou retiré au lieu de faire
// rejeter le message entier par Discord.
installMemberFetchGuard();
installComponentEmojiGuard();

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

const admittedGuilds = admittedGuildIds(env.GUILD_ID, env.ADDITIONAL_GUILD_IDS);

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
  botGuilds: Array.from(admittedGuilds),
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
// Membership follows the explicit allowlist; commands retain their production guild.
// - interactionCreate : routage discordx (filtré par botIds)
// Seul Shenron déclenche l'API REST + le boot audit.
// ────────────────────────────────────────────────────────
client.once("clientReady", async () => {
  // Preserve explicitly admitted laboratory guilds across reconnects.
  for (const [gid, guild] of client.guilds.cache) {
    if (admittedGuilds.has(gid)) continue;
    logger.warn(
      { persona: "shenron", gid, name: guild.name },
      "Unapproved guild detected; leaving",
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
  if (admittedGuilds.has(guild.id)) {
    logger.info({ gid: guild.id, name: guild.name }, "Admitted guild joined; registering commands");
    await initApplicationCommandsSafe(client, {
      logger: {
        info: (msg) => logger.info(msg),
        error: (msg, ...args) => logger.error({ args }, msg),
      },
    });
    return;
  }
  logger.warn({ gid: guild.id, name: guild.name }, "Unapproved guild invitation; leaving");
  await guild.leave().catch((err) => logger.error({ err, gid: guild.id }, "guild.leave failed"));
});

client.on("interactionCreate", async (interaction) => {
  // Remplace safeExecuteInteraction du kit : son repli répondait en concurrence des collecteurs
  // de pagination (« Interaction has already been acknowledged »), cf. lib/safe-interaction.ts.
  await executeInteractionSafely(client, interaction, { logger });
});

// Arrêt propre (SIGINT/SIGTERM) par le cycle de vie du kit : les étapes s'exécutent dans
// l'ordre, une étape en échec n'empêche pas les suivantes, et une échéance globale force la
// sortie (code 1 si une étape a échoué). Chaque vidange garde son propre délai.
const DRAIN_TIMEOUT_MS = 10_000;
const vectorRefresh = await registerVectorRefreshJob(
  container.resolve(CronRegistry),
  process.env.RAG_BACKEND === "bun",
  Number(process.env.SHENRON_VECTOR_REFRESH_INTERVAL_MS),
);
const sourcePipeline = await registerSourcePipelineJob(
  container.resolve(CronRegistry),
  {
    configPath: env.SHENRON_SOURCE_PIPELINE_CONFIG,
    intervalMs: env.SHENRON_SOURCE_PIPELINE_INTERVAL_MS,
    dataRoot: dirname(resolve(env.DATABASE_PATH)),
  },
  {
    afterCycle: async () => {
      if (vectorRefresh.enabled) await container.resolve(CronRegistry).run(VECTOR_REFRESH_JOB);
    },
  },
);
void sourcePipeline.initialRun.catch(() => {
  logger.warn(
    { subsystem: "source-pipeline" },
    "Source pipeline startup failed; see private job receipt",
  );
});
registerGracefulShutdown({
  // Deux vidanges de 10 s, puis Gateway, modèle natif et bases : marge comprise.
  timeoutMs: 2 * DRAIN_TIMEOUT_MS + 5_000,
  logger: {
    info: (msg) => logger.info(msg),
    warn: (msg, ...args) => logger.warn({ args }, msg),
    error: (msg, ...args) => logger.error({ args }, msg),
  },
  steps: [
    { name: "source pipeline", action: () => sourcePipeline.stop() },
    { name: "vector refresh", action: () => vectorRefresh.stop() },
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
        (await import("@aphrody/shenron-pipeline/ai/native")).closeNativeShenronInference(),
    },
    {
      name: "Bun vector retrieval",
      action: async () => (await import("./lib/bun-rag")).closeBunRag(),
    },
    {
      name: "PostgreSQL",
      action: async () => {
        const { PgService } = await import("./db/pg");
        await container.resolve(PgService).close();
      },
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
if (env.SHENRON_DESKTOP_LOCAL) {
  container.resolve(ApiServer).start();
  logger.info("✓ Shenron local admin API started (Discord disabled)");
} else {
  try {
    await client.login(PERSONAS.shenron.token);
  } catch (err) {
    logger.fatal({ err }, "Shenron failed to start — aborting (no API REST possible)");
    process.exit(1);
  }
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
