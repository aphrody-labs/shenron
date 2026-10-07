import { describe, expect, test } from "bun:test";
import { APHRODY_DISCORD, guildAiPrompt, resolveDiscordAi } from "../src/discord-ai";

describe("Aphrody Discord migration", () => {
  const message = {
    guildId: APHRODY_DISCORD.guildId,
    channelId: APHRODY_DISCORD.generalChannelId,
    author: { bot: false },
    content: "<@123456789012345678> Bonjour",
  };
  const botId = "123456789012345678";

  test("defaults point to the verified general channel", () => {
    expect(resolveDiscordAi({})).toEqual({
      guildId: APHRODY_DISCORD.guildId,
      generalChannelId: APHRODY_DISCORD.generalChannelId,
      adminChannelId: APHRODY_DISCORD.generalChannelId,
    });
    expect(resolveDiscordAi({ GUILD_ID: "other" }).generalChannelId).toBeUndefined();
    expect(resolveDiscordAi({ GUILD_ID: "other" }).adminChannelId).toBeUndefined();
  });

  test("mentions and the Shenron prefix target only this bot", () => {
    expect(guildAiPrompt(message, botId, {})).toBe("Bonjour");
    expect(guildAiPrompt({ ...message, content: "Shenron, bonjour" }, botId, {})).toBe("bonjour");
    expect(guildAiPrompt({ ...message, content: "<@999> bonjour" }, botId, {})).toBeUndefined();
  });

  test("ordinary chatter, commands, foreign channels, bots and webhooks stay outside chat", () => {
    for (const change of [
      { content: "Bonjour tout le monde" },
      { content: "Shenron !train" },
      { guildId: "other" },
      { channelId: "other" },
      { author: { bot: true } },
      { webhookId: "hook" },
    ])
      expect(guildAiPrompt({ ...message, ...change }, botId, {})).toBeUndefined();
  });
});
