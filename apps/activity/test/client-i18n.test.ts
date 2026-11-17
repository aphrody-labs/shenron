// SPDX-License-Identifier: Apache-2.0
/** The client dictionaries: parity fr/en/ja, every key used exists, no visible text in components. */
import { describe, expect, test } from "bun:test";
import { placeholders } from "@aphrody/shenron-activity/i18n";
import {
  ERROR_CODES,
  CLOSE_REASONS,
  KICK_REASONS,
  QUIZ_CATEGORIES,
  REWARD_REASONS,
  LOCALES,
} from "@aphrody/shenron-activity/protocol";
import { Glob } from "bun";
import { join } from "node:path";
import {
  categoryLabel,
  closeLabel,
  errorLabel,
  formatNumber,
  kickLabel,
  resolveLocale,
  rewardLabel,
  translator,
  ui,
  UI_DICTIONARIES,
  type UiKey,
} from "../client/i18n";

const keys = Object.keys(UI_DICTIONARIES.fr) as UiKey[];
const CLIENT = join(import.meta.dir, "..", "client");
const SAME_ALLOWED_JA = new Set<UiKey>([]);

describe("client dictionaries", () => {
  test("fr, en and ja have exactly the same keys", () => {
    const reference = Object.keys(UI_DICTIONARIES.fr).toSorted();
    expect(Object.keys(UI_DICTIONARIES.en).toSorted()).toEqual(reference);
    expect(Object.keys(UI_DICTIONARIES.ja).toSorted()).toEqual(reference);
  });

  test("no empty value, same placeholders in every language", () => {
    for (const key of keys) {
      for (const locale of LOCALES) expect(UI_DICTIONARIES[locale][key].trim()).not.toBe("");
      const reference = placeholders(UI_DICTIONARIES.fr[key]).toSorted();
      expect(placeholders(UI_DICTIONARIES.en[key]).toSorted()).toEqual(reference);
      expect(placeholders(UI_DICTIONARIES.ja[key]).toSorted()).toEqual(reference);
    }
  });

  test("the Japanese is a translation, not a copy of the French or English text", () => {
    // Units that read the same in French and English; Japanese must always differ.
    const SAME_ALLOWED = new Set<UiKey>(["score.points", "round.seconds", "round.points"]);
    for (const key of keys) {
      if (SAME_ALLOWED.has(key)) continue;
      expect(UI_DICTIONARIES.ja[key]).not.toBe(UI_DICTIONARIES.fr[key]);
      expect(UI_DICTIONARIES.ja[key]).not.toBe(UI_DICTIONARIES.en[key]);
    }
  });

  test("Japanese text is Japanese, not Latin", () => {
    for (const key of keys) {
      if (SAME_ALLOWED_JA.has(key)) continue;
      expect(UI_DICTIONARIES.ja[key]).toMatch(/[぀-ヿ一-鿿]/);
    }
  });

  test("interpolation fills every placeholder and refuses a missing parameter", () => {
    expect(ui("fr", "round.counter", { index: "3", total: "8" })).toBe("Question 3 sur 8");
    expect(ui("en", "round.counter", { index: "3", total: "8" })).toBe("Question 3 of 8");
    expect(ui("ja", "round.counter", { index: "3", total: "8" })).toBe("第3問 / 全8問");
    expect(() => ui("fr", "round.counter", { index: "3" })).toThrow();
    expect(translator("en")("lobby.start")).toBe("Start the round");
  });

  test("the labels shared with the bot cover every code the server can send", () => {
    for (const locale of LOCALES) {
      for (const code of ERROR_CODES) expect(errorLabel(locale, code)).not.toBe("");
      for (const reason of KICK_REASONS) expect(kickLabel(locale, reason)).not.toBe("");
      for (const reason of CLOSE_REASONS) expect(closeLabel(locale, reason)).not.toBe("");
      for (const reason of REWARD_REASONS) expect(rewardLabel(locale, reason)).not.toBe("");
      for (const category of QUIZ_CATEGORIES) expect(categoryLabel(locale, category)).not.toBe("");
    }
  });

  test("Discord locales map to a supported language; others read English", () => {
    expect(resolveLocale("fr")).toBe("fr");
    expect(resolveLocale("fr-CA")).toBe("fr");
    expect(resolveLocale("ja")).toBe("ja");
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("pt-BR")).toBe("en");
    expect(resolveLocale("zh-TW")).toBe("en");
    expect(resolveLocale("")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
    expect(resolveLocale("FR_fr")).toBe("fr");
  });

  test("numbers follow the language", () => {
    expect(formatNumber("fr", 3941)).toMatch(/^3\s941$/u);
    expect(formatNumber("en", 3941)).toBe("3,941");
  });
});

describe("components", () => {
  const files = [...new Glob("**/*.tsx").scanSync({ cwd: CLIENT })].map((file) =>
    join(CLIENT, file),
  );
  const sources = files.map((file) => ({
    file,
    text: require("node:fs").readFileSync(file, "utf8") as string,
  }));

  test("every dictionary key used by a component exists", () => {
    const used = new Set<string>();
    for (const { text } of sources)
      for (const match of text.matchAll(/\bt\(\s*"([a-z][A-Za-z.]*)"/g)) used.add(match[1]!);
    expect(used.size).toBeGreaterThan(30);
    for (const key of used) expect(Object.keys(UI_DICTIONARIES.fr)).toContain(key);
  });

  test("every key of the dictionary is used somewhere (no dead text)", () => {
    const all = sources.map((source) => source.text).join("\n");
    for (const key of keys) {
      if (key.startsWith("announce.") || key.startsWith("boot.") || key.startsWith("fail."))
        continue; // built from a variable (phase, step, failure kind)
      expect(all.includes(`"${key}"`)).toBe(true);
    }
  });

  test("no visible text is written in a component", () => {
    const KEYWORD =
      /^(?:const|let|var|return|import|export|if|else|case|default|type|interface|function|async|await|for|while|switch|break|continue|throw|try|catch|finally|new|void)\b/;
    const offences: string[] = [];
    for (const { file, text } of sources) {
      text.split("\n").forEach((line, index) => {
        const trimmed = line.trim();
        if (KEYWORD.test(trimmed) || /^(?:\/\/|\/\*|\*)/.test(trimmed)) return;
        // A line that is only words and punctuation is JSX text.
        if (/^[\p{L}][\p{L}'’ ,.!?-]{3,}$/u.test(trimmed) && /\s/.test(trimmed))
          offences.push(`${file.slice(CLIENT.length)}:${index + 1}: ${trimmed}`);
      });
    }
    expect(offences).toEqual([]);
  });
});
