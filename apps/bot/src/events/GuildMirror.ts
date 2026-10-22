import { createMonoGuildGuard } from "@aphrody/discord-kit";
import type { Client } from "discord.js";
import { Bot, Discord, Guard, On, Once, type ArgsOf } from "discordx";
import { inject, injectable } from "tsyringe";
import { CronRegistry } from "~/api/cron-registry";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { GuildMirrorService } from "~/services/GuildMirrorService";

const FULL_SYNC_INTERVAL_MS = 6 * 60 * 60_000;

/**
 * Keeps the SQLite guild mirror (members, roles, channels) current: one full
 * sync at startup and every 6 h, gateway events in between.
 */
@Discord()
@Bot("shenron")
@injectable()
export class GuildMirrorEvent {
  constructor(
    @inject(GuildMirrorService) private mirror: GuildMirrorService,
    @inject(CronRegistry) private cron: CronRegistry,
  ) {}

  @Once({ event: "clientReady" })
  async ready([client]: [Client]) {
    const sync = async () => {
      const guild = client.guilds.cache.get(env.GUILD_ID);
      if (!guild) return;
      await this.mirror.syncGuild(guild);
    };
    sync().catch((err) => logger.error(err as Error, "[GUILD MIRROR] startup sync failed"));
    try {
      this.cron.register({
        name: "guild-mirror",
        description: "Synchronisation complète des salons, rôles et membres vers SQLite",
        intervalMs: FULL_SYNC_INTERVAL_MS,
        fn: sync,
      });
    } catch (err) {
      logger.error(err as Error, "[GUILD MIRROR] cron registration failed");
    }
  }

  private safe(label: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      logger.warn({ err }, `[GUILD MIRROR] ${label} failed`);
    }
  }

  @On({ event: "guildMemberAdd" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onMemberAdd([member]: ArgsOf<"guildMemberAdd">) {
    this.safe("memberAdd", () => this.mirror.recordMember(member));
  }

  @On({ event: "guildMemberUpdate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onMemberUpdate([, member]: ArgsOf<"guildMemberUpdate">) {
    this.safe("memberUpdate", () => this.mirror.recordMember(member));
  }

  @On({ event: "guildMemberRemove" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onMemberRemove([member]: ArgsOf<"guildMemberRemove">) {
    this.safe("memberRemove", () => this.mirror.recordMemberLeft(member));
  }

  @On({ event: "roleCreate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onRoleCreate([role]: ArgsOf<"roleCreate">) {
    this.safe("roleCreate", () => this.mirror.recordRole(role));
  }

  @On({ event: "roleUpdate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onRoleUpdate([, role]: ArgsOf<"roleUpdate">) {
    this.safe("roleUpdate", () => this.mirror.recordRole(role));
  }

  @On({ event: "roleDelete" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onRoleDelete([role]: ArgsOf<"roleDelete">) {
    this.safe("roleDelete", () => this.mirror.store.markRoleDeleted(role.id));
  }

  @On({ event: "channelCreate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onChannelCreate([channel]: ArgsOf<"channelCreate">) {
    this.safe("channelCreate", () => this.mirror.recordChannel(channel));
  }

  @On({ event: "channelUpdate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onChannelUpdate([, channel]: ArgsOf<"channelUpdate">) {
    if (channel.isDMBased()) return;
    this.safe("channelUpdate", () => this.mirror.recordChannel(channel));
  }

  @On({ event: "channelDelete" })
  @Guard(createMonoGuildGuard(env.GUILD_ID))
  onChannelDelete([channel]: ArgsOf<"channelDelete">) {
    this.safe("channelDelete", () => this.mirror.store.markChannelDeleted(channel.id));
  }
}
