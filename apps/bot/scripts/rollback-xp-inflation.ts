// SPDX-License-Identifier: Apache-2.0
/**
 * Rolls back XP and level zeni gained through wrongly granted multiplier roles.
 *
 * Every XP gain since `FROM` (ISO date) or `FROM_ID` (action_logs id) is replayed
 * in order from the `XP_GAIN` ledger and capped at the most a member could have
 * earned with the configuration and the roles their legitimate level grants:
 *   message ≤ xp.message.max × min(cap, role × race × Zenkai × night)
 *   voice   ≤ xp.voice.per_minute × min(cap, role × race × Zenkai × group × max(night, sleepcall))
 *   fusion  ≤ xp.fusion.bonus_ratio × the partner's voice ceiling
 * Other sources (games, admin, regen) are kept as logged. The role multiplier
 * only counts the member's race ladder up to the legitimate level, boosted roles
 * outside every ladder that they hold, and the server booster bonus.
 *
 * Level-up zeni beyond `zeni.per_level` × legitimate levels gained is taken back,
 * the stored level and displayed tier are recomputed for every member, and the
 * `XP_SPIKE` flags of the window are closed. One `XP_ROLLBACK` row per adjusted
 * member plus one `XP_ROLLBACK_PASS` row keep the audit trail and the last
 * processed ledger id, so a second pass (`FROM_ID`) only replays newer gains.
 *
 * Self-contained (bun:sqlite only) so it can run next to the production base:
 *   DB=/path/bot.db FROM=2026-10-22T21:59:00Z bun rollback-xp-inflation.ts          # dry run
 *   DB=/path/bot.db FROM=2026-10-22T21:59:00Z APPLY=1 bun rollback-xp-inflation.ts  # writes
 */
import { Database } from "bun:sqlite";

const path = process.env.DB;
if (!path) throw new Error("DB is required");
const apply = process.env.APPLY === "1";
// The 2026-10-22 restore re-inserted the backup ledger under new ids, so the
// window is always bounded by date; FROM_ID only narrows a follow-up pass.
const fromTime = Date.parse(process.env.FROM ?? "");
if (Number.isNaN(fromTime)) throw new Error("FROM (ISO date) is required");
const fromId = process.env.FROM_ID ? Number(process.env.FROM_ID) : null;

const db = new Database(path, apply ? { readwrite: true, create: false } : { readonly: true });
db.exec("PRAGMA busy_timeout = 30000");

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
const RACE_DEFAULTS: Record<RaceId, { message: number; voice: number }> = {
  saiyan: { message: 1.25, voice: 1.25 },
  humain: { message: 1, voice: 1 },
  namek: { message: 1.1, voice: 1.1 },
  mutant: { message: 1.4, voice: 1 },
  cyborg: { message: 1, voice: 1.4 },
  majin: { message: 1, voice: 1 },
};
/** Old ten-step ladder once seeded into level_rewards; never a legitimate reward. */
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
const DEFAULT_LADDER_RACE: RaceId = "saiyan";
const isRace = (r: unknown): r is RaceId => RACE_IDS.includes(r as RaceId);

const settings = new Map(
  db
    .query<{ key: string; value: string }, []>("select key, value from guild_settings")
    .all()
    .map((r) => [r.key, r.value]),
);
const num = (key: string, fallback: number) => {
  const v = Number(settings.get(key));
  return Number.isFinite(v) ? v : fallback;
};

const thresholds = (() => {
  try {
    const rows = JSON.parse(settings.get("xp.thresholds") ?? "[]") as {
      level: number;
      xp: number;
    }[];
    return rows
      .filter((r) => Number.isFinite(r.level) && Number.isFinite(r.xp))
      .toSorted((a, b) => a.xp - b.xp);
  } catch {
    return [];
  }
})();
if (thresholds.length === 0) throw new Error("xp.thresholds is missing");
const levelForXP = (xp: number) => {
  let level = 0;
  for (const t of thresholds) if (xp >= t.xp) level = t.level;
  return level;
};

const cfg = {
  maxMultiplier: Math.max(1, num("xp.multiplier.max", 10)),
  messageMax: Math.max(0, num("xp.message.max", 25)),
  voicePerMinute: Math.max(0, num("xp.voice.per_minute", 20)),
  groupMax: Math.max(1, num("xp.voice.group.max_multiplier", 2)),
  night: Math.max(
    1,
    num("xp.night.message_multiplier", 1.5),
    num("xp.night.voice_multiplier", 1.5),
  ),
  sleepcall: Math.max(1, num("xp.sleepcall.multiplier", 2.5)),
  zenkai: Math.max(1, num("xp.zenkai.multiplier", 1.25)),
  booster: Math.max(1, num("xp.boost.boosters", 1.25)),
  fusionRatio: Math.max(0, num("xp.fusion.bonus_ratio", 0.1)),
  zeniPerLevel: Math.max(0, num("zeni.per_level", 1000)),
};
const raceMult = (race: RaceId | null, kind: "message" | "voice") =>
  race ? Math.max(0, num(`xp.race.${race}.${kind}`, RACE_DEFAULTS[race][kind])) : 1;

const roleBoost = new Map<string, number>();
for (const [k, v] of settings) {
  if (!k.startsWith("xp.boost.role.")) continue;
  const m = Number(v);
  if (Number.isFinite(m) && m > 0) roleBoost.set(k.slice("xp.boost.role.".length), m);
}

const ladders = Object.fromEntries(RACE_IDS.map((r) => [r, new Map<number, string>()])) as Record<
  RaceId,
  Map<number, string>
>;
for (const row of db
  .query<{ race: string; level: number; role_id: string }, []>(
    "select race, level, role_id from race_level_roles",
  )
  .all()) {
  if (isRace(row.race)) ladders[row.race].set(row.level, row.role_id);
}
const managedRoles = new Set<string>([
  ...RACE_IDS.flatMap((r) => [...ladders[r].values()]),
  ...RETIRED_REWARD_ROLES,
]);
const ladderUpTo = (race: RaceId, level: number) =>
  [...ladders[race]].filter(([lvl]) => lvl <= level).map(([, role]) => role);
const topLadderRole = (race: RaceId, level: number) => {
  let best: [number, string] | null = null;
  for (const [lvl, role] of ladders[race])
    if (lvl <= level && (!best || lvl > best[0])) best = [lvl, role];
  return best?.[1] ?? null;
};

interface Member {
  roles: string[];
  booster: boolean;
}
const members = new Map<string, Member>();
for (const m of db
  .query<{ user_id: string; role_ids: string; premium_since: number | null }, []>(
    "select user_id, role_ids, premium_since from discord_members",
  )
  .all()) {
  let roles: string[] = [];
  try {
    roles = JSON.parse(m.role_ids) as string[];
  } catch {}
  members.set(m.user_id, { roles, booster: m.premium_since != null });
}
const memberRace = (userId: string, stored: string | null): RaceId => {
  const m = members.get(userId);
  if (m) {
    for (const race of RACE_IDS) if (m.roles.includes(RACE_ROLE[race])) return race;
    return DEFAULT_LADDER_RACE;
  }
  return isRace(stored) ? stored : DEFAULT_LADDER_RACE;
};

/** Best legitimate role multiplier at `level`: ladder roles up to it, unmanaged boosted roles held, booster. */
const legitRoleMultiplier = (userId: string, ladderRace: RaceId, level: number) => {
  const m = members.get(userId);
  let best = m?.booster ? cfg.booster : 1;
  for (const role of ladderUpTo(ladderRace, level)) best = Math.max(best, roleBoost.get(role) ?? 1);
  for (const role of m?.roles ?? []) {
    if (!managedRoles.has(role)) best = Math.max(best, roleBoost.get(role) ?? 1);
  }
  return best;
};

interface User {
  id: string;
  xp: number;
  zeni: number;
  race: string | null;
  last_level_reached: number;
  current_level_role_id: string | null;
}
const ceilings = (u: User, ladderRace: RaceId, level: number) => {
  const race = isRace(u.race) ? u.race : null;
  const role = legitRoleMultiplier(u.id, ladderRace, level);
  const zenkai = race === "saiyan" ? cfg.zenkai : 1;
  const message =
    cfg.messageMax *
    Math.min(cfg.maxMultiplier, role * raceMult(race, "message") * zenkai * cfg.night);
  const voice =
    cfg.voicePerMinute *
    Math.min(
      cfg.maxMultiplier,
      role * raceMult(race, "voice") * zenkai * cfg.groupMax * Math.max(cfg.night, cfg.sleepcall),
    );
  return { message: Math.ceil(message), voice: Math.ceil(voice) };
};

const partners = new Map<string, string>();
for (const f of db
  .query<{ a: string; b: string }, []>("select user_a a, user_b b from fusions order by id")
  .all()) {
  partners.set(f.a, f.b);
  partners.set(f.b, f.a);
}

const run = () => {
  const startId = fromId ?? 0;
  if (fromId === null) {
    const done = db
      .query<{ n: number }, [string]>(
        "select count(*) n from action_logs where action = 'XP_ROLLBACK_PASS' and json_extract(meta, '$.from') = ?",
      )
      .get(process.env.FROM!)!.n;
    if (done > 0)
      throw new Error(`a rollback pass from ${process.env.FROM} already ran; use FROM_ID`);
  }

  const gains = db
    .query<{ id: number; user_id: string; meta: string }, [number, number]>(
      "select id, user_id, meta from action_logs where action = 'XP_GAIN' and id >= ? and created_at >= ? and user_id is not null order by id",
    )
    .all(startId, fromTime)
    .map((g) => {
      const m = JSON.parse(g.meta) as { amount?: number; source?: string };
      return {
        id: g.id,
        userId: g.user_id,
        amount: Math.max(0, Number(m.amount) || 0),
        source: m.source ?? "other",
      };
    });
  const lastId = gains.at(-1)?.id ?? startId - 1;
  const levelZeni = new Map<string, number>();
  for (const z of db
    .query<{ user_id: string; amount: number }, [number, number, number]>(
      `select user_id, sum(cast(json_extract(meta, '$.amount') as integer)) amount from action_logs
       where id >= ? and id <= ? and created_at >= ? and user_id is not null
         and ((action = 'ZENI_GAIN' and json_extract(meta, '$.source') = 'level') or action = 'ZENI_GAIN_LEVEL')
       group by user_id`,
    )
    .all(startId, Math.max(lastId, startId), fromTime)) {
    levelZeni.set(z.user_id, z.amount ?? 0);
  }

  const users = new Map(
    db
      .query<User, []>(
        "select id, xp, zeni, race, last_level_reached, current_level_role_id from users",
      )
      .all()
      .map((u) => [u.id, u]),
  );
  const byUser = Map.groupBy(gains, (g) => g.userId);

  // Pass 1 ignores fusion gains to size each partner's legitimate level.
  const replay = (withFusion: (userId: string) => number | null) => {
    const out = new Map<string, { start: number; legit: number; logged: number }>();
    for (const [userId, list] of byUser) {
      const u = users.get(userId);
      if (!u) continue;
      const logged = list.reduce((s, g) => s + g.amount, 0);
      const start = Math.max(0, u.xp - logged);
      const ladderRace = memberRace(userId, u.race);
      let legit = start;
      for (const g of list) {
        const ceil = ceilings(u, ladderRace, levelForXP(legit));
        let cap: number;
        if (g.source === "message") cap = ceil.message;
        else if (g.source === "voice") cap = ceil.voice;
        else if (g.source === "fusion") cap = withFusion(userId) ?? 0;
        else cap = g.amount;
        legit += Math.min(g.amount, cap);
      }
      out.set(userId, { start, legit, logged });
    }
    return out;
  };
  const first = replay(() => null);
  const final = replay((userId) => {
    const partner = partners.get(userId);
    const p = partner ? users.get(partner) : undefined;
    if (!partner || !p) return 0;
    const level = levelForXP(first.get(partner)?.legit ?? p.xp);
    return Math.ceil(cfg.fusionRatio * ceilings(p, memberRace(partner, p.race), level).voice);
  });

  const now = Date.now();
  const setUser = db.query(
    "update users set xp = ?2, zeni = ?3, last_level_reached = ?4, current_level_role_id = ?5, updated_at = ?6 where id = ?1",
  );
  const setLevel = db.query(
    "update users set last_level_reached = ?2, current_level_role_id = ?3 where id = ?1",
  );
  const log = db.query(
    "insert into action_logs (user_id, moderator_id, action, reason, meta, created_at) values (?1, null, ?2, ?3, ?4, ?5)",
  );
  const reason = "XP inflation rollback (wrong multiplier roles, 2026-10-22/23)";
  const changes: Record<string, unknown>[] = [];
  let xpRemoved = 0;
  let zeniRemoved = 0;
  let levelsFixed = 0;

  for (const u of users.values()) {
    const r = final.get(u.id);
    const excess = r ? Math.min(u.xp, Math.max(0, r.logged - (r.legit - r.start))) : 0;
    const xp = Math.max(0, u.xp - excess);
    const level = levelForXP(xp);
    const ladderRace = memberRace(u.id, u.race);
    const tier = topLadderRole(ladderRace, level);
    let zeni = u.zeni;
    let zeniExcess = 0;
    if (r) {
      const legitLevels = Math.max(0, level - levelForXP(r.start));
      zeniExcess = Math.max(0, (levelZeni.get(u.id) ?? 0) - legitLevels * cfg.zeniPerLevel);
      zeni = Math.max(0, u.zeni - zeniExcess);
    }
    if (excess > 0 || zeniExcess > 0) {
      xpRemoved += excess;
      zeniRemoved += u.zeni - zeni;
      changes.push({
        id: u.id,
        xp: [u.xp, xp],
        level: [u.last_level_reached, level],
        zeni: [u.zeni, zeni],
      });
      if (apply) {
        setUser.run(u.id, xp, zeni, level, tier, now);
        log.run(
          u.id,
          "XP_ROLLBACK",
          reason,
          JSON.stringify({
            xpBefore: u.xp,
            xpAfter: xp,
            zeniBefore: u.zeni,
            zeniAfter: zeni,
            fromId: startId,
            toId: lastId,
          }),
          now,
        );
      }
    } else if (u.last_level_reached !== level || u.current_level_role_id !== tier) {
      levelsFixed++;
      if (apply) setLevel.run(u.id, level, tier);
    }
  }

  let flags = 0;
  if (apply) {
    flags = db
      .query(
        `update economy_flags set status = 'resolved', resolved_at = ?1, resolved_by = 'xp-rollback',
           resolve_note = 'Excess XP rolled back (wrong multiplier roles)'
         where code = 'XP_SPIKE' and status = 'open'`,
      )
      .run(now).changes;
    log.run(
      null,
      "XP_ROLLBACK_PASS",
      reason,
      JSON.stringify({
        from: process.env.FROM,
        fromId: startId,
        toId: lastId,
        members: changes.length,
        xpRemoved,
        zeniRemoved,
      }),
      now,
    );
  }

  changes.sort(
    (a, b) =>
      (b.xp as number[])[0] -
      (b.xp as number[])[1] -
      ((a.xp as number[])[0] - (a.xp as number[])[1]),
  );
  console.log(
    JSON.stringify(
      {
        apply,
        fromId: startId,
        toId: lastId,
        gains: gains.length,
        members: changes.length,
        xpRemoved,
        zeniRemoved,
        levelsFixed,
        flagsClosed: flags,
        top: changes.slice(0, 25),
      },
      null,
      1,
    ),
  );
};

if (apply) db.transaction(run)();
else run();
