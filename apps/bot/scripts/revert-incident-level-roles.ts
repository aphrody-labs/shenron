// SPDX-License-Identifier: Apache-2.0
/**
 * Takes back the tier roles the bot granted during an incident window when the
 * member's level no longer justifies them.
 *
 * Source of truth for what was granted: the guild audit log (member role
 * updates made by the bot since `FROM`). A role is removed only when it was
 * added by the bot in that window, belongs to a tier ladder (or the retired
 * ten-step reward ladder), and is not one of the ladder roles up to the
 * member's stored level for their race (Saiyan ladder without a race role).
 * Roles held before the window are never touched. Extra role ids can be
 * reverted with `EXTRA_ROLES` (comma separated), for roles self-granted by abuse,
 * and `KEEP_FILE` (JSON `[{ member, roles }]`) lists grants that only restored
 * roles held before the window, which are kept.
 *
 *   DB=/path/bot.db TOKEN=… GUILD=… BOT_ID=… FROM=2026-10-22T21:59:00Z bun revert-incident-level-roles.ts          # dry run
 *   … APPLY=1 bun revert-incident-level-roles.ts                                                                   # removes
 */
import { Database } from "bun:sqlite";

const { DB, TOKEN, GUILD, BOT_ID } = process.env;
if (!DB || !TOKEN || !GUILD || !BOT_ID) throw new Error("DB, TOKEN, GUILD and BOT_ID are required");
const from = Date.parse(process.env.FROM ?? "");
if (Number.isNaN(from)) throw new Error("FROM (ISO date) is required");
const apply = process.env.APPLY === "1";
const extra = new Set((process.env.EXTRA_ROLES ?? "").split(",").filter(Boolean));
const kept = new Set<string>();
if (process.env.KEEP_FILE) {
  const rows = (await Bun.file(process.env.KEEP_FILE).json()) as {
    member: string;
    roles: string[];
  }[];
  for (const r of rows) for (const role of r.roles) kept.add(`${r.member}:${role}`);
}
const API = "https://discord.com/api/v10";
const REASON = encodeURIComponent(
  "Shenron: tier roles granted by the 2026-10-22/23 ladder incident",
);

const RACE_IDS = ["saiyan", "humain", "namek", "mutant", "cyborg", "majin"] as const;
type RaceId = (typeof RACE_IDS)[number];
const RACE_ROLE: Record<RaceId, string> = {
  saiyan: "935209502104510564",
  humain: "1516949508049731584",
  namek: "1516949508687397015",
  mutant: "1516949507265400932",
  cyborg: "1516949479864008744",
  majin: "1516949624294739968",
};
const RETIRED_REWARD_ROLES = [
  "1058910891124457482",
  "1058910426164908075",
  "1058910477847109743",
  "1058910518720593920",
  "1058910672068563024",
  "1058910743736614962",
  "1058910776687087637",
  "1074616048487247902",
  "1074616052350193674",
  "1074619485450932304",
];

const db = new Database(DB, { readonly: true });
const ladders = Object.fromEntries(RACE_IDS.map((r) => [r, new Map<number, string>()])) as Record<
  RaceId,
  Map<number, string>
>;
for (const row of db
  .query<{ race: RaceId; level: number; role_id: string }, []>(
    "select race, level, role_id from race_level_roles",
  )
  .all()) {
  ladders[row.race]?.set(row.level, row.role_id);
}
const managed = new Set([
  ...RACE_IDS.flatMap((r) => [...ladders[r].values()]),
  ...RETIRED_REWARD_ROLES,
  ...extra,
]);
const levels = new Map(
  db
    .query<{ id: string; level: number }, []>("select id, last_level_reached level from users")
    .all()
    .map((u) => [u.id, u.level]),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function discord(method: string, path: string, body?: unknown): Promise<unknown> {
  for (;;) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json",
        "X-Audit-Log-Reason": REASON,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const wait = Number(((await res.json()) as { retry_after?: number }).retry_after ?? 1);
      await sleep(Math.ceil(wait * 1000) + 100);
      continue;
    }
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
    if (Number(res.headers.get("x-ratelimit-remaining")) === 0) {
      await sleep(Number(res.headers.get("x-ratelimit-reset-after") ?? 1) * 1000 + 50);
    }
    return res.status === 204 ? null : res.json();
  }
}

// Snowflake for FROM: (ms − Discord epoch) << 22.
const fromSnowflake = (BigInt(from) - 1420070400000n) << 22n;
const granted = new Map<string, Set<string>>();
let before: string | undefined;
for (;;) {
  const q = new URLSearchParams({ action_type: "25", user_id: BOT_ID, limit: "100" });
  if (before) q.set("before", before);
  const page = (await discord("GET", `/guilds/${GUILD}/audit-logs?${q}`)) as {
    audit_log_entries: {
      id: string;
      target_id: string;
      changes?: { key: string; new_value?: { id: string }[] }[];
    }[];
  };
  const entries = page.audit_log_entries;
  for (const e of entries) {
    if (BigInt(e.id) < fromSnowflake) continue;
    for (const c of e.changes ?? []) {
      if (c.key !== "$add") continue;
      for (const r of c.new_value ?? []) {
        if (!managed.has(r.id)) continue;
        (granted.get(e.target_id) ?? granted.set(e.target_id, new Set()).get(e.target_id)!).add(
          r.id,
        );
      }
    }
  }
  const last = entries.at(-1);
  if (!last || entries.length < 100 || BigInt(last.id) < fromSnowflake) break;
  before = last.id;
}

const legitRoles = (roles: string[], level: number) => {
  const race = RACE_IDS.find((r) => roles.includes(RACE_ROLE[r])) ?? "saiyan";
  return new Set([...ladders[race]].filter(([lvl]) => lvl <= level).map(([, role]) => role));
};

const plan: { userId: string; level: number; remove: string[] }[] = [];
for (const [userId, roles] of granted) {
  let member: { roles: string[] };
  try {
    member = (await discord("GET", `/guilds/${GUILD}/members/${userId}`)) as { roles: string[] };
  } catch {
    continue; // left the guild
  }
  const level = levels.get(userId) ?? 0;
  const keep = legitRoles(member.roles, level);
  const remove = [...roles].filter(
    (r) => member.roles.includes(r) && !keep.has(r) && !kept.has(`${userId}:${r}`),
  );
  if (remove.length === 0) continue;
  plan.push({ userId, level, remove });
  if (apply) {
    await discord("PATCH", `/guilds/${GUILD}/members/${userId}`, {
      roles: member.roles.filter((r) => !remove.includes(r)),
    });
  }
}

const roleNames = new Map(
  db
    .query<{ id: string; name: string }, []>("select id, name from discord_roles")
    .all()
    .map((r) => [r.id, r.name]),
);
const byRole = new Map<string, number>();
for (const p of plan) for (const r of p.remove) byRole.set(r, (byRole.get(r) ?? 0) + 1);
console.log(
  JSON.stringify(
    {
      apply,
      membersGranted: granted.size,
      membersChanged: plan.length,
      rolesRemoved: plan.reduce((s, p) => s + p.remove.length, 0),
      byRole: Object.fromEntries([...byRole].map(([r, n]) => [roleNames.get(r) ?? r, n])),
      sample: plan.slice(0, 15).map((p) => ({
        userId: p.userId,
        level: p.level,
        remove: p.remove.map((r) => roleNames.get(r) ?? r),
      })),
    },
    null,
    1,
  ),
);
