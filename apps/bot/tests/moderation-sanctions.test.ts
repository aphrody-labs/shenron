import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { and, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { jails, warns, actionLogs } from "~/db/schema";

const {
  auditReason,
  dmField,
  parseBoundedDuration,
  sanctionDmEmbed,
  sanctionTargetError,
  MAX_TIMEOUT_MS,
} = await import("~/lib/sanction-helpers");
const { ModerationService, parseRoleSnapshot, restorableRoles } =
  await import("~/services/ModerationService");
const { formatSentence } = await import("~/events/JailExpiry");

describe("parseBoundedDuration", () => {
  test("accepts the documented units", () => {
    expect(parseBoundedDuration("10m")).toEqual({ ok: true, ms: 600_000 });
    expect(parseBoundedDuration("2w")).toEqual({ ok: true, ms: 14 * 86_400_000 });
  });

  test("an empty optional duration means no duration", () => {
    expect(parseBoundedDuration(undefined)).toEqual({ ok: true, ms: 0 });
    expect(parseBoundedDuration("  ")).toEqual({ ok: true, ms: 0 });
  });

  test("an empty required duration is refused", () => {
    expect(parseBoundedDuration("", { required: true }).ok).toBe(false);
  });

  test("an unreadable duration is refused instead of becoming indefinite", () => {
    const r = parseBoundedDuration("1 heure");
    expect(r.ok).toBe(false);
    expect(parseBoundedDuration("0m").ok).toBe(false);
  });

  test("bounds are enforced (Discord timeout max 28 days)", () => {
    expect(parseBoundedDuration("28d", { maxMs: MAX_TIMEOUT_MS }).ok).toBe(true);
    expect(parseBoundedDuration("29d", { maxMs: MAX_TIMEOUT_MS }).ok).toBe(false);
    expect(parseBoundedDuration("30s", { minMs: 60_000 }).ok).toBe(false);
  });
});

describe("sanctionTargetError", () => {
  const base = { actorId: "1", targetId: "2", botId: "3" };

  test("refuses self and the bot", () => {
    expect(sanctionTargetError({ ...base, targetId: "1" })).toContain("toi-même");
    expect(sanctionTargetError({ ...base, targetId: "3" })).toContain("bot");
  });

  test("refuses other bots only when asked", () => {
    expect(sanctionTargetError({ ...base, targetIsBot: true })).toBeNull();
    expect(sanctionTargetError({ ...base, targetIsBot: true, allowBots: false })).toContain("bot");
  });

  test("lets a regular target through", () => {
    expect(sanctionTargetError(base)).toBeNull();
  });
});

describe("sanction copy", () => {
  test("audit reason falls back to the moderator and respects the 512 limit", () => {
    expect(auditReason(undefined, { username: "goku" })).toBe("by goku");
    expect(auditReason("  ", { username: "goku" })).toBe("by goku");
    expect(auditReason("x".repeat(600), { username: "goku" })).toHaveLength(512);
  });

  test("DM field states delivery", () => {
    expect(dmField(true).value).toContain("envoyé");
    expect(dmField(false).value).toContain("fermés");
  });

  test("DM embed carries guild, reason and end date of a timed sanction", () => {
    const json = sanctionDmEmbed({
      kind: "mute",
      guildName: "DBFR",
      reason: "spam",
      durationMs: 3_600_000,
    }).toJSON();
    expect(json.title).toContain("mute");
    expect(json.description).toContain("**DBFR**");
    expect(json.description).toContain("spam");
    expect(json.description).toContain("<t:");
  });

  test("DM embed of an untimed sanction has no end date", () => {
    const json = sanctionDmEmbed({ kind: "ban", guildName: "DBFR" }).toJSON();
    expect(json.description).toContain("non précisé");
    expect(json.description).not.toContain("<t:");
  });

  test("sentence formatting keeps two units", () => {
    expect(formatSentence(0)).toBe("—");
    expect(formatSentence(90 * 60_000)).toBe("1h 30m");
    expect(formatSentence(2 * 86_400_000 + 3 * 3_600_000)).toBe("2j 3h");
  });
});

describe("jail role snapshot", () => {
  const roles = new Map([
    ["low", { id: "low", position: 1, managed: false }],
    ["boost", { id: "boost", position: 2, managed: true }],
    ["high", { id: "high", position: 50, managed: false }],
    ["jail", { id: "jail", position: 3, managed: false }],
  ]);
  const guild = { id: "guild", roles: { cache: roles } } as never;
  const me = { roles: { highest: { position: 10 } } } as never;

  test("a corrupt snapshot restores nothing", () => {
    expect(parseRoleSnapshot("not json")).toEqual([]);
    expect(parseRoleSnapshot('{"a":1}')).toEqual([]);
    expect(parseRoleSnapshot('["a",2]')).toEqual(["a"]);
  });

  test("restores only roles the bot can assign, never the jail role", () => {
    const rows = [
      { previousRoles: JSON.stringify(["guild", "low", "boost", "high", "jail", "deleted"]) },
      { previousRoles: JSON.stringify(["low"]) },
    ];
    expect(restorableRoles(rows, guild, "jail", me)).toEqual(["low"]);
  });
});

describe("ModerationService jail lifecycle", () => {
  const dbs = container.resolve(DatabaseService);
  const mod = container.resolve(ModerationService);
  const jailRoleId = process.env.JAIL_ROLE_ID!;

  function fakeMember(userId: string, roleIds: string[]) {
    const current = new Set(roleIds);
    const roleObjects = new Map(
      [...roleIds, jailRoleId, "member-role"].map((id) => [
        id,
        { id, position: 1, managed: false, name: id },
      ]),
    );
    const cacheOf = () => {
      const entries = [...current].map((id) => [id, roleObjects.get(id)!] as const);
      const map = new Map(entries) as Map<string, unknown> & {
        filter: (fn: (r: { id: string }) => boolean) => {
          map: (f: (r: { id: string }) => string) => string[];
        };
      };
      map.filter = (fn) => {
        const kept = [...current].map((id) => roleObjects.get(id)!).filter(fn);
        return { map: (f) => kept.map(f) };
      };
      return map;
    };
    const me = { roles: { highest: { position: 10, name: "bot" } } };
    const guild = {
      id: "guild-id",
      roles: { cache: roleObjects },
      members: {
        me,
        fetchMe: async () => me,
        fetch: async () => member,
      },
    };
    const member = {
      id: userId,
      guild,
      get roles() {
        return {
          cache: cacheOf(),
          set: async (ids: string[]) => {
            current.clear();
            for (const id of ids) current.add(id);
          },
          add: async (id: string) => void current.add(id),
          remove: async (id: string) => void current.delete(id),
        };
      },
    };
    return { member, guild, current };
  }

  test("a second jail updates the sentence and keeps the original roles", async () => {
    const userId = "test-user-double-jail";
    await dbs.db.delete(jails).where(eq(jails.userId, userId));
    const { member, guild, current } = fakeMember(userId, ["member-role"]);

    await mod.jail(member as never, "mod-1", "first", 3_600_000);
    expect(current.has(jailRoleId)).toBe(true);
    expect(current.has("member-role")).toBe(false);

    await mod.jail(member as never, "mod-2", "second", 7_200_000);
    const open = await dbs.db
      .select()
      .from(jails)
      .where(and(eq(jails.userId, userId), isNull(jails.releasedAt)));
    expect(open).toHaveLength(1);
    expect(open[0]!.reason).toBe("second");
    expect(parseRoleSnapshot(open[0]!.previousRoles)).toEqual(["member-role"]);

    expect(await mod.unjail(guild as never, userId, "mod-1")).toBe(true);
    expect(current.has("member-role")).toBe(true);
    expect(current.has(jailRoleId)).toBe(false);
    expect(await mod.getActiveJail(userId)).toBeUndefined();

    await dbs.db.delete(jails).where(eq(jails.userId, userId));
  });

  test("unjail closes every open row so the expiry cron stops", async () => {
    const userId = "test-user-stacked-jails";
    await dbs.db.delete(jails).where(eq(jails.userId, userId));
    await dbs.db.insert(jails).values([
      { userId, moderatorId: "m", previousRoles: "[]", expiresAt: new Date(Date.now() - 1000) },
      { userId, moderatorId: "m", previousRoles: "[]", expiresAt: new Date(Date.now() - 500) },
    ]);
    // Member already left: rows are still closed.
    const guild = { id: "guild-id", members: { fetch: async () => null } };
    expect(await mod.unjail(guild as never, userId, "bot", "auto-expiry")).toBe(true);
    expect(await mod.getActiveJail(userId)).toBeUndefined();
    expect(await mod.unjail(guild as never, userId, "bot", "auto-expiry")).toBe(false);
    await dbs.db.delete(jails).where(eq(jails.userId, userId));
  });

  test("unwarn records the moderator", async () => {
    const userId = "test-user-unwarn-mod";
    await dbs.db.delete(warns).where(eq(warns.userId, userId));
    await dbs.db.delete(actionLogs).where(eq(actionLogs.userId, userId));
    await mod.addWarn(userId, "mod-1", "r");
    expect(await mod.removeLastWarn(userId, "mod-2")).toBe(true);
    const logs = await dbs.db.select().from(actionLogs).where(eq(actionLogs.userId, userId));
    expect(logs.find((l) => l.action === "UNWARN")?.moderatorId).toBe("mod-2");
    await dbs.db.delete(warns).where(eq(warns.userId, userId));
  });
});
