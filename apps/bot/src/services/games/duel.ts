/**
 * Shared plumbing of the Discord mini-games (morpion, pendu, bingo, pfc).
 *
 * Each game used to carry its own copy of the challenge map, the
 * accept/decline checks, the duel stake validation, the "one game per player"
 * set and the result lines of a reward. The copies had drifted: only the
 * morpion enforced `game.max_stake`, the pendu and bingo did not; the casino
 * log lost the game name on half of the wins. One implementation now.
 */
import {
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Message,
  type MessageCreateOptions,
  type SendableChannels,
  type User,
} from "discord.js";
import { COLORS, DBZ_COLORS } from "~/lib/embeds";
import type { GameXpGrant } from "~/lib/game-xp";
import { formatNumber, t, type BotLang } from "~/lib/i18n";
import { logger } from "~/lib/logger";
import { formatZeni, formatZeniDelta } from "@aphrody/shenron-config/zeni";
import { REWARD_BLOCK_LABELS, type RewardBlock } from "./anti-farm";

export const CHALLENGE_TTL_MS = 60_000;
export const DUEL_MAX_STAKE_DEFAULT = 1_000_000;

// ─── Challenges ───────────────────────────────────────────────────────────

export interface ChallengeParties {
  challengerId: string;
  opponentId: string;
}

export type ChallengeTake<T> =
  | { kind: "missing" }
  | { kind: "not-addressed" }
  | { kind: "accepted"; challenge: T }
  | { kind: "declined"; challenge: T }
  | { kind: "withdrawn"; challenge: T };

/**
 * Pending duel proposals, keyed by the slash interaction id.
 *
 * `take` removes the challenge synchronously before any `await` of the caller:
 * a double click (or the opponent and the challenger clicking together) can
 * never start two games from the same proposal.
 */
export class ChallengeBoard<T extends ChallengeParties> {
  private readonly pending = new Map<string, { challenge: T; expiresAt: number }>();

  constructor(private readonly ttlMs = CHALLENGE_TTL_MS) {}

  open(key: string, challenge: T, now = Date.now()): void {
    this.pending.set(key, { challenge, expiresAt: now + this.ttlMs });
    setTimeout(() => {
      const entry = this.pending.get(key);
      if (entry && entry.expiresAt <= Date.now()) this.pending.delete(key);
    }, this.ttlMs + 5_000).unref?.();
  }

  /** Whether `userId` is part of a proposal still open. */
  involves(userId: string, now = Date.now()): boolean {
    for (const { challenge, expiresAt } of this.pending.values()) {
      if (expiresAt <= now) continue;
      if (challenge.challengerId === userId || challenge.opponentId === userId) return true;
    }
    return false;
  }

  take(
    key: string,
    userId: string,
    action: "accept" | "decline",
    now = Date.now(),
  ): ChallengeTake<T> {
    const entry = this.pending.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.pending.delete(key);
      return { kind: "missing" };
    }
    const { challenge } = entry;
    // The challenger may withdraw his own proposal; only the opponent accepts.
    if (action === "decline" && userId === challenge.challengerId) {
      this.pending.delete(key);
      return { kind: "withdrawn", challenge };
    }
    if (userId !== challenge.opponentId) return { kind: "not-addressed" };
    this.pending.delete(key);
    return action === "accept" ? { kind: "accepted", challenge } : { kind: "declined", challenge };
  }

  get size(): number {
    return this.pending.size;
  }
}

/**
 * Answers the clicks that do not start a game. Returns the challenge when the
 * opponent accepted, `null` when the interaction is already answered.
 */
export async function resolveChallengeClick<T extends ChallengeParties>(
  interaction: ButtonInteraction,
  board: ChallengeBoard<T>,
  key: string,
  action: "accept" | "decline",
  title: string,
): Promise<T | null> {
  const taken = board.take(key, interaction.user.id, action);
  switch (taken.kind) {
    case "missing":
      // Ephemeral: a late double click must not overwrite the board already shown.
      await interaction
        .reply({ content: "Défi expiré ou déjà traité.", flags: MessageFlags.Ephemeral })
        .catch(() => {});
      return null;
    case "not-addressed":
      await interaction.reply({
        content: "Ce défi ne t'est pas adressé.",
        flags: MessageFlags.Ephemeral,
      });
      return null;
    case "declined":
      await interaction.update(
        closedChallenge(
          title,
          "refused",
          `<@${taken.challenge.opponentId}> a refusé le défi de <@${taken.challenge.challengerId}>.`,
        ),
      );
      return null;
    case "withdrawn":
      await interaction.update(
        closedChallenge(
          title,
          "withdrawn",
          `<@${taken.challenge.challengerId}> a retiré son défi.`,
        ),
      );
      return null;
    case "accepted":
      return taken.challenge;
  }
}

type ClosedKind = "refused" | "withdrawn" | "cancelled";

const CLOSED_TITLES: Record<ClosedKind, string> = {
  refused: "Défi refusé",
  withdrawn: "Défi retiré",
  cancelled: "Duel annulé",
};

/** Message payload that replaces a challenge which did not become a game. */
export function closedChallenge(title: string, kind: ClosedKind, description: string) {
  return {
    content: "",
    embeds: [
      new EmbedBuilder()
        .setTitle(`${title} · ${CLOSED_TITLES[kind]}`)
        .setDescription(description)
        .setColor(kind === "cancelled" ? DBZ_COLORS.power : COLORS.muted)
        .setTimestamp(new Date()),
    ],
    components: [],
  };
}

// ─── Players ──────────────────────────────────────────────────────────────

/** One game of a kind at a time per player (no parallel farming). */
export class ActivePlayers {
  private readonly ids = new Set<string>();

  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** Reserves every id, or none if one of them is already playing. */
  reserve(ids: readonly string[]): boolean {
    if (ids.some((id) => this.ids.has(id))) return false;
    for (const id of ids) this.ids.add(id);
    return true;
  }

  release(ids: readonly string[]): void {
    for (const id of ids) this.ids.delete(id);
  }
}

// ─── Stakes ───────────────────────────────────────────────────────────────

export interface StakeCheckDeps {
  getBalance(userId: string): Promise<number>;
  maxStake(): Promise<number>;
}

/**
 * Validates a duel stake before the challenge is posted. `null` when the duel
 * can be proposed, otherwise the ephemeral message to show.
 */
export async function duelStakeError(
  deps: StakeCheckDeps,
  challengerId: string,
  opponent: { id: string; toString(): string },
  stake: number,
): Promise<string | null> {
  if (stake <= 0) return null;
  const maxStake = await deps.maxStake();
  if (stake > maxStake) return `Mise maximale : **${formatZeni(maxStake)}**.`;
  const [mine, theirs] = await Promise.all([
    deps.getBalance(challengerId),
    deps.getBalance(opponent.id),
  ]);
  if (mine < stake) {
    return `Tu n'as que **${formatZeni(mine)}** : pas assez pour une mise de **${formatZeni(stake)}**.`;
  }
  if (theirs < stake) {
    return `${opponent.toString()} n'a pas assez de zénis pour une mise de **${formatZeni(stake)}**.`;
  }
  return null;
}

/** Validates the opponent of a duel; `null` when valid. */
export function opponentError(
  challengerId: string,
  opponent: Pick<User, "id" | "bot"> | undefined,
): string | null {
  if (!opponent) return "Choisis un adversaire (option `adversaire`) pour un duel.";
  if (opponent.bot) return "Les robots ne relèvent pas les défis : choisis un membre.";
  if (opponent.id === challengerId) return "Tu ne peux pas te défier toi-même.";
  return null;
}

export const BOT_STAKE_REFUSED =
  "Les mises sont réservées aux duels. Contre le robot, seul le gain de base est versé.";

/** Text of the stake field of a challenge. */
export function stakeSummary(stake: number, win: number, loss = 0): string {
  if (stake > 0) {
    return `Mise **${formatZeni(stake)}** par joueur, séquestrée à l'acceptation · pot **${formatZeni(stake * 2)}**`;
  }
  return loss > 0
    ? `Gagnant **${formatZeniDelta(win)}** · Perdant **${formatZeniDelta(-loss)}**`
    : `Gagnant **${formatZeniDelta(win)}**`;
}

// ─── Results ──────────────────────────────────────────────────────────────

/**
 * What a result really gave, in the order `+X XP · +Y Ƶ · Level N → M`: only the parts that
 * exist, the amounts in bold. When the daily XP cap swallowed the award, says so instead of
 * showing a silent zero. Empty when there is nothing to show.
 */
export function rewardText(lang: BotLang, parts: { xp?: GameXpGrant; zeni?: number }): string {
  const { xp, zeni } = parts;
  const out: string[] = [];
  if (xp && xp.xp > 0)
    out.push(`**${t(lang, "games.reward.xp", { xp: formatNumber(lang, xp.xp) })}**`);
  if (zeni) out.push(`**${formatZeniDelta(zeni)}**`);
  if (xp?.levelUp) {
    out.push(t(lang, "games.reward.level", { from: xp.oldLevel, to: xp.newLevel }));
  }
  if (xp && xp.xp <= 0 && xp.capped) out.push(t(lang, "games.reward.capped"));
  return out.join(" · ");
}

/** Result line of one player (`<@id> +X XP · −Y Ƶ`); empty when there is nothing to show. */
export function playerRewardLine(
  lang: BotLang,
  userId: string,
  xp: GameXpGrant | undefined,
  zeni?: number,
): string {
  const text = rewardText(lang, { xp, zeni });
  return text ? `<@${userId}> ${text}` : "";
}

/**
 * Result line of a base reward (`GameRewardService.grantWin`), with the XP given with it: the
 * win when it is paid, participation when a cap blocks the zeni.
 */
export function grantLine(
  grant: { paid: number; blocked: RewardBlock | null; xp?: GameXpGrant },
  winnerId: string,
  prefix?: string,
  lang: BotLang = "fr",
): string {
  const who = prefix ?? `<@${winnerId}>`;
  if (grant.paid > 0) return `${who} ${rewardText(lang, { xp: grant.xp, zeni: grant.paid })}`;
  const xpOnly = rewardText(lang, { xp: grant.xp });
  if (grant.blocked) {
    const reason = `Victoire sans gain : ${REWARD_BLOCK_LABELS[grant.blocked]}.`;
    return xpOnly ? `${reason}\n${who} ${xpOnly}` : reason;
  }
  return xpOnly ? `${who} ${xpOnly}` : "Aucun gain.";
}

/** Embed colour of a board by status, shared by every game. */
export function statusColor(status: "playing" | "won" | "lost" | "draw" | "expired"): number {
  switch (status) {
    case "won":
      return COLORS.brand;
    case "lost":
    case "expired":
      return DBZ_COLORS.power;
    case "draw":
      return COLORS.muted;
    default:
      return DBZ_COLORS.goku;
  }
}

// ─── Message-driven games (pendu, bingo) ─────────────────────────────────

export type MoveOutcome =
  | { kind: "ignored" }
  | { kind: "playing" }
  | { kind: "won"; winnerId: string }
  | { kind: "lost" };

export type EndReason = "won" | "lost" | "timeout";

export interface MessageGameOptions {
  /** Log scope, ex. "pendu". */
  scope: string;
  channel: SendableChannels;
  players: readonly string[];
  endsAt: number;
  firstBoard: Message | null;
  /** Cheap pre-filter on the raw content (regex test). */
  accepts: (content: string) => boolean;
  /** Applies a move to the state. Runs one at a time, in arrival order. */
  play: (message: Message) => MoveOutcome;
  render: (status: "playing" | "won" | "lost", result?: string[]) => Promise<MessageCreateOptions>;
  settle: (reason: EndReason, winnerId?: string) => Promise<string[]>;
  /** Always called once the game is over, settlement failed or not. */
  onFinished: () => void;
  /** Called with each board posted, to keep the session journal current. */
  onBoard?: (board: Message) => void;
}

/**
 * Game loop shared by the games played by typing in the channel. Moves are
 * queued (two quick guesses never race), only one board stays on screen (the
 * previous one is deleted), and the settlement runs exactly once — on the
 * winning move, on the last life, or at the deadline.
 */
export function runMessageGame(opts: MessageGameOptions): void {
  let board = opts.firstBoard;
  let finished = false;
  let queue: Promise<void> = Promise.resolve();

  const refresh = async (status: "playing" | "won" | "lost", result?: string[]) => {
    const next = await opts.channel.send(await opts.render(status, result)).catch(() => null);
    if (!next) return;
    await board?.delete().catch(() => {});
    board = next;
    opts.onBoard?.(next);
  };

  const finish = async (reason: EndReason, winnerId?: string) => {
    if (finished) return;
    finished = true;
    let result: string[] = [];
    try {
      result = await opts.settle(reason, winnerId);
    } catch (err) {
      logger.error({ err }, `${opts.scope}: règlement de fin de partie en échec`);
    } finally {
      opts.onFinished();
    }
    await refresh(reason === "won" ? "won" : "lost", result);
  };

  const collector = opts.channel.createMessageCollector({
    filter: (m: Message) => opts.players.includes(m.author.id) && opts.accepts(m.content.trim()),
    time: Math.max(1_000, opts.endsAt - Date.now()),
  });

  const handle = async (m: Message) => {
    if (finished) return;
    const outcome = opts.play(m);
    if (outcome.kind === "ignored") return;
    if (outcome.kind === "playing") {
      await refresh("playing");
      return;
    }
    collector.stop(outcome.kind);
    await finish(outcome.kind, outcome.kind === "won" ? outcome.winnerId : undefined);
  };

  collector.on("collect", (m: Message) => {
    queue = queue
      .then(() => handle(m))
      .catch((err) => logger.error({ err }, `${opts.scope}: coup en échec`));
  });
  collector.on("end", (_c, reason) => {
    queue = queue
      .then(() => finish("timeout"))
      .catch((err) => logger.error({ err, reason }, `${opts.scope}: fin de partie en échec`));
  });
}
