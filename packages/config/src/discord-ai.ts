// SPDX-License-Identifier: Apache-2.0
import { envString, type EnvSource } from "./env";

export const APHRODY_DISCORD = {
  guildId: "1554189180030947338",
  generalChannelId: "1554189195201740803",
} as const;

/** Explicit deployment overrides keep other guilds isolated. */
export function resolveDiscordAi(env: EnvSource) {
  const guildId = envString(env, "GUILD_ID") ?? APHRODY_DISCORD.guildId;
  const generalChannelId =
    envString(env, "SHENRON_AI_CHANNEL_ID") ??
    (guildId === APHRODY_DISCORD.guildId ? APHRODY_DISCORD.generalChannelId : undefined);
  return {
    guildId,
    generalChannelId,
    adminChannelId: envString(env, "ADMIN_LAB_CHANNEL_ID") ?? generalChannelId,
  };
}

export interface GuildAiMessage {
  guildId: string | null;
  channelId: string;
  content: string;
  author: { bot?: boolean };
  webhookId?: string | null;
}

/** Only an explicit address to Shenron enters the shared chat engine. */
export function guildAiPrompt(message: GuildAiMessage, botId: string, env: EnvSource) {
  const settings = resolveDiscordAi(env);
  if (
    message.guildId !== settings.guildId ||
    message.channelId !== settings.generalChannelId ||
    message.author.bot ||
    message.webhookId ||
    !botId
  )
    return undefined;
  const mention = new RegExp(`<@!?${botId}>`, "g");
  if (!mention.test(message.content) && !/^shenron(?:[\s,:]|$)/i.test(message.content))
    return undefined;
  const prompt = message.content
    .replace(mention, "")
    .replace(/^shenron[\s,:]*/i, "")
    .trim();
  return prompt && !prompt.startsWith("!") ? prompt : undefined;
}
