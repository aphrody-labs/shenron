import type { GuildMember } from "discord.js";
import { RACE_IDS, RACES, isRaceId, type RaceId } from "~/lib/races";
import type { DB } from "~/db/index";
import { raceLevelRoles } from "~/db/schema";
import { logger } from "~/lib/logger";

/**
 * Tier-role ("transformation") ladder PER RACE.
 *
 * Each race has its own series of tier roles granted as members level up. When a member
 * changes race, the tier roles of the other races are REMOVED and those of the current
 * race are (re)granted up to their level (see LevelService.syncRaceLevelRoles).
 *
 * The runtime SOURCE OF TRUTH is the `race_level_roles` table (editable from the admin
 * dashboard), loaded into the module cache by `loadRaceLevelRoles(db)` at boot and
 * re-read by `reloadRaceLevelRoles()`. That table is NEVER filled automatically: an empty
 * table means "no tier", and the boot says so. The automatic seeding of an old ladder
 * (levels 1 to 10) slipped ten low-level tier roles into the table during the 2026-10-22
 * incident; the real ladder was then restored on top without erasing them, so every Saiyan
 * of level 10 received "Perfect Ultra Instinct" (and its XP multiplier).
 *
 * `RACE_LEVEL_ROLES` = canonical Saiyan ladder, used only while the DB cache is not
 * hydrated (standalone scripts, tests). The OTHER races are empty here: their ladder lives
 * in the table. As long as a race has no configured tiers, the sync does NOT remove its
 * existing roles (see hasRaceLadder).
 *
 * bun:sqlite is SYNCHRONOUS, so this module's public API stays synchronous (no async).
 */
export const RACE_LEVEL_ROLES: Record<RaceId, Partial<Record<number, string>>> = {
  saiyan: {
    2: "1058910827438162013", // Ozaru
    5: "1058910859918852179", // Zenkaï
    8: "1058910891124457482", // Kaioken
    15: "1058910426164908075", // Super Saiyan
    20: "1058910477847109743", // Super Saiyan 2
    30: "1058910518720593920", // Super Saiyan 3
    32: "1058910743736614962", // Super Saiyan God
    35: "1058910776687087637", // Super Saiyan Blue
    38: "1074614931485380608", // Super Saiyan Blue Kaioken
    40: "1074616052350193674", // Ultra Instinct
    42: "944191790498586634", // Mastered Ultra Instinct
    45: "1074619485450932304", // Perfect Ultra Instinct
    48: "1158488237019504680", // Super Ozaru
    50: "1058910672068563024", // Super Saiyan 4
  },
  // Vides par défaut — complétées par l'admin via le dashboard (table race_level_roles) :
  humain: {},
  namek: {},
  mutant: {},
  cyborg: {},
  majin: {},
};

/**
 * Fallback race for tier attribution when no race role is set (intended design since the
 * integration: a member without a race follows the Saiyan ladder).
 */
export const DEFAULT_LEVEL_RACE: RaceId = "saiyan";

const ROLE_TO_RACE = new Map<string, RaceId>(RACE_IDS.map((id) => [RACES[id].roleId, id]));

type Ladder = Partial<Record<number, string>>;
type RaceLadders = Record<RaceId, Ladder>;

/**
 * Cache runtime des échelles par race (source = table `race_level_roles`).
 * `null` tant que `loadRaceLevelRoles` n'a pas tourné → on retombe sur
 * `RACE_LEVEL_ROLES` (défaut), ce qui garde les scripts standalone + tests purs.
 */
let cache: RaceLadders | null = null;
let dbRef: DB | null = null;

/** Échelles effectives : cache DB si hydraté, sinon défaut. */
function ladders(): RaceLadders {
  return cache ?? RACE_LEVEL_ROLES;
}

function emptyLadders(): RaceLadders {
  return { saiyan: {}, humain: {}, namek: {}, mutant: {}, cyborg: {}, majin: {} };
}

/** Ladder row hidden by a duplicate of the same role at a higher level. */
export interface ShadowedTier {
  level: number;
  roleId: string;
  /** Level at which the role is actually granted. */
  keptLevel: number;
}

/**
 * A tier role belongs to ONE level only. When it appears at several levels of the same
 * ladder, the highest wins: the lower levels are leftovers (old seed, move without
 * deletion) that would open a high tier at a low level. Pure: returns the normalized
 * ladder and the hidden rows.
 */
export function normalizeLadder(ladder: Ladder): { ladder: Ladder; shadowed: ShadowedTier[] } {
  const highest = new Map<string, number>();
  for (const [lvl, roleId] of Object.entries(ladder)) {
    if (!roleId) continue;
    const level = Number(lvl);
    if (level > (highest.get(roleId) ?? -Infinity)) highest.set(roleId, level);
  }
  const out: Ladder = {};
  const shadowed: ShadowedTier[] = [];
  for (const [lvl, roleId] of Object.entries(ladder)) {
    if (!roleId) continue;
    const level = Number(lvl);
    const keptLevel = highest.get(roleId)!;
    if (level === keptLevel) out[level] = roleId;
    else shadowed.push({ level, roleId, keptLevel });
  }
  return { ladder: out, shadowed: shadowed.toSorted((a, b) => a.level - b.level) };
}

/**
 * Conflict that `roleId` at `level` would introduce: the same role already sits at ANOTHER
 * level of the same ladder. `null` when the write is consistent.
 */
export function findLadderConflict(
  ladder: Ladder,
  level: number,
  roleId: string,
): { level: number } | null {
  for (const [lvl, existing] of Object.entries(ladder)) {
    if (existing === roleId && Number(lvl) !== level) return { level: Number(lvl) };
  }
  return null;
}

/** Currently active ladder of a race (copy; DB cache or default). */
export function raceLadder(race: RaceId): Ladder {
  return { ...ladders()[race] };
}

/** (Re)lit la table `race_level_roles` dans le cache module. */
function rebuildCache(): number {
  if (!dbRef) return 0;
  const rows = dbRef.select().from(raceLevelRoles).all();
  const next = emptyLadders();
  for (const row of rows) {
    if (isRaceId(row.race)) next[row.race][row.level] = row.roleId;
  }
  for (const race of RACE_IDS) {
    const { ladder, shadowed } = normalizeLadder(next[race]);
    next[race] = ladder;
    if (shadowed.length > 0) {
      logger.error(
        { race, shadowed },
        "race_level_roles: same role at several levels, only the highest is kept — delete the hidden rows",
      );
    }
  }
  cache = next;
  return rows.length;
}

/**
 * Hydrates the tier-role cache from the DB. Call AT BOOT, AFTER the migrations and BEFORE
 * any level-up / role sync. NEVER seeds anything: an empty table means no tier is granted
 * (and the log says so). Synchronous (bun:sqlite).
 */
export function loadRaceLevelRoles(db: DB): void {
  dbRef = db;
  if (rebuildCache() === 0) {
    logger.error(
      "race_level_roles is empty: no tier role will be granted (restore the table, nothing is seeded)",
    );
  }
}

/** Re-lit la table `race_level_roles` dans le cache (appelé par l'API après une écriture). */
export function reloadRaceLevelRoles(): void {
  rebuildCache();
}

/** true ssi la race possède au moins un palier de rôle configuré. */
export function hasRaceLadder(race: RaceId): boolean {
  return Object.values(ladders()[race]).some((r) => !!r);
}

/** Tous les rôles de transformation configurés, toutes races confondues (pour le nettoyage). */
export function allRaceLevelRoleIds(): string[] {
  const l = ladders();
  return RACE_IDS.flatMap((id) => Object.values(l[id]).filter((r): r is string => !!r));
}

/** Tous les rôles de palier d'une race, quel que soit le niveau. */
export function raceLadderRoleIds(race: RaceId): string[] {
  return Object.values(ladders()[race]).filter((r): r is string => !!r);
}

/** Rôles de palier d'une race jusqu'au niveau `uptoLevel` inclus. */
export function raceLevelRoleIds(race: RaceId, uptoLevel: number): string[] {
  const out: string[] = [];
  for (const [lvl, roleId] of Object.entries(ladders()[race]).toSorted(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    if (roleId && Number(lvl) <= uptoLevel) out.push(roleId);
  }
  return out;
}

/** Rôle de palier attribué exactement au niveau `level` d'une race (ou null). */
export function raceLevelRoleAt(race: RaceId, level: number): string | null {
  return ladders()[race][level] ?? null;
}

/**
 * Level from which a tier role is granted, or null when it is not a tier role. With `race`,
 * that race's ladder wins; otherwise (or when the role is not in it) the lowest level at
 * which any ladder grants it.
 */
export function levelOfRoleId(roleId: string, race?: RaceId | null): number | null {
  const l = ladders();
  const search = (id: RaceId): number | null => {
    for (const [lvl, rid] of Object.entries(l[id])) {
      if (rid === roleId) return Number(lvl);
    }
    return null;
  };
  if (race) {
    const own = search(race);
    if (own !== null) return own;
  }
  let lowest: number | null = null;
  for (const id of RACE_IDS) {
    const found = search(id);
    if (found !== null && (lowest === null || found < lowest)) lowest = found;
  }
  return lowest;
}

/**
 * A tier role only gives its XP multiplier from the level at which the ladder grants it. A
 * tier granted too early (wrong ladder, hand-given role, leftover not yet removed) earns
 * nothing until the level is reached: this is what prevented "Perfect Ultra Instinct
 * x32,000" at level 17. A role outside the ladder (booster, event) is always eligible.
 */
export function tierEntitlement(
  level: number,
  race: RaceId | null | undefined,
): (roleId: string) => boolean {
  return (roleId) => {
    const required = levelOfRoleId(roleId, race);
    return required === null || level >= required;
  };
}

/** Race effective d'un membre = la race dont il porte le rôle Discord, sinon null. */
export function memberRaceId(member: GuildMember): RaceId | null {
  for (const [roleId, race] of ROLE_TO_RACE) {
    if (member.roles.cache.has(roleId)) return race;
  }
  return null;
}

/** Gap between a member's tier roles and the ones their level entitles them to. */
export interface TierPlan {
  /** Roles of their race their level entitles them to. */
  entitled: string[];
  /** To grant: entitlements not held. */
  add: string[];
  /** To remove: tiers of their race ABOVE their level. */
  above: string[];
  /** To remove: tiers of ANOTHER race (or of any race when they have none). */
  foreign: string[];
}

/**
 * Pure alignment plan of the tier roles. Without a race (`null`) no tier is due and all
 * the ones held are foreign; the caller passes the effective race (race role, else
 * {@link DEFAULT_LEVEL_RACE}).
 */
export function planTierRoles(input: {
  race: RaceId | null;
  level: number;
  has: (roleId: string) => boolean;
}): TierPlan {
  const { race, level, has } = input;
  const entitled = race ? raceLevelRoleIds(race, level) : [];
  const own = new Set(race ? raceLadderRoleIds(race) : []);
  const entitledSet = new Set(entitled);
  return {
    entitled,
    add: entitled.filter((r) => !has(r)),
    above: [...own].filter((r) => !entitledSet.has(r) && has(r)),
    foreign: [...new Set(allRaceLevelRoleIds())].filter((r) => !own.has(r) && has(r)),
  };
}
