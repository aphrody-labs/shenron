/**
 * Multiplicateurs d'XP : rôle ou booster, race et Zenkai, vocal à plusieurs,
 * boost de nuit et sleepcall.
 *
 * La configuration est lue une fois par passage (`loadXpBoostConfig`) puis
 * passée aux calculs, qui restent purs et testables sans base ni Discord.
 * Chaque valeur vit dans `guild_settings` (clés `xp.*`) et s'édite depuis la
 * page admin des niveaux ; les défauts ci-dessous s'appliquent sinon.
 *
 * Ordre d'application d'un gain vocal :
 *   base × min(plafond, rôle × race × Zenkai × groupe × nuit|sleepcall) × statut micro
 * Le statut micro (coupé, casque coupé) réduit le gain après le plafond ; en
 * sleepcall il ne réduit rien, puisqu'on y dort.
 */
import type { Guild } from "discord.js";
import {
  RACE_IDS,
  RACES,
  ZENKAI_MULT,
  getRace,
  regenTuning,
  type RaceId,
} from "@aphrody/shenron-config/races";
import {
  FUSION_XP_BONUS_RATIO,
  XP_MESSAGE_COOLDOWN_MS,
  XP_PER_MESSAGE_MAX,
  XP_PER_MESSAGE_MIN,
  XP_PER_VOICE_TICK,
  XP_VOICE_TICK_MS,
} from "~/lib/constants";

export type VoiceStatus = "open" | "muted" | "deafened";

export interface VoicePresence {
  userId: string;
  status: VoiceStatus;
}

export interface XpBoostConfig {
  voice: { minMembers: number; mutedRatio: number; deafenedRatio: number };
  group: { bonusPerMember: number; maxMultiplier: number };
  night: {
    enabled: boolean;
    startHour: number;
    endHour: number;
    timezone: string;
    voiceMultiplier: number;
    messageMultiplier: number;
  };
  sleepcall: {
    enabled: boolean;
    minMembers: number;
    multiplier: number;
    announce: boolean;
    /** Creux toléré avant de clore un sleepcall, la nuit. */
    graceMinutes: number;
    /** Durée minimale pour publier le bilan et journaliser. */
    summaryMinMinutes: number;
  };
  zenkai: { multiplier: number; minutes: number };
  race: Record<RaceId, { message: number; voice: number }>;
  maxMultiplier: number;
}

export const DEFAULT_XP_BOOST_CONFIG: XpBoostConfig = {
  // Seul en vocal, micro coupé : on gagne quand même. Le seuil de 2 membres et
  // le casque coupé à 0 XP (12/09/2026) avaient vidé le vocal de ses gains.
  voice: { minMembers: 1, mutedRatio: 1, deafenedRatio: 0.5 },
  group: { bonusPerMember: 0.1, maxMultiplier: 2 },
  night: {
    enabled: true,
    startHour: 0,
    endHour: 7,
    timezone: "Europe/Paris",
    voiceMultiplier: 1.5,
    messageMultiplier: 1.5,
  },
  sleepcall: {
    enabled: true,
    minMembers: 2,
    multiplier: 2.5,
    announce: true,
    graceMinutes: 5,
    summaryMinMinutes: 15,
  },
  zenkai: { multiplier: ZENKAI_MULT, minutes: 60 },
  race: Object.fromEntries(
    RACE_IDS.map((id) => [id, { message: RACES[id].xpMessage, voice: RACES[id].xpVoice }]),
  ) as XpBoostConfig["race"],
  maxMultiplier: 10,
};

/** Lecture typée des réglages : `SettingsService` la satisfait. */
export interface SettingsReader {
  getInt(key: string, fallback: number): Promise<number>;
  getFloat(key: string, fallback: number): Promise<number>;
  getBool(key: string, fallback: boolean): Promise<boolean>;
  getString(key: string, fallback: string): Promise<string>;
}

const nonNegative = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
const ratio = (n: number) => Math.min(1, nonNegative(n));
const hour = (n: number) => ((Math.trunc(n) % 24) + 24) % 24;

export async function loadXpBoostConfig(s: SettingsReader): Promise<XpBoostConfig> {
  const d = DEFAULT_XP_BOOST_CONFIG;
  const race = {} as XpBoostConfig["race"];
  for (const id of RACE_IDS) {
    race[id] = {
      message: nonNegative(await s.getFloat(`xp.race.${id}.message`, d.race[id].message)),
      voice: nonNegative(await s.getFloat(`xp.race.${id}.voice`, d.race[id].voice)),
    };
  }
  return {
    voice: {
      minMembers: Math.max(1, await s.getInt("xp.voice.min_members", d.voice.minMembers)),
      mutedRatio: ratio(await s.getFloat("xp.voice.muted_ratio", d.voice.mutedRatio)),
      deafenedRatio: ratio(await s.getFloat("xp.voice.deafened_ratio", d.voice.deafenedRatio)),
    },
    group: {
      bonusPerMember: nonNegative(
        await s.getFloat("xp.voice.group.bonus_per_member", d.group.bonusPerMember),
      ),
      maxMultiplier: Math.max(
        1,
        await s.getFloat("xp.voice.group.max_multiplier", d.group.maxMultiplier),
      ),
    },
    night: {
      enabled: await s.getBool("xp.night.enabled", d.night.enabled),
      startHour: hour(await s.getInt("xp.night.start_hour", d.night.startHour)),
      endHour: hour(await s.getInt("xp.night.end_hour", d.night.endHour)),
      timezone:
        (await s.getString("xp.night.timezone", d.night.timezone)).trim() || d.night.timezone,
      voiceMultiplier: nonNegative(
        await s.getFloat("xp.night.voice_multiplier", d.night.voiceMultiplier),
      ),
      messageMultiplier: nonNegative(
        await s.getFloat("xp.night.message_multiplier", d.night.messageMultiplier),
      ),
    },
    sleepcall: {
      enabled: await s.getBool("xp.sleepcall.enabled", d.sleepcall.enabled),
      minMembers: Math.max(2, await s.getInt("xp.sleepcall.min_members", d.sleepcall.minMembers)),
      multiplier: nonNegative(await s.getFloat("xp.sleepcall.multiplier", d.sleepcall.multiplier)),
      announce: await s.getBool("xp.sleepcall.announce", d.sleepcall.announce),
      graceMinutes: nonNegative(
        await s.getInt("xp.sleepcall.grace_minutes", d.sleepcall.graceMinutes),
      ),
      summaryMinMinutes: nonNegative(
        await s.getInt("xp.sleepcall.summary_min_minutes", d.sleepcall.summaryMinMinutes),
      ),
    },
    zenkai: {
      multiplier: nonNegative(await s.getFloat("xp.zenkai.multiplier", d.zenkai.multiplier)),
      minutes: nonNegative(await s.getInt("xp.zenkai.minutes", d.zenkai.minutes)),
    },
    race,
    maxMultiplier: Math.max(1, await s.getFloat("xp.multiplier.max", d.maxMultiplier)),
  };
}

// ── Nuit ──────────────────────────────────────────────────────────────────

const hourFormats = new Map<string, Intl.DateTimeFormat>();

/** Heure locale (0-23) dans le fuseau donné ; UTC si le fuseau est inconnu. */
export function localHour(now: number, timeZone: string): number {
  let fmt = hourFormats.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone });
    } catch {
      return new Date(now).getUTCHours();
    }
    hourFormats.set(timeZone, fmt);
  }
  return hour(Number.parseInt(fmt.format(now), 10));
}

/** Fenêtre horaire [début, fin[ qui peut passer minuit (22 → 7). Début = fin : jamais. */
export function isHourInWindow(h: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export function isNight(now: number, cfg: XpBoostConfig): boolean {
  if (!cfg.night.enabled) return false;
  return isHourInWindow(localHour(now, cfg.night.timezone), cfg.night.startHour, cfg.night.endHour);
}

// ── Vocal ─────────────────────────────────────────────────────────────────

/** Statut micro d'un membre ; `null` s'il est coupé par un modérateur (sanction, pas d'XP). */
export function voiceStatusOf(state: {
  selfMute: boolean | null;
  selfDeaf: boolean | null;
  mute: boolean | null;
  deaf: boolean | null;
}): VoiceStatus | null {
  if (state.mute || state.deaf) return null;
  if (state.selfDeaf) return "deafened";
  if (state.selfMute) return "muted";
  return "open";
}

export function statusRatio(status: VoiceStatus, cfg: XpBoostConfig): number {
  if (status === "muted") return cfg.voice.mutedRatio;
  if (status === "deafened") return cfg.voice.deafenedRatio;
  return 1;
}

/**
 * Membres humains présents par salon vocal, hors salon AFK, hub des vocaux
 * éphémères et membres coupés par un modérateur.
 */
export function voicePresencesByChannel(
  guild: Guild,
  hubId?: string | null,
): Map<string, VoicePresence[]> {
  const byChannel = new Map<string, VoicePresence[]>();
  for (const state of guild.voiceStates.cache.values()) {
    const channel = state.channel;
    if (!channel) continue;
    if (channel.id === guild.afkChannelId || (hubId && channel.id === hubId)) continue;
    const member = state.member ?? guild.members.cache.get(state.id);
    if (!member || member.user.bot) continue;
    const status = voiceStatusOf(state);
    if (!status) continue;
    const list = byChannel.get(channel.id) ?? [];
    list.push({ userId: state.id, status });
    byChannel.set(channel.id, list);
  }
  return byChannel;
}

export interface VoiceChannelContext {
  night: boolean;
  sleepcall: boolean;
  /** Membres qui gagnent de l'XP dans ce salon ; vide si le salon ne rapporte rien. */
  earners: VoicePresence[];
}

/**
 * Qui gagne dans un salon. La nuit, à partir de `sleepcall.minMembers`
 * présents, le salon passe en sleepcall : tout le monde gagne, micro et casque
 * coupés compris. Sinon seuls comptent les statuts dont la part est > 0, et le
 * salon ne rapporte qu'à partir de `voice.minMembers` d'entre eux.
 */
export function voiceChannelContext(
  presences: readonly VoicePresence[],
  cfg: XpBoostConfig,
  now: number,
): VoiceChannelContext {
  const night = isNight(now, cfg);
  const sleepcall = night && cfg.sleepcall.enabled && presences.length >= cfg.sleepcall.minMembers;
  const earners = presences.filter((p) => sleepcall || statusRatio(p.status, cfg) > 0);
  if (earners.length < cfg.voice.minMembers) return { night, sleepcall: false, earners: [] };
  return { night, sleepcall, earners };
}

/** +`bonusPerMember` par membre au-delà du premier, plafonné à `maxMultiplier`. */
export function groupMultiplier(members: number, cfg: XpBoostConfig): number {
  const bonus = 1 + cfg.group.bonusPerMember * Math.max(0, members - 1);
  return Math.min(cfg.group.maxMultiplier, bonus);
}

// ── Assemblage ────────────────────────────────────────────────────────────

interface XpBoostPart {
  label: string;
  value: number;
}

export interface XpBoost {
  /** Multiplicateur final à appliquer au gain de base. */
  total: number;
  /** Facteurs ≠ 1, dans l'ordre d'application. */
  parts: XpBoostPart[];
  /** Le produit des facteurs dépassait le plafond. */
  capped: boolean;
}

/**
 * Best multiplier among the boosted roles and the booster boost (they do not stack).
 * `isEntitled` drops a role the member is not yet entitled to: a tier role held above
 * the member's level multiplies nothing (see `tierEntitlement`).
 */
export function bestRoleMultiplier(
  hasRole: (roleId: string) => boolean,
  roleBoosts: ReadonlyArray<{ roleId: string; multiplier: number }>,
  boosterMultiplier: number,
  isEntitled: (roleId: string) => boolean = () => true,
): number {
  let best = Math.max(1, boosterMultiplier);
  for (const b of roleBoosts) {
    if (b.multiplier > best && hasRole(b.roleId) && isEntitled(b.roleId)) best = b.multiplier;
  }
  return best;
}

interface BoostInput {
  roleMultiplier: number;
  race: string | null | undefined;
  raceBoostUntil: number;
  now: number;
}

function commonParts(input: BoostInput, kind: "message" | "voice", cfg: XpBoostConfig) {
  const parts: XpBoostPart[] = [];
  const push = (label: string, value: number) => {
    if (value !== 1) parts.push({ label, value });
  };
  push("Rôle ou booster", input.roleMultiplier);
  const race = getRace(input.race);
  if (race) {
    push(`Race ${race.name}`, cfg.race[race.id][kind]);
    if (race.zenkai && input.raceBoostUntil > input.now) push("Zenkai", cfg.zenkai.multiplier);
  }
  return { parts, push };
}

function finish(parts: XpBoostPart[], cfg: XpBoostConfig): XpBoost {
  const product = parts.reduce((m, p) => m * p.value, 1);
  return {
    total: Math.min(product, cfg.maxMultiplier),
    parts,
    capped: product > cfg.maxMultiplier,
  };
}

export function messageBoost(input: BoostInput, cfg: XpBoostConfig): XpBoost {
  const { parts, push } = commonParts(input, "message", cfg);
  if (isNight(input.now, cfg)) push("Nuit", cfg.night.messageMultiplier);
  return finish(parts, cfg);
}

export function voiceBoost(
  input: BoostInput & { status: VoiceStatus; channel: VoiceChannelContext },
  cfg: XpBoostConfig,
): XpBoost {
  const { parts, push } = commonParts(input, "voice", cfg);
  push("Vocal à plusieurs", groupMultiplier(input.channel.earners.length, cfg));
  if (input.channel.sleepcall) push("Sleepcall", cfg.sleepcall.multiplier);
  else if (input.channel.night) push("Nuit", cfg.night.voiceMultiplier);
  const boost = finish(parts, cfg);
  if (input.channel.sleepcall) return boost;
  const share = statusRatio(input.status, cfg);
  if (share === 1) return boost;
  return {
    total: boost.total * share,
    parts: [
      ...boost.parts,
      { label: input.status === "muted" ? "Micro coupé" : "Casque coupé", value: share },
    ],
    capped: boost.capped,
  };
}

/** `×2,5` */
export function formatMultiplier(n: number): string {
  return `×${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`;
}

// ── Gains de base ─────────────────────────────────────────────────────────

/** Gain de base d'un message et cooldown (`xp.message.*`), lus en un seul endroit. */
export async function loadMessageXpConfig(
  s: SettingsReader,
): Promise<{ min: number; max: number; cooldownMs: number }> {
  const min = Math.max(0, await s.getInt("xp.message.min", XP_PER_MESSAGE_MIN));
  const max = Math.max(min, await s.getInt("xp.message.max", XP_PER_MESSAGE_MAX));
  const cooldownMs = Math.max(0, await s.getInt("xp.message.cooldown_ms", XP_MESSAGE_COOLDOWN_MS));
  return { min, max, cooldownMs };
}

/**
 * Gain vocal de base avant bonus. `xp.voice.per_minute` (0 = non réglé) est
 * converti par tick ; sinon `XP_PER_VOICE_TICK`. `/boosts` et le tick vocal
 * lisent cette même valeur.
 */
export async function loadVoiceBaseGain(
  s: SettingsReader,
): Promise<{ perTick: number; perMinute: number }> {
  const perMinute = await s.getInt("xp.voice.per_minute", 0);
  const perTick =
    perMinute > 0
      ? Math.max(1, Math.round((perMinute * XP_VOICE_TICK_MS) / 60_000))
      : XP_PER_VOICE_TICK;
  return { perTick, perMinute: Math.round((perTick * 60_000) / XP_VOICE_TICK_MS) };
}

// ── Hard limits ─────────────────────────────────────────────────────────────

/** Largest multiplier a boosted role can carry, whatever `xp.multiplier.max` says. */
export const XP_BOOST_ROLE_CAP = 100_000;

/**
 * Largest multiplier we accept on a role: the cumulative cap `xp.multiplier.max` (a higher
 * boost would only ever be clipped), and never more than {@link XP_BOOST_ROLE_CAP}.
 * Cyborg/mutant roles set to x10,000,000 through `/config xp-boost-set` went unnoticed
 * under the cumulative cap.
 */
export function roleBoostLimit(maxMultiplier: number): number {
  return Math.min(
    XP_BOOST_ROLE_CAP,
    Math.max(1, Number.isFinite(maxMultiplier) ? maxMultiplier : 1),
  );
}

/** Where an XP gain comes from (the ceiling depends on the source). */
export type XpGainSource = "message" | "voice" | "game" | "fusion" | "admin" | "other";

export interface XpGainLimits {
  /** Largest gain of one message (regeneration included), multiplier cap applied. */
  message: number;
  /** Largest gain of one voice tick, multiplier cap applied. */
  voice: number;
  /** Total a member can receive over 60 s, fusion shares included. */
  perMinute: number;
}

/**
 * Limits derived from the ACTIVE configuration: nothing the game can legitimately produce
 * exceeds them, anything above is an anomaly (stacking multiplier, loop, call without a
 * source). Unlike the former fixed 5 M threshold they follow the settings: in production
 * (message <= 500, voice 10,000/min, cap x100,000) a normal gain exceeded 5 M and raised a
 * flag on every message.
 */
export function xpGainLimits(input: {
  messageMax: number;
  messageCooldownMs: number;
  regenXp: number;
  voicePerTick: number;
  maxMultiplier: number;
  fusionRatio: number;
}): XpGainLimits {
  const mult = Math.max(1, input.maxMultiplier);
  const message = Math.ceil(Math.max(0, input.messageMax + input.regenXp) * mult);
  const voice = Math.ceil(Math.max(0, input.voicePerTick) * mult);
  // At most one gain per cooldown (never more than one per second), two voice ticks of margin.
  const messages = Math.ceil(60_000 / Math.max(1_000, input.messageCooldownMs)) + 1;
  const own = 2 * voice + messages * message;
  const share = 1 + Math.min(1, Math.max(0, input.fusionRatio));
  return { message, voice, perMinute: Math.ceil(own * share) };
}

/** Ceiling of a single gain by source. `admin` has none. */
export function singleGainCeiling(limits: XpGainLimits, source: XpGainSource): number {
  if (source === "admin") return Number.POSITIVE_INFINITY;
  if (source === "message") return limits.message;
  if (source === "voice") return limits.voice;
  return Math.max(limits.message, limits.voice);
}

/**
 * Reads the active limits. `xp.gain.max_single` and `xp.gain.max_per_minute` (and the
 * former `anticheat.xp.max_single`) can only TIGHTEN the derived limits; 0 or unset
 * means no manual limit.
 */
export async function loadXpGainLimits(s: SettingsReader): Promise<XpGainLimits> {
  const message = await loadMessageXpConfig(s);
  const voice = await loadVoiceBaseGain(s);
  const derived = xpGainLimits({
    messageMax: message.max,
    messageCooldownMs: message.cooldownMs,
    regenXp: regenTuning().xp,
    voicePerTick: voice.perTick,
    maxMultiplier: await s.getFloat("xp.multiplier.max", DEFAULT_XP_BOOST_CONFIG.maxMultiplier),
    fusionRatio: await s.getFloat("xp.fusion.bonus_ratio", FUSION_XP_BONUS_RATIO),
  });
  const manualSingle =
    (await s.getInt("xp.gain.max_single", 0)) || (await s.getInt("anticheat.xp.max_single", 0));
  const manualMinute = await s.getInt("xp.gain.max_per_minute", 0);
  const tighten = (limit: number, manual: number) => (manual > 0 ? Math.min(limit, manual) : limit);
  return {
    message: tighten(derived.message, manualSingle),
    voice: tighten(derived.voice, manualSingle),
    perMinute: tighten(derived.perMinute, manualMinute),
  };
}

/**
 * Sliding window of gains per member: what can still be granted over the last `windowMs`
 * ms. In memory (a restart starts from zero).
 */
export class XpRateWindow {
  private readonly entries = new Map<string, Array<{ at: number; amount: number }>>();
  private calls = 0;

  constructor(private readonly windowMs = 60_000) {}

  /** Grants at most `cap` over the window and records what is granted. */
  take(userId: string, amount: number, cap: number, now = Date.now()): number {
    if (++this.calls % 1_000 === 0) this.prune(now);
    const live = (this.entries.get(userId) ?? []).filter((e) => now - e.at < this.windowMs);
    const used = live.reduce((sum, e) => sum + e.amount, 0);
    const granted = Math.max(0, Math.min(amount, cap - used));
    if (granted > 0) live.push({ at: now, amount: granted });
    if (live.length > 0) this.entries.set(userId, live);
    else this.entries.delete(userId);
    return granted;
  }

  private prune(now: number) {
    for (const [id, list] of this.entries) {
      if (list.every((e) => now - e.at >= this.windowMs)) this.entries.delete(id);
    }
  }
}
