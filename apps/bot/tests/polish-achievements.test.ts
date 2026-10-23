/**
 * Achievement announcements show the member a readable, localized name ("Dragon Ball"), never
 * the technical code ("DRAGON_BALL").
 */
import "./setup"; // must be first
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { resolve } from "node:path";
import { DatabaseService } from "~/db/index";
import { achievements, users } from "~/db/schema";
import { achievementName, humanizeAchievementCode } from "~/lib/achievement-names";
import { botLang, tryT, type BotLang } from "~/lib/i18n";
import { AchievementService } from "~/services/AchievementService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { SettingsService } from "~/services/SettingsService";
import { recordPublications, sendMessage } from "./polish-message";

const LANGS: BotLang[] = ["fr", "en", "ja"];

/** Codes of the production triggers, read from the seed (the file runs a script, no export). */
async function seededCodes(): Promise<string[]> {
  const source = await Bun.file(resolve(import.meta.dir, "../src/db/seed-triggers.ts")).text();
  return [...source.matchAll(/code:\s*"([A-Z0-9_]+)"/g)].map((match) => match[1]!);
}

describe("achievement names", () => {
  test("the seed declares the triggers the announcements are built for", async () => {
    const codes = await seededCodes();
    expect(codes).toContain("DRAGON_BALL");
    expect(codes).toContain("CHICHI_SIMP");
    expect(codes.length).toBeGreaterThanOrEqual(15);
  });

  test("every seeded trigger, and the first message, is named in fr, en and ja", async () => {
    for (const code of [...(await seededCodes()), "FIRST_MESSAGE"]) {
      for (const lang of LANGS) {
        const name = tryT(lang, `achievements.names.${code}`);
        expect(name, `${lang}/${code}`).toBeString();
        expect(name, `${lang}/${code}`).not.toBe(code);
        expect(achievementName(lang, code)).toBe(name!);
      }
    }
  });

  test("the names named in the report read as words", () => {
    expect(achievementName("fr", "DRAGON_BALL")).toBe("Dragon Ball");
    expect(achievementName("fr", "ULTRA_INSTINCT")).toBe("Ultra Instinct");
    expect(achievementName("fr", "NAMEK")).toBe("Namek");
    expect(achievementName("fr", "CHICHI_SIMP")).toBe("Peur de Chichi");
    expect(achievementName("ja", "DRAGON_BALL")).toBe("ドラゴンボール");
  });

  test("a code with no dictionary entry falls back to a humanized code", () => {
    expect(achievementName("fr", "BARBECUE_PARTY")).toBe("Barbecue party");
    expect(humanizeAchievementCode("ZENKAI-boost")).toBe("Zenkai boost");
    expect(humanizeAchievementCode("")).toBe("");
    // A hostile code must not walk the dictionary object.
    expect(achievementName("fr", "__proto__")).toBe("Proto");
    expect(achievementName("fr", "constructor")).toBe("Constructor");
  });

  test("an unsupported locale is French", () => {
    expect(achievementName(botLang("de-DE"), "DRAGON_BALL")).toBe("Dragon Ball");
  });
});

describe("announcement through the real message handler", () => {
  const dbs = container.resolve(DatabaseService);
  const settings = container.resolve(SettingsService);
  const triggers = container.resolve(AchievementService);
  const templates = container.resolve(MessageTemplateService);
  let recorder: ReturnType<typeof recordPublications>;

  beforeEach(async () => {
    dbs.db.delete(achievements).run();
    dbs.db.delete(users).run();
    await triggers.upsert({ code: "DRAGON_BALL", pattern: "\\bdragon[-\\s]?ball[s]?\\b" });
    await triggers.upsert({ code: "CHICHI_SIMP", pattern: "\\bchichi\\b" });
    recorder = recordPublications();
  });
  afterEach(async () => {
    recorder.restore();
    await settings.set("bot.language", "fr");
  });

  test("DRAGON_BALL is announced as 'Dragon Ball'", async () => {
    await sendMessage("2001", "j'ai trouvé une dragon ball hier");
    const unlocked = recorder.published.filter((p) => p.event === "achievement_unlocked");
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.vars.name).toBe("Dragon Ball");
    // The technical code stays available for admin-written templates.
    expect(unlocked[0]!.vars.code).toBe("DRAGON_BALL");

    const rendered = await templates.render("achievement_unlocked", unlocked[0]!.vars);
    expect(rendered?.rendered).toBe("<@2001> débloque l'accomplissement **Dragon Ball** !");
    expect(rendered?.rendered).not.toContain("DRAGON_BALL");
  });

  test("the first message gets its own readable name", async () => {
    await sendMessage("2002", "salut");
    const first = recorder.published.find((p) => p.event === "first_message");
    expect(first?.vars.name).toBe("Premier message");
    const rendered = await templates.render("first_message", first!.vars);
    expect(rendered?.rendered).toContain("**Premier message**");
  });

  test("the announcement follows the bot language", async () => {
    await settings.set("bot.language", "en");
    await sendMessage("2003", "Chichi is scary");
    const unlocked = recorder.published.find((p) => p.event === "achievement_unlocked");
    expect(unlocked?.vars.name).toBe("Afraid of Chi-Chi");
    const rendered = await templates.render("achievement_unlocked", unlocked!.vars);
    expect(rendered?.rendered).toBe("<@2003> unlocks the achievement **Afraid of Chi-Chi**!");

    await settings.set("bot.language", "ja");
    await sendMessage("2004", "Chichi is scary");
    const japanese = recorder.published.findLast((p) => p.event === "achievement_unlocked");
    expect(japanese?.vars.name).toBe("チチが怖い");
    const renderedJa = await templates.render("achievement_unlocked", japanese!.vars);
    expect(renderedJa?.rendered).toBe("<@2004> が実績 **チチが怖い** を解除しました！");
  });

  test("an invalid language setting is refused and French stays in force", async () => {
    await expect(settings.set("bot.language", "de")).rejects.toThrow();
    expect(await settings.getLanguage()).toBe("fr");
  });
});
