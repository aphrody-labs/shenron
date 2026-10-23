// SPDX-License-Identifier: Apache-2.0
/**
 * A room: the shared state of one Activity instance (one Discord `instance_id`).
 *
 *   lobby --(host: start)--> round --(last question revealed)--> results --(host: play_again, or
 *   after `resultsHoldMs`)--> lobby
 *
 * The room is synchronous, owns no timer and no socket. The server feeds it the authenticated
 * events of the instance (`join`, `receive`, `leave`) and calls `tick()` when `nextDeadline()` is
 * reached; each call returns the messages to send, addressed (everyone, one user, everyone else).
 * Time comes from the injected clock; `receive`, `join` and `leave` first play out any deadline that
 * has passed, so correctness never depends on how often `tick` is called.
 *
 * Players and spectators: whoever arrives in the lobby takes a seat until `maxPlayers`; whoever
 * arrives during a round, or when the seats are taken, watches. The host is the longest-present
 * connected player and passes to the next one when they leave.
 */
import type { Clock } from "../clock";
import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  UserIdSchema,
  type ClientMessage,
  type CloseReason,
  type ErrorCode,
  type KickReason,
  type Phase,
  type PlayerPublic,
  type QuizConfig,
  type RankingEntry,
  type Role,
  type RoomSnapshot,
  type ServerMessage,
  type Settled,
} from "../protocol";
import type { Rng } from "../rng";
import {
  buildReceipt,
  computeRoundRewards,
  DEFAULT_REWARD_POLICY,
  presentQuestion,
  QuizSession,
  selectQuestions,
  DEFAULT_SESSION_LIMITS,
  type QuizBank,
  type QuizSessionLimits,
  type RewardPolicy,
  type SessionEvent,
  type SettlementReceipt,
} from "../quiz";

export interface RoomLimits {
  /** Seats for players (G1: up to 25). */
  readonly maxPlayers: number;
  readonly maxSpectators: number;
  /** Absolute lifetime of a room, whatever happens. */
  readonly maxDurationMs: number;
  /** A room nobody acts in (no message but heartbeats) for this long expires. */
  readonly idleTimeoutMs: number;
  /** How long the final standings stay before the room returns to the lobby by itself. */
  readonly resultsHoldMs: number;
  /** A connected member silent for this long is treated as gone (heartbeats arrive every 15 s). */
  readonly presenceTimeoutMs: number;
  /** A room with nobody connected for this long closes (the instance dies with its last member). */
  readonly emptyGraceMs: number;
  /** Anti-spam: token bucket on every message a member sends. */
  readonly rate: { readonly burst: number; readonly refillPerSecond: number };
  /** Rate-limit hits after which a member is removed for spam. */
  readonly maxViolations: number;
  readonly session: QuizSessionLimits;
}

export const DEFAULT_ROOM_LIMITS: RoomLimits = Object.freeze({
  maxPlayers: 25,
  maxSpectators: 50,
  maxDurationMs: 2 * 60 * 60_000,
  idleTimeoutMs: 15 * 60_000,
  resultsHoldMs: 2 * 60_000,
  presenceTimeoutMs: 45_000,
  emptyGraceMs: 60_000,
  rate: Object.freeze({ burst: 12, refillPerSecond: 4 }),
  maxViolations: 25,
  session: DEFAULT_SESSION_LIMITS,
});

export type Target =
  | { readonly to: "all" }
  | { readonly to: "user"; readonly userId: string }
  | { readonly to: "others"; readonly userId: string };

export interface Outbound {
  readonly target: Target;
  readonly message: ServerMessage;
}

export interface JoinInfo {
  readonly userId: string;
  /** Guild nickname or display name, resolved by the server (never taken from the client). */
  readonly name: string;
  /** Discord avatar hash, or `null`. */
  readonly avatar?: string | null;
}

export type JoinResult =
  | { readonly admitted: true; readonly role: Role; readonly out: Outbound[] }
  | { readonly admitted: false; readonly code: ErrorCode; readonly out: Outbound[] };

export interface RoomOptions {
  readonly instanceId: string;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly bank: QuizBank;
  readonly limits?: Partial<RoomLimits>;
  readonly rewardPolicy?: RewardPolicy;
  /**
   * Question ids the given members saw recently (30 days in production). Used to draw fresh
   * questions first; absent in tests that do not care.
   */
  readonly recentlySeen?: (userIds: readonly string[]) => ReadonlySet<string>;
  /**
   * Called once when a finished round pays someone, with the unsigned receipt. The server signs it
   * (`signReceipt`) and sends it to the bot. A callback that throws does not disturb the room: the
   * receipt stays available as `room.settlement` for the server to retry.
   */
  readonly onSettlement?: (receipt: SettlementReceipt) => void;
}

interface Member {
  readonly userId: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly joinedSeq: number;
  role: Role;
  connected: boolean;
  lastSeenAt: number;
  tokens: number;
  tokensAt: number;
  violations: number;
}

const DEFAULT_QUESTION_COUNT = 8;
const ALL: Target = { to: "all" };

/**
 * Control characters, zero-width characters and bidirectional overrides: none of them belongs in a
 * display name (an override can make a name read as another one in the roster).
 */
const INVISIBLE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x061c, 0x061c],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];

function stripInvisible(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (!INVISIBLE_RANGES.some(([low, high]) => code >= low && code <= high)) out += char;
  }
  return out;
}

function cleanName(raw: string): string {
  const cleaned = stripInvisible(raw).trim();
  return cleaned.slice(0, PROTOCOL_LIMITS.maxNameLength) || "?";
}

function cleanAvatar(raw: string | null | undefined): string | null {
  return typeof raw === "string" && /^[A-Za-z0-9_]{1,64}$/.test(raw) ? raw : null;
}

export class Room {
  readonly instanceId: string;
  readonly limits: RoomLimits;
  readonly #clock: Clock;
  readonly #rng: Rng;
  readonly #bank: QuizBank;
  readonly #policy: RewardPolicy;
  readonly #recentlySeen: RoomOptions["recentlySeen"];
  readonly #onSettlement: RoomOptions["onSettlement"];
  readonly #members = new Map<string, Member>();
  readonly #banned = new Set<string>();
  readonly #createdAt: number;
  #phase: Phase = "lobby";
  #hostId: string | null = null;
  #config: QuizConfig;
  #session: QuizSession | null = null;
  #roundCounter = 0;
  #seq = 0;
  #lastActivityAt: number;
  #resultsAt = 0;
  #emptySince: number | null;
  #closed: CloseReason | null = null;
  #settled: Settled | null = null;
  #settlement: SettlementReceipt | null = null;

  constructor(options: RoomOptions) {
    this.instanceId = options.instanceId;
    this.limits = { ...DEFAULT_ROOM_LIMITS, ...options.limits };
    this.#clock = options.clock;
    this.#rng = options.rng;
    this.#bank = options.bank;
    this.#policy = options.rewardPolicy ?? DEFAULT_REWARD_POLICY;
    this.#recentlySeen = options.recentlySeen;
    this.#onSettlement = options.onSettlement;
    const now = options.clock.now();
    this.#createdAt = now;
    this.#lastActivityAt = now;
    this.#emptySince = now;
    this.#config = {
      questionCount: DEFAULT_QUESTION_COUNT,
      categories: [...options.bank.availableCategories()],
    };
  }

  // ── Read side ──────────────────────────────────────────────────────────────

  get phase(): Phase {
    return this.#phase;
  }

  get hostId(): string | null {
    return this.#hostId;
  }

  get config(): QuizConfig {
    return { questionCount: this.#config.questionCount, categories: [...this.#config.categories] };
  }

  get closedReason(): CloseReason | null {
    return this.#closed;
  }

  get isClosed(): boolean {
    return this.#closed !== null;
  }

  /** Members with a live socket. */
  get connectedCount(): number {
    let count = 0;
    for (const member of this.#members.values()) if (member.connected) count += 1;
    return count;
  }

  get memberCount(): number {
    return this.#members.size;
  }

  /** Ids of the questions of the current or last round (for the members' history of seen questions). */
  get roundQuestionIds(): readonly string[] {
    return this.#session?.questionIds() ?? [];
  }

  /** The receipt of the last finished round (unsigned), if any. */
  get settlement(): SettlementReceipt | null {
    return this.#settlement;
  }

  roleOf(userId: string): Role | null {
    return this.#members.get(userId)?.role ?? null;
  }

  has(userId: string): boolean {
    return this.#members.has(userId);
  }

  /** Earliest time at which `tick()` has something to do, or `null` for a closed room. */
  nextDeadline(): number | null {
    if (this.#closed !== null) return null;
    const times: number[] = [
      this.#createdAt + this.limits.maxDurationMs,
      this.#lastActivityAt + this.limits.idleTimeoutMs,
    ];
    if (this.#emptySince !== null) times.push(this.#emptySince + this.limits.emptyGraceMs);
    for (const member of this.#members.values())
      if (member.connected) times.push(member.lastSeenAt + this.limits.presenceTimeoutMs);
    if (this.#phase === "results") times.push(this.#resultsAt + this.limits.resultsHoldMs);
    const sessionDeadline = this.#session?.nextDeadline();
    if (sessionDeadline !== null && sessionDeadline !== undefined) times.push(sessionDeadline);
    return Math.min(...times);
  }

  /** What `userId` should see now (the content of `welcome`). */
  snapshotFor(userId: string): RoomSnapshot {
    const session = this.#session;
    const question = session && this.#phase === "round" ? session.publicQuestion() : null;
    const step = session?.step;
    return {
      instanceId: this.instanceId,
      phase: this.#phase,
      hostId: this.#hostId,
      config: this.config,
      availableCategories: [...this.#bank.availableCategories()],
      maxPlayers: this.limits.maxPlayers,
      players: this.#roster(),
      round:
        question !== null && (step === "question" || step === "reveal")
          ? {
              step,
              question,
              yourChoice: session?.choiceOf(userId) ?? null,
              reveal: session?.currentReveal() ?? null,
            }
          : null,
      ranking: session?.ranking() ?? [],
      settled: this.#settled,
      serverTime: this.#clock.now(),
    };
  }

  // ── Write side ─────────────────────────────────────────────────────────────

  /** Plays out every deadline that has passed. */
  tick(): Outbound[] {
    return this.#advance(this.#clock.now());
  }

  /**
   * Admits an authenticated user (the server has already checked that they belong to the Discord
   * instance). A returning member keeps their seat and score.
   */
  join(info: JoinInfo): JoinResult {
    const now = this.#clock.now();
    const out = this.#advance(now);
    if (this.#closed !== null) return refused("room_closed", out, info.userId);
    if (this.#banned.has(info.userId)) return refused("banned", out, info.userId);

    // The id comes from the server's own authentication, but a malformed one would poison every
    // roster message, so it is checked here too.
    if (!UserIdSchema.safeParse(info.userId).success)
      return refused("invalid_message", out, info.userId);

    const existing = this.#members.get(info.userId);
    if (existing) {
      existing.connected = true;
      existing.lastSeenAt = now;
      this.#emptySince = null;
      this.#lastActivityAt = now;
      this.#ensureHost();
      out.push(
        ...this.#fromSession(this.#session?.setConnected(info.userId, true, now) ?? [], now),
      );
      out.push(this.#welcome(existing));
      out.push(this.#rosterMessage({ to: "others", userId: info.userId }));
      return { admitted: true, role: existing.role, out };
    }

    const players = this.#countRole("player");
    const spectators = this.#countRole("spectator");
    const canSit = this.#phase !== "round" && players < this.limits.maxPlayers;
    if (!canSit && spectators >= this.limits.maxSpectators)
      return refused("room_full", out, info.userId);
    const member: Member = {
      userId: info.userId,
      name: cleanName(info.name),
      avatar: cleanAvatar(info.avatar),
      joinedSeq: this.#seq++,
      role: canSit ? "player" : "spectator",
      connected: true,
      lastSeenAt: now,
      tokens: this.limits.rate.burst,
      tokensAt: now,
      violations: 0,
    };
    this.#members.set(member.userId, member);
    this.#emptySince = null;
    this.#lastActivityAt = now;
    this.#ensureHost();
    out.push(this.#welcome(member));
    if (!canSit && this.#phase !== "round")
      out.push(userMessage(member.userId, { type: "error", code: "room_full" }));
    out.push(this.#rosterMessage({ to: "others", userId: member.userId }));
    return { admitted: true, role: member.role, out };
  }

  /** The socket of `userId` closed, or the user left. */
  leave(userId: string): Outbound[] {
    const now = this.#clock.now();
    const out = this.#advance(now);
    out.push(...this.#disconnect(userId, now));
    return out;
  }

  /** Handles one validated message of a member. */
  receive(userId: string, message: ClientMessage): Outbound[] {
    const now = this.#clock.now();
    const out = this.#advance(now);
    if (this.#closed !== null) return out;
    const member = this.#members.get(userId);
    if (!member || !member.connected) return out;
    member.lastSeenAt = now;
    if (message.type !== "ping") this.#lastActivityAt = now;

    const wait = this.#consumeToken(member, now);
    if (wait !== null) {
      member.violations += 1;
      if (member.violations >= this.limits.maxViolations) {
        out.push(...this.#remove(member, "spam", now));
        return out;
      }
      out.push(userMessage(userId, { type: "error", code: "rate_limited", retryAfterMs: wait }));
      return out;
    }

    switch (message.type) {
      case "ping":
        out.push(
          userMessage(userId, {
            type: "pong",
            ...(message.t !== undefined ? { t: message.t } : {}),
            serverTime: now,
          }),
        );
        break;
      case "leave":
        out.push(...this.#disconnect(userId, now));
        break;
      case "configure":
        out.push(...this.#configure(member, message.config));
        break;
      case "start":
        out.push(...this.#start(member, now));
        break;
      case "answer":
        out.push(...this.#answer(member, message, now));
        break;
      case "kick":
        out.push(...this.#kick(member, message.userId, now));
        break;
      case "play_again":
        out.push(...this.#playAgain(member, now));
        break;
    }
    return out;
  }

  /**
   * Records what the bot actually paid for the finished round (its answer to the settlement) and
   * tells the room. Ignored when `settled.roundId` is not the last round.
   */
  applySettled(settled: Settled): Outbound[] {
    if (this.#closed !== null || this.#phase !== "results") return [];
    if (this.#settlement?.roundId !== settled.roundId) return [];
    this.#settled = settled;
    return [allMessage({ type: "settled", settled })];
  }

  /** Shuts the room down (server stopping, instance gone). */
  close(reason: CloseReason): Outbound[] {
    if (this.#closed !== null) return [];
    this.#closed = reason;
    return [allMessage({ type: "closed", reason })];
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  #advance(now: number): Outbound[] {
    if (this.#closed !== null) return [];
    if (now - this.#createdAt >= this.limits.maxDurationMs) return this.close("max_duration");
    if (now - this.#lastActivityAt >= this.limits.idleTimeoutMs) return this.close("expired");

    const out: Outbound[] = [];
    for (const member of this.#members.values()) {
      if (member.connected && now - member.lastSeenAt >= this.limits.presenceTimeoutMs)
        out.push(...this.#disconnect(member.userId, now));
    }
    if (this.#emptySince !== null && now - this.#emptySince >= this.limits.emptyGraceMs)
      return [...out, ...this.close("empty")];
    if (this.#phase === "results" && now - this.#resultsAt >= this.limits.resultsHoldMs)
      out.push(...this.#toLobby(now));
    if (this.#session !== null && this.#phase === "round")
      out.push(...this.#fromSession(this.#session.tick(now), now));
    return out;
  }

  #countRole(role: Role): number {
    let count = 0;
    for (const member of this.#members.values()) if (member.role === role) count += 1;
    return count;
  }

  /** Marks a member gone: kept (offline) while they belong to the running round, removed otherwise. */
  #disconnect(userId: string, now: number): Outbound[] {
    const member = this.#members.get(userId);
    if (!member) return [];
    const out: Outbound[] = [];
    const inRound = this.#phase === "round" && this.#session?.isParticipant(userId) === true;
    if (inRound) {
      member.connected = false;
      out.push(...this.#fromSession(this.#session?.setConnected(userId, false, now) ?? [], now));
    } else {
      this.#members.delete(userId);
    }
    if (this.connectedCount === 0) this.#emptySince ??= now;
    this.#ensureHost();
    if (this.#phase === "lobby") this.#fillSeats();
    out.push(this.#rosterMessage(ALL));
    return out;
  }

  /** Removes a member for good (kick or spam) and bans them from the room. */
  #remove(member: Member, reason: KickReason, now: number): Outbound[] {
    const out: Outbound[] = [userMessage(member.userId, { type: "kicked", reason })];
    this.#banned.add(member.userId);
    this.#members.delete(member.userId);
    if (this.#session !== null && this.#phase === "round")
      out.push(...this.#fromSession(this.#session.drop(member.userId, now), now));
    if (this.connectedCount === 0) this.#emptySince ??= now;
    this.#ensureHost();
    if (this.#phase === "lobby") this.#fillSeats();
    out.push(this.#rosterMessage(ALL));
    return out;
  }

  /** Makes sure the host is a connected player; the longest-present one takes over. */
  #ensureHost(): void {
    const current = this.#hostId ? this.#members.get(this.#hostId) : undefined;
    if (current && current.connected && current.role === "player") return;
    const connected = [...this.#members.values()]
      .filter((member) => member.connected)
      .toSorted((a, b) => a.joinedSeq - b.joinedSeq);
    const player = connected.find((member) => member.role === "player");
    if (player) {
      this.#hostId = player.userId;
      return;
    }
    // Nobody seated is left: a spectator takes the seat and the lead, unless a round is running.
    const spectator = this.#phase === "round" ? undefined : connected[0];
    if (spectator) {
      spectator.role = "player";
      this.#hostId = spectator.userId;
      return;
    }
    this.#hostId = null;
  }

  /** In the lobby, waiting spectators take the free seats, longest-waiting first. */
  #fillSeats(): void {
    let free = this.limits.maxPlayers - this.#countRole("player");
    if (free <= 0) return;
    const waiting = [...this.#members.values()]
      .filter((member) => member.role === "spectator" && member.connected)
      .toSorted((a, b) => a.joinedSeq - b.joinedSeq);
    for (const member of waiting) {
      if (free <= 0) break;
      member.role = "player";
      free -= 1;
    }
    this.#ensureHost();
  }

  /** Token bucket: `null` when the message may pass, else the wait in milliseconds. */
  #consumeToken(member: Member, now: number): number | null {
    const { burst, refillPerSecond } = this.limits.rate;
    member.tokens = Math.min(
      burst,
      member.tokens + ((now - member.tokensAt) * refillPerSecond) / 1000,
    );
    member.tokensAt = now;
    if (member.tokens >= 1) {
      member.tokens -= 1;
      return null;
    }
    return Math.ceil(((1 - member.tokens) * 1000) / refillPerSecond);
  }

  #requireHost(member: Member, phase: Phase): Outbound | null {
    if (this.#hostId !== member.userId) return userMessage(member.userId, errorOf("not_host"));
    if (this.#phase !== phase) return userMessage(member.userId, errorOf("wrong_phase"));
    return null;
  }

  #configure(member: Member, patch: Partial<QuizConfig>): Outbound[] {
    const refusal = this.#requireHost(member, "lobby");
    if (refusal) return [refusal];
    const available = new Set(this.#bank.availableCategories());
    const categories = (patch.categories ?? this.#config.categories).filter((category) =>
      available.has(category),
    );
    if (categories.length === 0)
      return [userMessage(member.userId, errorOf("not_enough_questions"))];
    this.#config = { questionCount: patch.questionCount ?? this.#config.questionCount, categories };
    return [allMessage({ type: "config", config: this.config })];
  }

  #start(member: Member, now: number): Outbound[] {
    const refusal = this.#requireHost(member, "lobby");
    if (refusal) return [refusal];
    const seated = [...this.#members.values()].filter(
      (candidate) => candidate.role === "player" && candidate.connected,
    );
    const avoid = this.#recentlySeen?.(seated.map((candidate) => candidate.userId));
    const picked = selectQuestions(this.#bank, {
      count: this.#config.questionCount,
      categories: this.#config.categories,
      rng: this.#rng,
      ...(avoid ? { avoid } : {}),
    });
    if (picked.length < PROTOCOL_LIMITS.questionCountMin)
      return [userMessage(member.userId, errorOf("not_enough_questions"))];

    this.#roundCounter += 1;
    const session = new QuizSession({
      roundId: `${now.toString(36)}-${this.#roundCounter}`,
      questions: picked.map((question) => presentQuestion(question, this.#rng)),
      participants: seated.map((candidate) => ({ userId: candidate.userId, connected: true })),
      limits: this.limits.session,
    });
    this.#session = session;
    this.#settled = null;
    this.#settlement = null;
    this.#phase = "round";
    this.#lastActivityAt = now;
    return [
      allMessage({ type: "phase", phase: "round" }),
      ...this.#fromSession(session.start(now), now),
      this.#rosterMessage(ALL),
    ];
  }

  #answer(
    member: Member,
    message: Extract<ClientMessage, { type: "answer" }>,
    now: number,
  ): Outbound[] {
    const session = this.#session;
    if (this.#phase !== "round" || session === null)
      return [userMessage(member.userId, errorOf("wrong_phase"))];
    if (member.role !== "player") return [userMessage(member.userId, errorOf("not_player"))];
    const result = session.submit(
      member.userId,
      { roundId: message.roundId, index: message.index },
      message.choice,
      now,
    );
    if (!result.ok) {
      // Answering twice over and over is spam, whatever the rate limiter says.
      if (result.code === "already_answered") {
        member.violations += 1;
        if (member.violations >= this.limits.maxViolations)
          return this.#remove(member, "spam", now);
      }
      return [userMessage(member.userId, errorOf(result.code))];
    }
    return [
      userMessage(member.userId, {
        type: "answer_ack",
        roundId: message.roundId,
        index: message.index,
        choice: message.choice,
      }),
      ...this.#fromSession(result.events, now),
    ];
  }

  #kick(host: Member, targetId: string, now: number): Outbound[] {
    if (this.#hostId !== host.userId) return [userMessage(host.userId, errorOf("not_host"))];
    const target = this.#members.get(targetId);
    if (!target || targetId === host.userId)
      return [userMessage(host.userId, errorOf("invalid_target"))];
    return this.#remove(target, "host", now);
  }

  #playAgain(member: Member, now: number): Outbound[] {
    const refusal = this.#requireHost(member, "results");
    if (refusal) return [refusal];
    return this.#toLobby(now);
  }

  #toLobby(now: number): Outbound[] {
    this.#phase = "lobby";
    this.#session = null;
    this.#settled = null;
    this.#lastActivityAt = now;
    for (const member of this.#members.values())
      if (!member.connected) this.#members.delete(member.userId);
    this.#fillSeats();
    return [
      allMessage({ type: "phase", phase: "lobby" }),
      allMessage({ type: "config", config: this.config }),
      this.#rosterMessage(ALL),
    ];
  }

  /** Maps the events of the session to messages, and ends the round when it finished. */
  #fromSession(events: readonly SessionEvent[], now: number): Outbound[] {
    const out: Outbound[] = [];
    for (const event of events) {
      switch (event.type) {
        case "question":
          out.push(allMessage({ type: "question", question: event.question }));
          break;
        case "progress":
          out.push(
            allMessage({
              type: "progress",
              roundId: event.roundId,
              index: event.index,
              answered: [...event.answered],
              expected: event.expected,
            }),
          );
          break;
        case "reveal":
          out.push(allMessage({ type: "reveal", reveal: event.reveal }), this.#rosterMessage(ALL));
          break;
        case "finished":
          out.push(...this.#finish(event.ranking, now));
          break;
      }
    }
    return out;
  }

  #finish(ranking: readonly RankingEntry[], now: number): Outbound[] {
    const session = this.#session as QuizSession;
    this.#phase = "results";
    this.#resultsAt = now;
    this.#lastActivityAt = now;
    const lines = computeRoundRewards(session.rewardCandidates(), session.total, this.#policy);
    this.#settlement = buildReceipt({
      instanceId: this.instanceId,
      roundId: session.roundId,
      now,
      questionCount: session.total,
      lines,
      policy: this.#policy,
    });
    const out: Outbound[] = [
      allMessage({ type: "results", roundId: session.roundId, ranking: [...ranking] }),
      allMessage({ type: "phase", phase: "results" }),
      this.#rosterMessage(ALL),
    ];
    if (lines.some((line) => line.zeni > 0)) {
      try {
        this.#onSettlement?.(this.#settlement);
      } catch {
        // The room's messages must still go out; the receipt is kept in `settlement`.
      }
    } else {
      // Nothing to pay: the outcome is final already and the bot has nothing to settle.
      this.#settled = {
        roundId: session.roundId,
        rewards: lines.map((line) => ({ userId: line.userId, zeni: 0, reason: line.reason })),
      };
      out.push(allMessage({ type: "settled", settled: this.#settled }));
    }
    return out;
  }

  #roster(): PlayerPublic[] {
    const session = this.#session;
    const answered = new Set(session?.answeredIds() ?? []);
    return [...this.#members.values()]
      .toSorted((a, b) => a.joinedSeq - b.joinedSeq)
      .map((member) => ({
        userId: member.userId,
        name: member.name,
        avatar: member.avatar,
        role: member.role,
        status: !member.connected
          ? "offline"
          : session?.isParticipant(member.userId)
            ? session.statusOf(member.userId)
            : "online",
        score: session?.scoreOf(member.userId) ?? 0,
        answered: answered.has(member.userId),
      }));
  }

  #rosterMessage(target: Target): Outbound {
    return {
      target,
      message: {
        v: PROTOCOL_VERSION,
        type: "roster",
        hostId: this.#hostId,
        players: this.#roster(),
      },
    };
  }

  #welcome(member: Member): Outbound {
    return userMessage(member.userId, {
      type: "welcome",
      you: { userId: member.userId, role: member.role },
      room: this.snapshotFor(member.userId),
    });
  }
}

/** A server message without its protocol version (added when addressed). */
type Body<M> = M extends { v: unknown } ? Omit<M, "v"> : never;
type ServerBody = Body<ServerMessage>;

function withVersion(body: ServerBody): ServerMessage {
  return { v: PROTOCOL_VERSION, ...body } as ServerMessage;
}

function allMessage(body: ServerBody): Outbound {
  return { target: ALL, message: withVersion(body) };
}

function userMessage(userId: string, body: ServerBody): Outbound {
  return { target: { to: "user", userId }, message: withVersion(body) };
}

function errorOf(code: ErrorCode): Extract<ServerBody, { type: "error" }> {
  return { type: "error", code };
}

function refused(code: ErrorCode, out: Outbound[], userId: string): JoinResult {
  return {
    admitted: false,
    code,
    out: [...out, userMessage(userId, errorOf(code))],
  };
}
