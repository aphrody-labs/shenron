/**
 * Giveaways et succès : tirage unique et message clos, déclencheurs sans état.
 */
import "./setup"; // must be first
import { describe, expect, mock, test } from "bun:test";
import { container } from "tsyringe";
import { eq } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { achievementTriggers, giveawayEntries, giveaways, users } from "~/db/schema";

const { GiveawayTicker } = await import("~/commands/giveaway/Giveaway");
const { AchievementService } = await import("~/services/AchievementService");

const dbs = container.resolve(DatabaseService);

describe("giveaway", () => {
  test("le tirage n'a lieu qu'une fois et clôt le message d'origine", async () => {
    const [row] = await dbs.db
      .insert(giveaways)
      .values({
        messageId: "gw-msg-1",
        channelId: "gw-chan-1",
        hostId: "host",
        title: "Test",
        reward: "Senzu",
        winners: 1,
        endsAt: new Date(Date.now() - 1_000),
      })
      .returning();
    await dbs.db.insert(users).values({ id: "gw-user-1" }).onConflictDoNothing();
    await dbs.db.insert(giveawayEntries).values({ giveawayId: row!.id, userId: "gw-user-1" });

    const edit = mock(async () => ({}));
    const send = mock(async () => ({}));
    const channel = { send, messages: { fetch: async () => ({ edit }) } };
    const client = { channels: { fetch: async () => channel } };
    const ticker = container.resolve(GiveawayTicker) as unknown as {
      tick(c: unknown): Promise<void>;
      msg: { resolveTarget: () => Promise<null>; publish: () => Promise<boolean> };
    };
    ticker.msg.resolveTarget = async () => null;
    ticker.msg.publish = async () => false;

    await Promise.all([ticker.tick(client), ticker.tick(client)]);
    expect(edit).toHaveBeenCalledTimes(1);
    const after = await dbs.db.query.giveaways.findFirst({ where: eq(giveaways.id, row!.id) });
    expect(after?.ended).toBe(true);
    expect(JSON.parse(after?.winnerIds ?? "[]")).toEqual(["gw-user-1"]);
    const payload = (edit.mock.calls[0] as unknown[])[0] as {
      components: { toJSON(): { components: { disabled?: boolean }[] } }[];
    };
    expect(payload.components[0]!.toJSON().components[0]!.disabled).toBe(true);
  });
});

describe("succès", () => {
  test("un déclencheur avec le drapeau g répond à chaque message", async () => {
    await dbs.db
      .insert(achievementTriggers)
      .values({ code: "ECO_KAMEHA", pattern: "kamehameha", flags: "gi", enabled: true })
      .onConflictDoNothing();
    const svc = container.resolve(AchievementService);
    await svc.refresh();
    for (const id of ["ach-a", "ach-b"]) {
      await dbs.db.insert(users).values({ id }).onConflictDoNothing();
      expect(await svc.checkMessage(id, "KAMEHAMEHA !")).toContain("ECO_KAMEHA");
    }
  });
});
