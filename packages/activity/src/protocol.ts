// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-activity/protocol` — wire protocol between the Arène Shenron client (Discord
 * Activity iframe) and the Activity server. Runtime class `pure`: zod schemas only, no Discord, no
 * network, safe for the browser bundle.
 *
 * Rules of the protocol:
 *  - versioned: every message carries `v` (= `PROTOCOL_VERSION`); a different `v` is refused with
 *    `unsupported_protocol`, never interpreted;
 *  - strict: unknown keys are rejected (`z.strictObject`), so a client cannot smuggle fields such as
 *    an XP amount or a user id into an intent;
 *  - intents only: the client sends what it wants to do (an answer, a configuration change), never a
 *    score, a time or an identity. The server derives the user from the authenticated socket and
 *    measures time with its own clock;
 *  - the correct answer and the question source never travel before the reveal.
 *
 * Wire form: one JSON text frame per message, at most `PROTOCOL_LIMITS.maxClientMessageBytes` bytes
 * for client frames (the server sets `maxPayloadLength` of the WebSocket to that value).
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export const LOCALES = ["fr", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * Quiz categories (docs/products/bot-discord-refonte.md G1). `techniques` and `transformations` are
 * separate so that a host can pick one; the embedded lexicon bank fills the lexicon-backed ones, the
 * wiki and databook relation facts fill `volumes` and `databooks`.
 */
export const QUIZ_CATEGORIES = [
  "characters",
  "techniques",
  "transformations",
  "sagas",
  "volumes",
  "world",
  "databooks",
] as const;
export type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

/** Hard limits shared by the schemas, the room manager and the client. */
export const PROTOCOL_LIMITS = {
  /** Inbound frame size; the server sets the WebSocket `maxPayloadLength` to this value. */
  maxClientMessageBytes: 4096,
  /** Four answers per question, always. */
  choiceCount: 4,
  questionCountMin: 5,
  questionCountMax: 10,
  /** Longest prompt or answer text (a databook excerpt is the longest legitimate text). */
  maxTextLength: 600,
  maxNameLength: 64,
  maxPlayersCeiling: 25,
} as const;

export const CHOICE_COUNT = PROTOCOL_LIMITS.choiceCount;

/** Machine-readable error codes; the labels live in `@aphrody/shenron-activity/i18n`. */
export const ERROR_CODES = [
  "invalid_message",
  "unsupported_protocol",
  "message_too_large",
  "room_full",
  "banned",
  "not_host",
  "not_player",
  "wrong_phase",
  "rate_limited",
  "already_answered",
  "too_fast",
  "wrong_round",
  "wrong_question",
  "question_closed",
  "not_enough_questions",
  "invalid_target",
  "room_closed",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const KICK_REASONS = ["host", "spam"] as const;
export type KickReason = (typeof KICK_REASONS)[number];

export const CLOSE_REASONS = ["empty", "expired", "max_duration", "shutdown"] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/**
 * Why a member earned what they earned. The first group is decided by the Activity rules, the second
 * by the bot when it settles (daily budget, account checks, kill switch, idempotency).
 */
export const REWARD_REASONS = [
  "podium",
  "tied_podium",
  "off_podium",
  "solo",
  "inactive",
  "no_points",
  "flagged",
  "daily_budget",
  "account_ineligible",
  "kill_switch",
  "duplicate",
] as const;
export type RewardReason = (typeof REWARD_REASONS)[number];

// ── Identifiers ──────────────────────────────────────────────────────────────

/** Discord Activity `instance_id` (opaque; the pattern only keeps it safe as a key and in logs). */
export const InstanceIdSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
/** Discord user id (snowflake). */
export const UserIdSchema = z.string().regex(/^\d{5,25}$/);
/** `<base36 start time>-<counter>`: unique across restarts of the Activity server. */
export const RoundIdSchema = z.string().regex(/^[a-z0-9]{1,12}-\d{1,4}$/);

export const LocaleSchema = z.enum(LOCALES);
export const QuizCategorySchema = z.enum(QUIZ_CATEGORIES);
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const RewardReasonSchema = z.enum(REWARD_REASONS);

const Timestamp = z.number().int().nonnegative();
const Text = z.string().min(1).max(PROTOCOL_LIMITS.maxTextLength);

/** The same text in the three supported languages. */
export const LocalizedTextSchema = z.strictObject({ fr: Text, en: Text, ja: Text });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

/** Where a question comes from: a lexicon term, or a public page (wiki, databook, manga). */
export const QuizSourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("lexicon"), id: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
  z.strictObject({
    type: z.literal("page"),
    kind: z.enum(["wiki", "databook", "manga"]),
    /** https only: the client renders it as a link. */
    url: z
      .string()
      .max(500)
      .regex(/^https:\/\/[^\s"'<>]+$/),
    title: z.string().min(1).max(200).optional(),
  }),
]);
export type QuizSource = z.infer<typeof QuizSourceSchema>;

// ── Quiz configuration ───────────────────────────────────────────────────────

export const QuizConfigSchema = z.strictObject({
  questionCount: z
    .number()
    .int()
    .min(PROTOCOL_LIMITS.questionCountMin)
    .max(PROTOCOL_LIMITS.questionCountMax),
  categories: z
    .array(QuizCategorySchema)
    .min(1)
    .max(QUIZ_CATEGORIES.length)
    .refine((list) => new Set(list).size === list.length, "duplicate category"),
});
export type QuizConfig = z.infer<typeof QuizConfigSchema>;

export const QuizConfigPatchSchema = z
  .strictObject({
    questionCount: QuizConfigSchema.shape.questionCount.optional(),
    categories: QuizConfigSchema.shape.categories.optional(),
  })
  .refine(
    (patch) => patch.questionCount !== undefined || patch.categories !== undefined,
    "empty configuration patch",
  );
export type QuizConfigPatch = z.infer<typeof QuizConfigPatchSchema>;

// ── Client → server ──────────────────────────────────────────────────────────

const v = z.literal(PROTOCOL_VERSION);

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** Heartbeat (every `HEARTBEAT_INTERVAL_MS`); `t` is echoed back in `pong`. */
  z.strictObject({ v, type: z.literal("ping"), t: z.number().finite().optional() }),
  /** Host only, lobby only. */
  z.strictObject({ v, type: z.literal("configure"), config: QuizConfigPatchSchema }),
  /** Host only, lobby only. */
  z.strictObject({ v, type: z.literal("start") }),
  /** One answer per player and per question, to the question named by `roundId` and `index`. */
  z.strictObject({
    v,
    type: z.literal("answer"),
    roundId: RoundIdSchema,
    index: z
      .number()
      .int()
      .min(0)
      .max(PROTOCOL_LIMITS.questionCountMax - 1),
    choice: z
      .number()
      .int()
      .min(0)
      .max(CHOICE_COUNT - 1),
  }),
  /** Host only: removes a member from the room for good. */
  z.strictObject({ v, type: z.literal("kick"), userId: UserIdSchema }),
  /** Host only, results only: back to the lobby for another round. */
  z.strictObject({ v, type: z.literal("play_again") }),
  /** Leaves the room explicitly (closing the socket does the same). */
  z.strictObject({ v, type: z.literal("leave") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Heartbeat period the client should use; the room's presence timeout is several times this. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export type ParsedClientMessage =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: "invalid_message" | "unsupported_protocol" | "message_too_large" };

const utf8 = new TextEncoder();

/**
 * Parses and validates one inbound frame. Never throws; a frame that is not a JSON text, is too
 * large, does not match a schema or names another protocol version yields an error code.
 */
export function parseClientMessage(raw: unknown): ParsedClientMessage {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (utf8.encode(raw).length > PROTOCOL_LIMITS.maxClientMessageBytes)
      return { ok: false, code: "message_too_large" };
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, code: "invalid_message" };
    }
  } else if (raw === null || typeof raw !== "object" || raw instanceof ArrayBuffer) {
    return { ok: false, code: "invalid_message" };
  } else if (ArrayBuffer.isView(raw)) {
    return { ok: false, code: "invalid_message" };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return { ok: false, code: "invalid_message" };
  const version = (value as { v?: unknown }).v;
  if (typeof version === "number" && version !== PROTOCOL_VERSION)
    return { ok: false, code: "unsupported_protocol" };
  const parsed = ClientMessageSchema.safeParse(value);
  return parsed.success
    ? { ok: true, message: parsed.data }
    : { ok: false, code: "invalid_message" };
}

// ── Server → client ──────────────────────────────────────────────────────────

export const PHASES = ["lobby", "round", "results"] as const;
export type Phase = (typeof PHASES)[number];
export const PhaseSchema = z.enum(PHASES);

export const ROLES = ["player", "spectator"] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const PlayerPublicSchema = z.strictObject({
  userId: UserIdSchema,
  name: z.string().min(1).max(PROTOCOL_LIMITS.maxNameLength),
  /** Discord avatar hash (the client builds the CDN URL), `null` for the default avatar. */
  avatar: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,64}$/)
    .nullable(),
  role: RoleSchema,
  /** `away`: connected but missed several questions in a row; `offline`: socket gone. */
  status: z.enum(["online", "away", "offline"]),
  score: z.number().int().nonnegative(),
  /** Answered the current question (never says what). */
  answered: z.boolean(),
});
export type PlayerPublic = z.infer<typeof PlayerPublicSchema>;

export const RankingEntrySchema = z.strictObject({
  userId: UserIdSchema,
  rank: z.number().int().min(1),
  score: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  answered: z.number().int().nonnegative(),
});
export type RankingEntry = z.infer<typeof RankingEntrySchema>;

/** A question as players see it before the reveal: no answer, no source. */
export const PublicQuestionSchema = z.strictObject({
  roundId: RoundIdSchema,
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  category: QuizCategorySchema,
  prompt: LocalizedTextSchema,
  choices: z.array(LocalizedTextSchema).length(CHOICE_COUNT),
  startedAt: Timestamp,
  deadlineAt: Timestamp,
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const RevealSchema = z.strictObject({
  roundId: RoundIdSchema,
  index: z.number().int().min(0),
  correct: z
    .number()
    .int()
    .min(0)
    .max(CHOICE_COUNT - 1),
  source: QuizSourceSchema,
  answers: z.array(
    z.strictObject({
      userId: UserIdSchema,
      choice: z
        .number()
        .int()
        .min(0)
        .max(CHOICE_COUNT - 1)
        .nullable(),
      points: z.number().int().nonnegative(),
    }),
  ),
  ranking: z.array(RankingEntrySchema),
  /** When the next question (or the results) comes. */
  nextAt: Timestamp,
});
export type Reveal = z.infer<typeof RevealSchema>;

export const SettledSchema = z.strictObject({
  roundId: RoundIdSchema,
  rewards: z.array(
    z.strictObject({
      userId: UserIdSchema,
      /** What the bot actually paid, after its own caps and budget. */
      zeni: z.number().int().nonnegative(),
      reason: RewardReasonSchema,
    }),
  ),
});
export type Settled = z.infer<typeof SettledSchema>;

export const RoomSnapshotSchema = z.strictObject({
  instanceId: InstanceIdSchema,
  phase: PhaseSchema,
  hostId: UserIdSchema.nullable(),
  config: QuizConfigSchema,
  /** Categories the question bank can actually serve (the host picks among these). */
  availableCategories: z.array(QuizCategorySchema),
  maxPlayers: z.number().int().min(1).max(PROTOCOL_LIMITS.maxPlayersCeiling),
  players: z.array(PlayerPublicSchema),
  round: z
    .strictObject({
      step: z.enum(["question", "reveal"]),
      question: PublicQuestionSchema,
      /** The choice the receiving user recorded, if any. */
      yourChoice: z
        .number()
        .int()
        .min(0)
        .max(CHOICE_COUNT - 1)
        .nullable(),
      reveal: RevealSchema.nullable(),
    })
    .nullable(),
  /** Standings: live during a round, final in the results phase. */
  ranking: z.array(RankingEntrySchema),
  settled: SettledSchema.nullable(),
  serverTime: Timestamp,
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    v,
    type: z.literal("welcome"),
    you: z.strictObject({ userId: UserIdSchema, role: RoleSchema }),
    room: RoomSnapshotSchema,
  }),
  z.strictObject({
    v,
    type: z.literal("roster"),
    hostId: UserIdSchema.nullable(),
    players: z.array(PlayerPublicSchema),
  }),
  z.strictObject({ v, type: z.literal("config"), config: QuizConfigSchema }),
  z.strictObject({ v, type: z.literal("phase"), phase: PhaseSchema }),
  z.strictObject({ v, type: z.literal("question"), question: PublicQuestionSchema }),
  z.strictObject({
    v,
    type: z.literal("progress"),
    roundId: RoundIdSchema,
    index: z.number().int().min(0),
    answered: z.array(UserIdSchema),
    expected: z.number().int().nonnegative(),
  }),
  /** To the answering player only: the server recorded this choice. */
  z.strictObject({
    v,
    type: z.literal("answer_ack"),
    roundId: RoundIdSchema,
    index: z.number().int().min(0),
    choice: z
      .number()
      .int()
      .min(0)
      .max(CHOICE_COUNT - 1),
  }),
  z.strictObject({ v, type: z.literal("reveal"), reveal: RevealSchema }),
  z.strictObject({
    v,
    type: z.literal("results"),
    roundId: RoundIdSchema,
    ranking: z.array(RankingEntrySchema),
  }),
  /** What the bot paid, relayed by the server once the settlement answered. */
  z.strictObject({ v, type: z.literal("settled"), settled: SettledSchema }),
  z.strictObject({
    v,
    type: z.literal("error"),
    code: ErrorCodeSchema,
    /** Milliseconds to wait before retrying, for `rate_limited`. */
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
  z.strictObject({
    v,
    type: z.literal("pong"),
    t: z.number().finite().optional(),
    serverTime: Timestamp,
  }),
  z.strictObject({ v, type: z.literal("kicked"), reason: z.enum(KICK_REASONS) }),
  z.strictObject({ v, type: z.literal("closed"), reason: z.enum(CLOSE_REASONS) }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/** Serialises a server message (the room only builds valid ones; tests parse them back). */
export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/** Parses a frame received by the client; `null` when it is not a valid server message. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = ServerMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
