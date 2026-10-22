import { injectable, inject } from "tsyringe";
import { Bot, Discord, Once } from "discordx";
import type { Client } from "discord.js";
import { and, isNull, lte } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { jails } from "~/db/schema";
import { ModerationService } from "~/services/ModerationService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { CronRegistry } from "~/api/cron-registry";

/**
 * Auto-unjail. The cron query reads the database, not a timer kept in memory:
 * a sentence that ended while the bot was down is released at the first tick
 * after the restart.
 */
@Discord()
@Bot("shenron")
@injectable()
export class JailExpiryEvent {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(ModerationService) private mod: ModerationService,
    @inject(CronRegistry) private cron: CronRegistry,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
  ) {}

  @Once({ event: "clientReady" })
  async start([client]: [Client]) {
    this.cron.register({
      name: "jail-expiry",
      description: "Auto-unjail des membres dont la peine expire",
      intervalMs: 60_000,
      fn: () => this.tick(client),
    });
    // Catch up immediately on sentences that expired during the downtime.
    await this.tick(client).catch((err) =>
      logger.warn({ err }, "jail-expiry: startup tick failed"),
    );
  }

  async tick(client: Client) {
    const guild = client.guilds.cache.get(env.GUILD_ID);
    if (!guild) return;
    const expired = await this.dbs.db
      .select()
      .from(jails)
      .where(and(isNull(jails.releasedAt), lte(jails.expiresAt, new Date())));
    // One release per member, even when several rows are open.
    const seen = new Set<string>();
    for (const j of expired) {
      if (seen.has(j.userId)) continue;
      seen.add(j.userId);
      let released = false;
      try {
        released = await this.mod.unjail(guild, j.userId, client.user?.id ?? "bot", "auto-expiry");
      } catch (err) {
        logger.warn({ err, userId: j.userId }, "jail-expiry: unjail failed, retried next tick");
        continue;
      }
      // Announce only a release that happened: a failure must not repost every minute.
      if (!released) continue;
      const member = guild.members.cache.get(j.userId);
      const durationMs = j.expiresAt ? j.expiresAt.getTime() - j.createdAt.getTime() : 0;
      await this.msg
        .publish(
          "jail_expired",
          {
            user: `<@${j.userId}>`,
            userName: member?.user.username ?? j.userId,
            duration: formatSentence(durationMs),
          },
          client,
        )
        .catch((err) => logger.warn({ err }, "jail-expiry: announce failed"));
    }
  }
}

/** Sentence length with two units (`2j 3h`, `1h 30m`, `15m`). */
export function formatSentence(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
