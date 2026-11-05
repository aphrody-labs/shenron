// SPDX-License-Identifier: Apache-2.0
import { envString, type EnvSource } from "./env";

export const APHRODY_DISCORD = {
  guildId: "1554189180030947338",
  startHereChannelId: "1557354118710829117",
  labStatusChannelId: "1557354121869131846",
  assistantChannelId: "1557354124318736426",
  experimentsChannelId: "1557354126365556798",
  promptsChannelId: "1557354132543766569",
  evaluationsChannelId: "1557354135257350209",
  modelRegistryChannelId: "1557354138629709925",
  trainingJobsChannelId: "1557354140076605530",
  datasetsChannelId: "1557354141515255929",
  adminConsoleChannelId: "1557354144149405806",
  opsAlertsChannelId: "1557354148637315212",
  driveChannelId: "1557358565155676210",
  chatChannelId: "1557358568523571225",
  debateChannelId: "1557364553283543161",
  generalChannelId: "1557354118710829117",
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

/** Returns true if the message is in an allowed channel for Shenron chat interactions. */
export function isAllowedAiChannel(
  message: GuildAiMessage,
  settings: ReturnType<typeof resolveDiscordAi>,
): boolean {
  if (message.guildId === APHRODY_DISCORD.guildId) {
    return (
      message.channelId === APHRODY_DISCORD.startHereChannelId ||
      message.channelId === APHRODY_DISCORD.assistantChannelId ||
      message.channelId === APHRODY_DISCORD.chatChannelId ||
      message.channelId === settings.generalChannelId
    );
  }
  return Boolean(settings.generalChannelId && message.channelId === settings.generalChannelId);
}

/** Returns true if the guild is either primary or explicitly admitted. */
export function isAdmittedGuild(guildId: string | null | undefined, env: EnvSource): boolean {
  if (!guildId) return false;
  const primary = envString(env, "GUILD_ID") ?? APHRODY_DISCORD.guildId;
  if (guildId === primary || guildId === APHRODY_DISCORD.guildId) return true;
  const additional = (envString(env, "ADDITIONAL_GUILD_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return additional.includes(guildId);
}

/** Only an explicit address to Shenron enters the shared chat engine. */
export function guildAiPrompt(message: GuildAiMessage, botId: string, env: EnvSource) {
  const settings = resolveDiscordAi(env);
  const admitted = isAdmittedGuild(message.guildId, env);
  if (
    !admitted ||
    !isAllowedAiChannel(message, settings) ||
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
