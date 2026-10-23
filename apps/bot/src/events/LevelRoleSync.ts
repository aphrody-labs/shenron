import { injectable, inject } from "tsyringe";
import { Bot, Discord, Once } from "discordx";
import type { Client } from "discord.js";
import { CronRegistry } from "~/api/cron-registry";
import { LevelService } from "~/services/LevelService";
import { SettingsService } from "~/services/SettingsService";
import { logger } from "~/lib/logger";
import { env } from "~/lib/env";

/** Intervalle par défaut : toutes les 6 h (override via `cron.level-role-reconcile.interval_ms`). */
const DEFAULT_INTERVAL_MS = 6 * 3_600_000;

/**
 * Setting (boolean, absent = false) that lets the pass REMOVE excess tier roles (above the
 * level, or from another race). Without it the pass grants the due tiers and only counts
 * what exceeds.
 */
export const LEVEL_ROLE_STRIP_KEY = "level_role_sync.strip";

/**
 * Periodically checks that every member holds the tier roles matching their race and level
 * (XP in database). Never removes a tier without the explicit {@link LEVEL_ROLE_STRIP_KEY}
 * setting.
 */
@Discord()
@Bot("shenron")
@injectable()
export class LevelRoleSyncEvent {
  constructor(
    @inject(CronRegistry) private cron: CronRegistry,
    @inject(LevelService) private levels: LevelService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  @Once({ event: "clientReady" })
  async onReady([client]: [Client]) {
    this.cron.register({
      name: "level-role-reconcile",
      description:
        "Vérifie que chaque membre a les rôles de palier correspondant à sa race et son niveau",
      intervalMs: DEFAULT_INTERVAL_MS,
      fn: () => this.reconcileAll(client),
    });
    // Rattrapage immédiat au boot (ex. après refonte des échelles).
    void this.reconcileAll(client).catch((err) =>
      logger.warn({ err }, "level-role-reconcile boot run failed"),
    );
  }

  private async reconcileAll(client: Client) {
    if (!(await this.settings.getBool("features.level_role_sync", true))) return;

    // La guilde configurée d'abord : `first()` seul pouvait viser un autre serveur.
    const guild = client.guilds.cache.get(env.GUILD_ID) ?? client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch().catch(() => null);
    const strip = await this.settings.getBool(LEVEL_ROLE_STRIP_KEY, false);
    const stats = await this.levels.reconcileAllRaceLevelRoles(guild, { strip });
    logger.info(stats, "level-role-reconcile completed");
    if (stats.excessMembers > 0 && stats.mode === "report") {
      logger.warn(
        {
          excessMembers: stats.excessMembers,
          excessRoles: stats.excessRoles,
          aborted: stats.aborted,
        },
        `level-role-reconcile: tier roles above level or from another race — set ${LEVEL_ROLE_STRIP_KEY}=true to remove them`,
      );
    }
  }
}
