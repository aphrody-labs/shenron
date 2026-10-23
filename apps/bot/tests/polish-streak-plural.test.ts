/**
 * Daily-quest message: the noun agrees with the streak ("streak 1 jour", "streak 5 jours")
 * instead of the former "streak 1 jours", in every language of the bot.
 */
import "./setup"; // must be first
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";
import { tn } from "~/lib/i18n";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { SettingsService } from "~/services/SettingsService";
import { recordPublications, sendMessage } from "./polish-message";

describe("plural helper", () => {
  test("French: 0 and 1 are singular, the rest plural", () => {
    expect(tn("fr", "plural.days", 0)).toBe("0 jour");
    expect(tn("fr", "plural.days", 1)).toBe("1 jour");
    expect(tn("fr", "plural.days", 2)).toBe("2 jours");
    expect(tn("fr", "plural.days", 31)).toBe("31 jours");
  });

  test("English: only 1 is singular", () => {
    expect(tn("en", "plural.days", 0)).toBe("0 days");
    expect(tn("en", "plural.days", 1)).toBe("1 day");
    expect(tn("en", "plural.days", 2)).toBe("2 days");
  });

  test("Japanese has a single form", () => {
    expect(tn("ja", "plural.days", 1)).toBe("1日");
    expect(tn("ja", "plural.days", 5)).toBe("5日");
  });

  test("the other plural groups agree too", () => {
    expect(tn("fr", "plural.participants", 1)).toBe("1 participant");
    expect(tn("fr", "plural.participants", 11)).toBe("11 participants");
    expect(tn("fr", "plural.members", 2)).toBe("2 membres");
    expect(tn("en", "plural.members", 1)).toBe("1 member");
  });

  test("big numbers use the grouping of the language", () => {
    expect(tn("en", "plural.days", 1234)).toBe("1,234 days");
    expect(tn("fr", "plural.days", 1234).replace(/\s/g, " ")).toBe("1 234 jours");
  });
});

describe("daily quest through the real message handler", () => {
  const dbs = container.resolve(DatabaseService);
  const settings = container.resolve(SettingsService);
  const templates = container.resolve(MessageTemplateService);
  let recorder: ReturnType<typeof recordPublications>;

  beforeEach(() => {
    dbs.db.delete(users).run();
    recorder = recordPublications();
  });
  afterEach(async () => {
    recorder.restore();
    await settings.set("bot.language", "fr");
  });

  const dailyQuest = () => recorder.published.find((p) => p.event === "daily_quest");

  test("a first day reads 'streak 1 jour'", async () => {
    await sendMessage("3001", "salut");
    const quest = dailyQuest();
    expect(quest?.vars.streak).toBe(1);
    expect(quest?.vars.streakDays).toBe("1 jour");
    const rendered = await templates.render("daily_quest", quest!.vars);
    expect(rendered?.rendered).toContain("(streak 1 jour).");
    expect(rendered?.rendered).not.toContain("1 jours");
  });

  test("a streak of five reads 'streak 5 jours'", async () => {
    await dbs.db.insert(users).values({
      id: "3002",
      dailyStreak: 4,
      lastDailyQuestAt: new Date(Date.now() - 24 * 3_600_000),
    });
    await sendMessage("3002", "salut");
    const quest = dailyQuest();
    expect(quest?.vars.streak).toBe(5);
    const rendered = await templates.render("daily_quest", quest!.vars);
    expect(rendered?.rendered).toContain("(streak 5 jours).");
  });

  test("English and Japanese agree as well", async () => {
    await settings.set("bot.language", "en");
    await sendMessage("3003", "hello");
    const english = await templates.render("daily_quest", dailyQuest()!.vars);
    expect(english?.rendered).toContain("(streak: 1 day).");

    await dbs.db.insert(users).values({
      id: "3004",
      dailyStreak: 2,
      lastDailyQuestAt: new Date(Date.now() - 24 * 3_600_000),
    });
    await settings.set("bot.language", "ja");
    await sendMessage("3004", "hello");
    const quests = recorder.published.filter((p) => p.event === "daily_quest");
    expect(quests).toHaveLength(2);
    const japanese = await templates.render("daily_quest", quests.at(-1)!.vars);
    expect(japanese?.rendered).toContain("連続 3日");
  });
});
