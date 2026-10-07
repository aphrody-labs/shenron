// SPDX-License-Identifier: Apache-2.0
import { injectable, inject } from "tsyringe";
import { Bot, Discord, Once, Client } from "discordx";
import { CronRegistry } from "~/api/cron-registry";
import { logger } from "~/lib/logger";
import { APHRODY_DISCORD } from "@shenron/config/discord-ai";
import { initApplicationCommandsSafe } from "@aphrody/discord-kit";

/**
 * LabSyncCron — Cron périodique de synchronisation et télémétrie des commandes
 * pour le laboratoire IA Aphrody (1554189180030947338).
 */
@Discord()
@Bot("shenron")
@injectable()
export class LabSyncCronEvent {
  constructor(
    @inject(CronRegistry) private cron: CronRegistry,
    @inject(Client) private client: Client,
  ) {}

  @Once({ event: "clientReady" })
  register() {
    // Intervalle par défaut : toutes les 30 minutes
    const THIRTY_MINUTES_MS = 30 * 60_000;

    this.cron.register({
      name: "lab-guild-sync",
      description: "Synchronisation périodique des commandes et état du laboratoire IA Aphrody",
      intervalMs: THIRTY_MINUTES_MS,
      fn: async () => {
        const labGuild = this.client.guilds.cache.get(APHRODY_DISCORD.guildId);
        if (!labGuild) {
          logger.debug(
            { guildId: APHRODY_DISCORD.guildId },
            "[LabSyncCron] Guilde Aphrody non présente dans le cache — attente d'invitation",
          );
          return;
        }

        logger.info(
          { guildId: labGuild.id, memberCount: labGuild.memberCount },
          "[LabSyncCron] Synchronisation des commandes sur le laboratoire Aphrody...",
        );

        try {
          await initApplicationCommandsSafe(this.client, {
            logger: {
              info: (msg) => logger.info(msg),
              error: (msg, ...args) => logger.error({ args }, msg),
            },
          });
        } catch (err) {
          logger.warn({ err }, "[LabSyncCron] Échec de synchronisation des commandes");
        }
      },
    });
  }
}
