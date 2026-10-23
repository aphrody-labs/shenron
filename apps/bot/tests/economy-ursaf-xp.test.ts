/**
 * URSAF taxes zeni: XP flags (XP_SPIKE, XP_RATE) must not feed a notice, otherwise an XP
 * spike raised the severity, hence the rate, of a notice built on zeni flags.
 */
import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { economyFlags, users } from "~/db/schema";

const { UrsafService } = await import("~/services/UrsafService");
const { AntiCheatService } = await import("~/services/AntiCheatService");

const dbs = container.resolve(DatabaseService);
container.resolve(AntiCheatService); // creates economy_flags
const ursaf = container.resolve(UrsafService);

describe("UrsafService.assessAll", () => {
  test("ignore les signalements XP : la gravité vient des seuls signalements de zéni", async () => {
    await dbs.db.insert(users).values({ id: "ursaf-xp", zeni: 2_000_000 });
    await dbs.db.insert(economyFlags).values([
      {
        userId: "ursaf-xp",
        code: "RATIO",
        severity: "medium",
        reason: "ratio",
        meta: JSON.stringify({ balance: 2_000_000, maxReasonable: 200_000 }),
      },
      { userId: "ursaf-xp", code: "XP_SPIKE", severity: "critical", reason: "xp", meta: "{}" },
      { userId: "ursaf-xp", code: "XP_RATE", severity: "high", reason: "xp", meta: "{}" },
    ]);
    const [notice] = await ursaf.assessAll({ dryRun: true });
    expect(notice?.userId).toBe("ursaf-xp");
    expect(notice?.severity).toBe("medium");
    expect(notice?.flagIds).toHaveLength(1);
  });

  test("un membre qui n'a que des signalements XP n'a aucun avis", async () => {
    await dbs.db.insert(users).values({ id: "ursaf-xp-only", zeni: 5_000_000 });
    await dbs.db.insert(economyFlags).values({
      userId: "ursaf-xp-only",
      code: "XP_SPIKE",
      severity: "high",
      reason: "xp",
      meta: "{}",
    });
    const notices = await ursaf.assessAll({ dryRun: true });
    expect(notices.find((n) => n.userId === "ursaf-xp-only")).toBeUndefined();
  });
});
