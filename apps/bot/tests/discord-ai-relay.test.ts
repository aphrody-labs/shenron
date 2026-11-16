import "./setup-discord-ai";
import { afterAll, expect, mock, test } from "bun:test";
import { APHRODY_DISCORD } from "@shenron/config/discord-ai";
import { DmChatGate } from "../src/lib/dm-chat";
import { resolveDmChat } from "@shenron/config/dm-chat";

let modelOptions: Record<string, unknown> | undefined;
mock.module("../src/lib/llm", () => ({
  generateLlmGrounded: async (...args: unknown[]) => {
    modelOptions = args[4] as Record<string, unknown>;
    return { answer: "Bonjour", fallback: false };
  },
}));
mock.module("../src/lib/rag", () => ({ hybridSearch: async () => ({ results: [] }) }));
const { DirectMessageRelay } = await import("../src/events/DirectMessageRelay");
afterAll(() => mock.restore());

test("general uses bounded chat with its own history and never reads private home or memory", async () => {
  const previous = Bun.env.GUILD_ID;
  Bun.env.GUILD_ID = APHRODY_DISCORD.guildId;
  const settings = resolveDmChat({});
  let answer = "";
  const relay = Object.assign(Object.create(DirectMessageRelay.prototype), {
    dm: settings,
    gate: new DmChatGate(settings),
    dbs: { sqlite: {} },
    agentHomes: {
      forDiscordUser: () => {
        throw new Error("Private home accessed");
      },
    },
    memory: () => {
      throw new Error("Private memory accessed");
    },
    record: () => {
      throw new Error("DM archive accessed");
    },
  });
  const message = {
    guildId: APHRODY_DISCORD.guildId,
    channelId: APHRODY_DISCORD.generalChannelId,
    content: "Shenron, bonjour",
    inGuild: () => true,
    author: { id: "987654321012345678" },
    client: { user: { id: "1497194276025663680" } },
    channel: { sendTyping: async () => {} },
    reply: async (payload: { content: string }) => {
      answer = payload.content;
    },
  };
  try {
    await relay.onDirectMessage([message]);
    expect(answer).toBe("Bonjour");
    expect(modelOptions?.sessionId).toBe(
      `discord:guild:${message.guildId}:${message.channelId}:${message.author.id}`,
    );
    expect(modelOptions?.homePersona).toBeNull();
    expect(modelOptions?.memories).toBe("");
    expect(relay.gate.active).toBe(0);
  } finally {
    Bun.env.GUILD_ID = previous;
  }
});
