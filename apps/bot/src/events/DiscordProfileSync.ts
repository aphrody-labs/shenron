import { injectable } from "tsyringe";
import { createMonoGuildGuard, NotBot } from "@aphrody/discord-kit";
import { Bot, Discord, Guard, On, type ArgsOf } from "discordx";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { recordDiscordProfile } from "~/lib/discord-profiles";

/**
 * Keeps the persisted Discord profiles (username + avatar hash) in sync with
 * the gateway, so the public leaderboard and profile pages never build an
 * avatar URL from a hash Discord has already retired.
 *
 * discord.js emits `userUpdate` whenever a cached user changes, including the
 * user object carried by GUILD_MEMBER_UPDATE / PRESENCE_UPDATE. The
 * `guildMemberUpdate` handler covers members whose user was not cached yet.
 */
@Discord()
@Bot("shenron")
@injectable()
export class DiscordProfileSyncEvent {
  @On({ event: "userUpdate" })
  async onUserUpdate([oldUser, newUser]: ArgsOf<"userUpdate">) {
    if (newUser.partial || newUser.bot) return;
    if (
      !oldUser.partial &&
      oldUser.avatar === newUser.avatar &&
      oldUser.username === newUser.username
    ) {
      return;
    }
    try {
      await recordDiscordProfile(newUser);
    } catch (err) {
      logger.warn({ err, userId: newUser.id }, "discord profile sync (userUpdate) failed");
    }
  }

  // Serveur de production seulement, membres humains seulement.
  @On({ event: "guildMemberUpdate" })
  @Guard(createMonoGuildGuard(env.GUILD_ID), NotBot)
  async onGuildMemberUpdate([, newMember]: ArgsOf<"guildMemberUpdate">) {
    const user = newMember.user;
    if (user.partial) return;
    try {
      // Writes only when the stored username/avatar differ.
      await recordDiscordProfile(user);
    } catch (err) {
      logger.warn({ err, userId: user.id }, "discord profile sync (guildMemberUpdate) failed");
    }
  }
}
