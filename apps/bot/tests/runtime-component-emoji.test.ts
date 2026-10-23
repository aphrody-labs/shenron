import "./setup";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { join } from "node:path";

import {
  installComponentEmojiGuard,
  normalizeComponentEmoji,
  resetComponentEmojiWarnings,
} from "../src/lib/component-emoji";

const ID = "123456789012345678";

describe("normalizeComponentEmoji", () => {
  test("keeps valid unicode emoji, sequences included", () => {
    for (const emoji of ["🐉", "✏️", "⚔️", "🪨", "1️⃣", "🇫🇷", "👨‍👩‍👧", "👍🏽", "▶️"]) {
      expect(normalizeComponentEmoji(emoji)).toEqual({ name: emoji });
    }
  });

  test("repairs the production offender: a text arrow is not an emoji", () => {
    expect(normalizeComponentEmoji("←")).toEqual({ name: "⬅️" });
    expect(normalizeComponentEmoji("→")).toEqual({ name: "➡️" });
  });

  test("adds the presentation selector Discord lists on text-default pictographs", () => {
    expect(normalizeComponentEmoji("✏")).toEqual({ name: "✏️" });
    expect(normalizeComponentEmoji("⚠")).toEqual({ name: "⚠️" });
  });

  test("parses custom emoji instead of passing the markup as a name", () => {
    expect(normalizeComponentEmoji(`<:kamehameha:${ID}>`)).toEqual({
      id: ID,
      name: "kamehameha",
      animated: false,
    });
    expect(normalizeComponentEmoji(`<a:spin:${ID}>`)).toEqual({
      id: ID,
      name: "spin",
      animated: true,
    });
    expect(normalizeComponentEmoji(`kamehameha:${ID}`)).toEqual({
      id: ID,
      name: "kamehameha",
      animated: false,
    });
    expect(normalizeComponentEmoji(ID)).toEqual({ id: ID });
  });

  test("normalises emoji objects too", () => {
    expect(normalizeComponentEmoji({ name: "←" })).toEqual({ name: "⬅️" });
    expect(normalizeComponentEmoji({ id: ID, name: "spin", animated: true })).toEqual({
      id: ID,
      name: "spin",
      animated: true,
    });
    expect(normalizeComponentEmoji({ id: ID, name: "not valid!" })).toEqual({ id: ID });
  });

  test("rejects everything that cannot be an emoji", () => {
    for (const bad of [
      "",
      "   ",
      "abc",
      "x",
      "1",
      ":joy:",
      "kamehameha",
      "<:x:1>",
      `<:x:${ID}>`, // name shorter than 2 characters
      "🏪🎒", // two emoji
      "🏪 ", // fine once trimmed, checked below
      "texte 🏪",
      12345,
      null,
      undefined,
      {},
      { name: "abc" },
      { id: "12" },
      { id: 5 },
    ]) {
      if (bad === "🏪 ") continue;
      expect(normalizeComponentEmoji(bad)).toBeNull();
    }
    expect(normalizeComponentEmoji("🏪 ")).toEqual({ name: "🏪" });
  });
});

describe("builder guard", () => {
  beforeEach(() => {
    installComponentEmojiGuard();
    resetComponentEmojiWarnings();
  });

  test("is idempotent", () => {
    expect(installComponentEmojiGuard()).toBe(false);
  });

  test("the failing shop row now serialises with a valid emoji", () => {
    // The production message: four rows, the fourth one starting with the arrow button.
    const rows = [0, 1, 2].map(() =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`buy:${Math.random()}`)
          .setLabel("Acheter")
          .setStyle(ButtonStyle.Success),
      ),
    );
    const back = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("shop:open")
        .setLabel("Autre catégorie")
        .setEmoji("←")
        .setStyle(ButtonStyle.Secondary),
    );
    const json = [...rows, back].map((row) => row.toJSON());
    const emoji = (json[3]!.components[0] as { emoji?: { name?: string } }).emoji;
    expect(json).toHaveLength(4);
    expect(emoji).toEqual({ name: "⬅️" });
  });

  test("an invalid emoji is dropped, not sent", () => {
    const button = new ButtonBuilder()
      .setCustomId("x")
      .setLabel("Ok")
      .setEmoji("pas un emoji")
      .setStyle(ButtonStyle.Primary);
    expect((button.toJSON() as { emoji?: unknown }).emoji).toBeUndefined();
  });

  test("a custom emoji given as markup becomes an id", () => {
    const button = new ButtonBuilder()
      .setCustomId("x")
      .setLabel("Ok")
      .setEmoji(`<:ssj:${ID}>`)
      .setStyle(ButtonStyle.Primary);
    expect(button.toJSON()).toMatchObject({ emoji: { id: ID, name: "ssj", animated: false } });
  });

  test("select options are covered as well", () => {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel("Rayon")
      .setValue("v")
      .setEmoji("←");
    expect(option.toJSON().emoji).toEqual({ name: "⬅️" });
    const dropped = new StringSelectMenuOptionBuilder()
      .setLabel("Rayon")
      .setValue("v")
      .setEmoji("??");
    expect(dropped.toJSON().emoji).toBeUndefined();
  });
});

describe("emoji literals of the bot", () => {
  test("every static button, option and icon emoji is already valid for Discord", async () => {
    const root = join(import.meta.dir, "../src");
    const literal = /(?:setEmoji\(\s*|\bemoji:\s*|\bicon:\s*|\bgameEmoji:\s*)"([^"]+)"/g;
    const invalid: string[] = [];
    let seen = 0;
    for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: root })) {
      const text = await Bun.file(join(root, file)).text();
      for (const match of text.matchAll(literal)) {
        const value = match[1]!;
        // Identifiers and URLs share the `icon:` key: only emoji candidates are checked.
        if (/[A-Za-z]{2,}/.test(value)) continue;
        // Bullets and separators printed in text (`icon: "•"`) are not component emoji.
        if (/^[\p{P}\p{Z}]+$/u.test(value)) continue;
        seen++;
        const normalized = normalizeComponentEmoji(value);
        if (!normalized || normalized.name !== value)
          invalid.push(`${file}: ${JSON.stringify(value)}`);
      }
    }
    expect(seen).toBeGreaterThan(30);
    expect(invalid).toEqual([]);
  });
});
