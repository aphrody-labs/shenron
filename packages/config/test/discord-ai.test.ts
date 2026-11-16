import { describe, expect, test } from "bun:test";
import { SHENRON_DISCORD, guildAiPrompt, resolveDiscordAi } from "../src/discord-ai";

describe("Aphrody Discord migration", () => {
  const message = {
    guildId: SHENRON_DISCORD.guildId,
    channelId: SHENRON_DISCORD.generalChannelId,
    author: { bot: false },
    content: "<@123456789012345678> Bonjour",
  };
  const botId = "123456789012345678";

  test("defaults point to the verified general channel", () => {
    expect(resolveDiscordAi({})).toEqual({
      guildId: SHENRON_DISCORD.guildId,
      generalChannelId: SHENRON_DISCORD.generalChannelId,
      adminChannelId: SHENRON_DISCORD.generalChannelId,
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

  test("accepts messages across admitted multi-guild setup in Aphrody lab channels", () => {
    const multiGuildEnv = {
      GUILD_ID: "934894610545770506",
      ADDITIONAL_GUILD_IDS: SHENRON_DISCORD.guildId,
    };
    // Message in start-here
    expect(guildAiPrompt(message, botId, multiGuildEnv)).toBe("Bonjour");

    // Message in assistant channel
    expect(
      guildAiPrompt(
        { ...message, channelId: SHENRON_DISCORD.assistantChannelId },
        botId,
        multiGuildEnv,
      ),
    ).toBe("Bonjour");

    // Message in chat channel
    expect(
      guildAiPrompt({ ...message, channelId: SHENRON_DISCORD.chatChannelId }, botId, multiGuildEnv),
    ).toBe("Bonjour");
  });
});
