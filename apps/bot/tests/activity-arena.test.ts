// SPDX-License-Identifier: Apache-2.0
/**
 * `/arena` and the Primary Entry Point handler: the launch is closed (ephemeral "coming soon")
 * until the Activity is enabled, needs a voice channel in a guild, and a launch Discord refuses
 * gets the same "coming soon" answer. All texts come from the dictionaries (`arena.*`).
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { MessageFlags } from "discord.js";
import { MetadataStorage } from "discordx";
import en from "../src/locales/en.json";
import fr from "../src/locales/fr.json";
import ja from "../src/locales/ja.json";
import { t } from "../src/lib/i18n";

const { ARENA_LAUNCH_SETTING, ArenaCommand, launchArena } =
  await import("../src/commands/games/Arena");

interface FakeOptions {
  locale?: string;
  inGuild?: boolean;
  voiceChannelId?: string | null;
  launch?: () => Promise<undefined>;
}

function fake(options: FakeOptions = {}) {
  const inGuild = options.inGuild ?? true;
  const voice = new Map<string, { channelId: string | null }>();
  if (options.voiceChannelId !== null)
    voice.set("42", { channelId: options.voiceChannelId ?? "voice-1" });
  const replies: Array<{ flags: number; components: Array<{ toJSON(): unknown }> }> = [];
  const interaction = {
    locale: options.locale ?? "en-US",
    user: { id: "42" },
    guildId: inGuild ? "guild-1" : null,
    guild: inGuild ? { voiceStates: { cache: voice } } : null,
    replied: false,
    deferred: false,
    reply: mock(async (payload: (typeof replies)[number]) => {
      replies.push(payload);
    }),
    launchActivity: mock(options.launch ?? (async () => undefined)),
    isPrimaryEntryPointCommand: () => true,
  };
  return { interaction: interaction as never, raw: interaction, replies };
}

const settings = (enabled: boolean) => ({
  getBool: mock(async (key: string, fallback: boolean) =>
    key === ARENA_LAUNCH_SETTING ? enabled : fallback,
  ),
});

const textOf = (reply: { components: Array<{ toJSON(): unknown }> }) =>
  JSON.stringify(reply.components.map((component) => component.toJSON()));

describe("/arena without an Activity yet", () => {
  test("is closed by default: an ephemeral Components V2 answer, no launch", async () => {
    const { interaction, raw, replies } = fake();
    const outcome = await launchArena(interaction, { settings: settings(false) });
    expect(outcome).toBe("soon");
    expect(raw.launchActivity).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    const [answer] = replies;
    expect(answer!.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(answer!.flags & MessageFlags.IsComponentsV2).toBeTruthy();
    expect(textOf(answer!)).toContain(t("en", "arena.soon.title"));
    expect(textOf(answer!)).toContain(t("en", "arena.soon.body"));
  });

  test("answers in the language of the member's Discord client", async () => {
    for (const [locale, lang] of [
      ["fr", "fr"],
      ["ja", "ja"],
      ["de", "fr"],
    ] as const) {
      const { interaction, replies } = fake({ locale });
      await launchArena(interaction, { settings: settings(false) });
      expect(textOf(replies[0]!)).toContain(t(lang, "arena.soon.title"));
    }
    expect(t("fr", "arena.soon.title")).not.toBe(t("en", "arena.soon.title"));
    expect(t("ja", "arena.soon.title")).not.toBe(t("en", "arena.soon.title"));
  });

  test("a launch Discord refuses (no Activity configured, app not verified) is the same answer", async () => {
    const { interaction, raw, replies } = fake({
      launch: async () => {
        throw new Error("Unknown Application Command");
      },
    });
    expect(await launchArena(interaction, { settings: settings(true) })).toBe("soon");
    expect(raw.launchActivity).toHaveBeenCalledTimes(1);
    expect(textOf(replies[0]!)).toContain(t("en", "arena.soon.title"));
  });
});

describe("/arena once the Activity is enabled", () => {
  test("launches the Activity for a member in a voice channel, with nothing else to say", async () => {
    const { interaction, raw, replies } = fake();
    expect(await launchArena(interaction, { settings: settings(true) })).toBe("launched");
    expect(raw.launchActivity).toHaveBeenCalledTimes(1);
    expect(replies).toHaveLength(0);
  });

  test("asks a member who is in no voice channel to join one first", async () => {
    // No voice state at all.
    const absent = fake({ voiceChannelId: null });
    expect(await launchArena(absent.interaction, { settings: settings(true) })).toBe(
      "voice_required",
    );
    expect(absent.raw.launchActivity).not.toHaveBeenCalled();
    expect(textOf(absent.replies[0]!)).toContain(t("en", "arena.voice.required"));
    expect(absent.replies[0]!.flags & MessageFlags.Ephemeral).toBeTruthy();
    // A voice state that left its channel.
    const left = fake();
    left.raw.guild!.voiceStates.cache.set("42", { channelId: null });
    expect(await launchArena(left.interaction, { settings: settings(true) })).toBe(
      "voice_required",
    );
    expect(left.raw.launchActivity).not.toHaveBeenCalled();
  });

  test("the entry point works from a DM, where there is no voice channel to check", async () => {
    const { interaction, raw } = fake({ inGuild: false });
    expect(await launchArena(interaction, { settings: settings(true) })).toBe("launched");
    expect(raw.launchActivity).toHaveBeenCalledTimes(1);
  });
});

describe("Primary Entry Point handler", () => {
  test("routes an entry point interaction to the launch, and ignores anything else", async () => {
    const command = new ArenaCommand(settings(true) as never);
    const entry = fake();
    await command.onEntryPoint([entry.interaction] as never);
    expect(entry.raw.launchActivity).toHaveBeenCalledTimes(1);

    const other = fake();
    other.raw.isPrimaryEntryPointCommand = () => false;
    await command.onEntryPoint([other.interaction] as never);
    expect(other.raw.launchActivity).not.toHaveBeenCalled();
  });

  test("a closed Activity answers 'coming soon' on the entry point too", async () => {
    const command = new ArenaCommand(settings(false) as never);
    const entry = fake();
    await command.onEntryPoint([entry.interaction] as never);
    expect(entry.raw.launchActivity).not.toHaveBeenCalled();
    expect(textOf(entry.replies[0]!)).toContain(t("en", "arena.soon.title"));
  });
});

describe("command declaration and dictionaries", () => {
  test("the command is named in English with French and Japanese localizations", () => {
    const slash = MetadataStorage.instance.applicationCommandSlashes.find(
      (command) => command.name === "arena",
    );
    expect(slash).toBeDefined();
    expect(slash!.nameLocalizations).toEqual({ fr: "arene", ja: "アリーナ" });
    expect(slash!.description).toBe(en.arena.command.description);
    expect(slash!.descriptionLocalizations).toEqual({
      fr: fr.arena.command.description,
      ja: ja.arena.command.description,
    });
  });

  test("localized names satisfy Discord's rule (lower case, letters and digits, 1 to 32)", () => {
    for (const lang of [en, fr, ja]) {
      const name = lang.arena.command.name;
      expect(name).toMatch(/^[-_'\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u);
      expect(name).toBe(name.toLowerCase());
    }
    expect(en.arena.command.description.length).toBeLessThanOrEqual(100);
    expect(fr.arena.command.description.length).toBeLessThanOrEqual(100);
    expect(ja.arena.command.description.length).toBeLessThanOrEqual(100);
  });

  test("fr, en and ja define the same arena keys", () => {
    const keys = (value: unknown, prefix = ""): string[] =>
      Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) =>
        typeof inner === "string" ? [`${prefix}${key}`] : keys(inner, `${prefix}${key}.`),
      );
    expect(keys(en.arena).toSorted()).toEqual(keys(fr.arena).toSorted());
    expect(keys(ja.arena).toSorted()).toEqual(keys(fr.arena).toSorted());
    expect(keys(fr.arena).length).toBeGreaterThanOrEqual(4);
  });
});
