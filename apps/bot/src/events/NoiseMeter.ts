// SPDX-License-Identifier: Apache-2.0
import { Bot, Discord, On, type ArgsOf } from "discordx";
import { inject, injectable } from "tsyringe";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { SettingsService } from "~/services/SettingsService";
import {
  CHANNEL_KIND_KEYS,
  botNoiseMeter,
  classifyBotMessage,
  jsonFileNoiseStore,
  noiseStorePath,
  type NoiseKind,
} from "~/ui/noise-meter";

/** The channel settings fall back to these variables when unset (as the message templates do). */
const ENV_CHANNELS: Record<string, string | undefined> = {
  "channel.announce": env.ANNOUNCE_CHANNEL_ID,
  "channel.achievement": env.ACHIEVEMENT_CHANNEL_ID ?? env.ANNOUNCE_CHANNEL_ID,
  "channel.level": env.LEVEL_CHANNEL_ID ?? env.ANNOUNCE_CHANNEL_ID,
  "channel.welcome": env.LOG_JOIN_LEAVE_CHANNEL_ID,
  "channel.farewell": env.LOG_JOIN_LEAVE_CHANNEL_ID,
  "channel.giveaway": env.ANNOUNCE_CHANNEL_ID,
  "channel.zeni": env.LOG_ECONOMY_CHANNEL_ID ?? env.ANNOUNCE_CHANNEL_ID,
};

const KINDS_TTL_MS = 5 * 60_000;

/**
 * Counts the public messages the bot posts in the guild, per channel and per kind: the noise
 * meter of the redesign (`ui/noise-meter.ts`). Aggregated in memory, flushed to a small file
 * every minute; one message never costs a database write. The counters are read by the admin API
 * (`GET /api/health/noise`).
 */
@Discord()
@Bot("shenron")
@injectable()
export class NoiseMeterEvent {
  private channelKinds = new Map<string, NoiseKind>();
  private kindsAt = 0;
  private started: Promise<void> | undefined;

  constructor(@inject(SettingsService) private settings: SettingsService) {}

  @On({ event: "messageCreate" })
  async onMessage([message]: ArgsOf<"messageCreate">) {
    try {
      // Only the bot's own messages in a guild: DMs are private, ephemeral replies never arrive.
      if (!message.guildId || message.author.id !== message.client.user?.id) return;
      await this.start();
      // A settings read failure only costs the channel kind: the message is still counted.
      await this.refreshKinds().catch((err) => logger.debug({ err }, "noise meter kinds failed"));
      botNoiseMeter.record({
        channelId: message.channelId,
        kind: classifyBotMessage(message, this.channelKinds),
      });
    } catch (err) {
      logger.debug({ err }, "noise meter record failed");
    }
  }

  /** Restores the persisted counters and starts the periodic flush, once. */
  private start(): Promise<void> {
    this.started ??= (async () => {
      botNoiseMeter.attach(jsonFileNoiseStore(noiseStorePath(env.DATABASE_PATH)));
      await botNoiseMeter.load().catch((err) => logger.warn({ err }, "noise meter load failed"));
      botNoiseMeter.startFlushing(60_000, (err) =>
        logger.warn({ err }, "noise meter flush failed"),
      );
    })();
    return this.started;
  }

  private async refreshKinds(): Promise<void> {
    const now = Date.now();
    if (now - this.kindsAt < KINDS_TTL_MS) return;
    this.kindsAt = now;
    const next = new Map<string, NoiseKind>();
    for (const [key, kind] of CHANNEL_KIND_KEYS) {
      const id = (await this.settings.getSnowflake(key)) ?? ENV_CHANNELS[key];
      if (id && !next.has(id)) next.set(id, kind);
    }
    this.channelKinds = next;
  }
}
