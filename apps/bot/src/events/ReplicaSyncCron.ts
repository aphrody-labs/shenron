import { Bot, Discord, Once } from "discordx";
import { inject, injectable } from "tsyringe";
import { CronRegistry } from "~/api/cron-registry";
import { DatabaseService } from "~/db/index";
import { guildSettings } from "~/db/schema";
import { logger } from "~/lib/logger";
import { EventBusService } from "~/services/EventBusService";
import { ReplicaSyncService } from "~/services/ReplicaSyncService";
import { REPLICA_SYNC_INTERVAL_MINUTES, SettingsService } from "~/services/SettingsService";

export const REPLICA_SYNC_JOB = "replica-state-sync";
/** Let the bot finish starting (gateway, caches, first writes) before the first pass. */
export const REPLICA_SYNC_STARTUP_DELAY_MS = 90_000;

/**
 * Periodic SQLite -> PostgreSQL replica of the bot's runtime state (`ReplicaSyncService`).
 *
 * Registered in the cron registry, so `/api/cron` shows its last run, duration and next run and
 * `/api/cron/replica-state-sync/trigger` forces a pass. The cadence follows the setting
 * `replica.sync.interval_minutes`, live; `replica.sync.enabled` is checked on every run. Without
 * `DATABASE_URL` nothing is registered at all.
 */
@Discord()
@Bot("shenron")
@injectable()
export class ReplicaSyncCronEvent {
  constructor(
    @inject(CronRegistry) private cron: CronRegistry,
    @inject(ReplicaSyncService) private replica: ReplicaSyncService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(EventBusService) private bus: EventBusService,
  ) {}

  @Once({ event: "clientReady" })
  async register() {
    if (!this.replica.isConfigured()) {
      logger.info("[replica] DATABASE_URL absent: PostgreSQL replica synchronisation inactive");
      return;
    }
    const intervalMs = await this.replica.intervalMs();
    this.cron.register({
      name: REPLICA_SYNC_JOB,
      description:
        "Réplica PostgreSQL : recopie incrémentale de l'état du bot (SQLite) et des journaux",
      owner: "database",
      category: "periodic",
      idempotent: true,
      intervalMs,
      fn: async () => {
        await this.replica.runPass("cron");
      },
    });
    this.bus.subscribe((event) => {
      if (event.name !== "setting:changed" && event.name !== "setting:reset") return;
      if ((event.payload as { key?: string } | null)?.key !== REPLICA_SYNC_INTERVAL_MINUTES) return;
      void this.applyCadence().catch((err) =>
        logger.warn({ err }, "[replica] could not apply the new cadence"),
      );
    });
    setTimeout(() => {
      void this.cron.run(REPLICA_SYNC_JOB);
    }, REPLICA_SYNC_STARTUP_DELAY_MS).unref?.();
    logger.info({ intervalMs }, "[replica] PostgreSQL replica synchronisation scheduled");
  }

  /**
   * Moves the job to the cadence of the setting. The registry reschedules from the override
   * `cron.<name>.interval_ms` (the same one the admin cadence endpoint writes), so the setting is
   * mirrored into it.
   */
  async applyCadence(): Promise<void> {
    const intervalMs = await this.replica.intervalMs();
    const value = String(intervalMs);
    await this.dbs.db
      .insert(guildSettings)
      .values({ key: `cron.${REPLICA_SYNC_JOB}.interval_ms`, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: guildSettings.key,
        set: { value, updatedAt: new Date() },
      });
    this.settings.invalidate();
    await this.cron.reload(REPLICA_SYNC_JOB);
  }
}
