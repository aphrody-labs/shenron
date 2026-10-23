/**
 * Level-up announcement: one message per XP gain, "Level 2 → 5" when several levels are crossed,
 * the zeni shown are exactly the ones credited, and the XP amounts are labelled "XP" everywhere
 * (not "unités" in one place and "XP total" in another).
 */
import "./setup"; // must be first
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { levelRewards, users } from "~/db/schema";
import { levelUpMessage } from "~/lib/dbz-flavor";
import { SettingsService } from "~/services/SettingsService";

const { LevelService } = await import("~/services/LevelService");

const dbs = container.resolve(DatabaseService);
const levels = container.resolve(LevelService);
const settings = container.resolve(SettingsService);

interface Sent {
  content?: string;
  embeds: Array<{ toJSON(): { title?: string; description?: string; fields?: Field[] } }>;
}
interface Field {
  name: string;
  value: string;
  inline?: boolean;
}

/** A guild member and a channel recording what is sent to it. */
function fixture(id: string) {
  const sent: Sent[] = [];
  const channel = {
    send: async (payload: Sent) => {
      sent.push(payload);
      return null;
    },
  };
  const member = {
    id,
    displayName: `member-${id}`,
    displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
    roles: { cache: new Map(), add: async () => null },
    guild: { members: { me: null }, roles: { cache: new Map(), fetch: async () => null } },
    client: { guilds: { cache: new Map() }, channels: { fetch: async () => null } },
  };
  return { sent, channel, member };
}

const fields = (sent: Sent) => sent.embeds[0]!.toJSON().fields ?? [];
/** Field value with the (narrow) no-break spaces of the number format folded to plain spaces. */
const fieldValue = (sent: Sent, name: string) =>
  fields(sent)
    .find((f) => f.name === name)
    ?.value.replace(/\s/g, " ");
const zeniOf = (id: string) => dbs.db.select().from(users).where(eq(users.id, id)).get()?.zeni ?? 0;

beforeEach(async () => {
  dbs.db.delete(users).run();
  dbs.db.delete(levelRewards).run();
  await settings.set("zeni.per_level", "1500");
});
afterEach(async () => {
  await settings.set("bot.language", "fr");
});

/** Level 2 (5 000 XP) member who gains enough to reach level 5 (50 000 XP). */
async function seedMemberAtLevelTwo(id: string, extra: Partial<typeof users.$inferInsert> = {}) {
  // Zeni at 0 (the column defaults to 1 000): the balance then equals what level-ups credited.
  await dbs.db.insert(users).values({ id, xp: 5_000, zeni: 0, ...extra });
}
const reachLevelFive = (id: string) =>
  levels.addXP(id, 45_000, { propagateFusion: false, source: "admin" });

describe("a gain that crosses several levels", () => {
  test("is announced once, as 'Niveau 2 → 5', with the zeni credited for all three levels", async () => {
    await seedMemberAtLevelTwo("4001");
    const { sent, channel, member } = fixture("4001");

    const res = await reachLevelFive("4001");
    expect([res.oldLevel, res.newLevel]).toEqual([2, 5]);
    expect(res.levelZeni).toBe(3 * 1500);
    await levels.handleLevelUp(
      member as never,
      res.newLevel,
      channel as never,
      res.oldLevel,
      res.levelZeni,
    );

    expect(sent).toHaveLength(1);
    const embed = sent[0]!.embeds[0]!.toJSON();
    expect(embed.title).toBe("Niveau 2 → 5 atteint !");
    expect(fieldValue(sent[0]!, "Niveau")).toBe("**2 → 5**");
    // Announced = credited, to the unit.
    expect(fieldValue(sent[0]!, "Récompense")).toBe("**+4 500 Ƶ**");
    expect(zeniOf("4001")).toBe(4_500);
  });

  test("a single level keeps the plain title", async () => {
    await seedMemberAtLevelTwo("4002");
    const { sent, channel, member } = fixture("4002");
    const res = await levels.addXP("4002", 5_000, { propagateFusion: false, source: "admin" });
    expect([res.oldLevel, res.newLevel]).toEqual([2, 3]);
    await levels.handleLevelUp(
      member as never,
      res.newLevel,
      channel as never,
      res.oldLevel,
      res.levelZeni,
    );
    expect(sent[0]!.embeds[0]!.toJSON().title).toBe("Niveau 3 atteint !");
    expect(fieldValue(sent[0]!, "Niveau")).toBe("**3**");
    expect(fieldValue(sent[0]!, "Récompense")).toBe("**+1 500 Ƶ**");
  });
});

describe("the announced zeni are the credited zeni", () => {
  test("tier rewards that are really paid are added to the per-level credit", async () => {
    await seedMemberAtLevelTwo("4003");
    await dbs.db
      .insert(levelRewards)
      .values({ level: 4, roleId: "r4", zeniBonus: 7_000, xpThreshold: 25_000 });
    const { sent, channel, member } = fixture("4003");
    const res = await reachLevelFive("4003");
    await levels.handleLevelUp(
      member as never,
      res.newLevel,
      channel as never,
      res.oldLevel,
      res.levelZeni,
    );
    expect(zeniOf("4003")).toBe(4_500 + 7_000);
    expect(fieldValue(sent[0]!, "Récompense")).toBe("**+11 500 Ƶ**");
  });

  test("a frozen account is credited nothing, so nothing is announced as a reward", async () => {
    await seedMemberAtLevelTwo("4004", { zeniFrozen: true });
    const { sent, channel, member } = fixture("4004");
    const res = await reachLevelFive("4004");
    expect(res.levelUp).toBe(true);
    expect(res.levelZeni).toBe(0);
    await levels.handleLevelUp(
      member as never,
      res.newLevel,
      channel as never,
      res.oldLevel,
      res.levelZeni,
    );
    expect(zeniOf("4004")).toBe(0);
    expect(sent).toHaveLength(1);
    expect(fieldValue(sent[0]!, "Récompense")).toBeUndefined();
  });

  test("an admin adjustment announces the level but no reward it never paid", async () => {
    await seedMemberAtLevelTwo("4005");
    const { sent, channel, member } = fixture("4005");
    const res = await levels.setXP("4005", 50_000);
    await levels.handleLevelUp(member as never, res.newLevel, channel as never);
    expect(zeniOf("4005")).toBe(0);
    expect(fieldValue(sent[0]!, "Récompense")).toBeUndefined();
  });
});

describe("one label for experience points: XP", () => {
  test("the header says XP, never 'unités'", () => {
    const message = levelUpMessage("5001", 5);
    expect(message).toContain("<@5001> a atteint les **");
    expect(message).toContain(" XP** !");
    expect(message).not.toMatch(/unit[ée]s/i);
  });

  test("the embed field is 'XP', not 'XP total'", async () => {
    await seedMemberAtLevelTwo("4006");
    const { sent, channel, member } = fixture("4006");
    const res = await reachLevelFive("4006");
    await levels.handleLevelUp(
      member as never,
      res.newLevel,
      channel as never,
      res.oldLevel,
      res.levelZeni,
    );
    const names = fields(sent[0]!).map((f) => f.name);
    expect(names).toEqual(["Niveau", "XP", "Récompense"]);
    expect(names).not.toContain("XP total");
    const description = sent[0]!.embeds[0]!.toJSON().description ?? "";
    expect(description).not.toMatch(/unit[ée]s/i);
  });

  test("English and Japanese embeds use the same 'XP'", async () => {
    await settings.set("bot.language", "en");
    await seedMemberAtLevelTwo("4007");
    const english = fixture("4007");
    const res = await reachLevelFive("4007");
    await levels.handleLevelUp(
      english.member as never,
      res.newLevel,
      english.channel as never,
      res.oldLevel,
      res.levelZeni,
    );
    expect(english.sent[0]!.embeds[0]!.toJSON().title).toBe("Level 2 → 5 reached!");
    expect(fields(english.sent[0]!).map((f) => f.name)).toEqual(["Level", "XP", "Reward"]);
    expect(levelUpMessage("1", 5, "en")).toContain(" XP**!");

    expect(levelUpMessage("1", 5, "ja")).toContain(" XP** に到達");
  });
});
