// SPDX-License-Identifier: Apache-2.0
/**
 * Client state: a pure reducer over the messages of the server. Everything the screens show comes
 * from here, so the whole game can be replayed in a test without a DOM or a socket.
 *
 * The server is the only source of truth: the reducer never computes a score, a rank or a result.
 * The one thing it anticipates is the player's own click (`pending`), shown at once and dropped if
 * the server refuses the answer.
 */
import type {
  CloseReason,
  ErrorCode,
  KickReason,
  PlayerPublic,
  Phase,
  PublicQuestion,
  QuizCategory,
  QuizConfig,
  RankingEntry,
  Reveal,
  Role,
  ServerMessage,
  Settled,
} from "@aphrody/shenron-activity/protocol";

export type Connection = "booting" | "connecting" | "online" | "reconnecting" | "failed";
export type BootStep = "sdk" | "auth" | "room";

export type Failure =
  | { readonly kind: "outside" | "config" | "auth" | "server" | "replaced" | "refused" | "closed" }
  | { readonly kind: "kicked"; readonly reason: KickReason }
  | { readonly kind: "roomClosed"; readonly reason: CloseReason };

export interface RoomView {
  readonly instanceId: string;
  readonly phase: Phase;
  readonly hostId: string | null;
  readonly config: QuizConfig;
  readonly availableCategories: readonly QuizCategory[];
  readonly maxPlayers: number;
  readonly players: readonly PlayerPublic[];
  readonly question: PublicQuestion | null;
  readonly step: "question" | "reveal" | null;
  /** The choice the server recorded for this player on the current question. */
  readonly yourChoice: number | null;
  /** The click not yet confirmed by the server. */
  readonly pending: { readonly index: number; readonly choice: number } | null;
  readonly reveal: Reveal | null;
  readonly answered: readonly string[];
  readonly expected: number;
  readonly ranking: readonly RankingEntry[];
  readonly settled: Settled | null;
}

export interface GameState {
  readonly connection: Connection;
  readonly bootStep: BootStep | null;
  readonly failure: Failure | null;
  readonly you: { readonly userId: string; readonly role: Role } | null;
  readonly room: RoomView | null;
  /** The last error the server sent, for a transient notice. */
  readonly notice: ErrorCode | null;
  /** Server time minus local time (ms): `Date.now() + clockOffset` approximates the server clock. */
  readonly clockOffset: number;
}

export const initialState: GameState = {
  connection: "booting",
  bootStep: "sdk",
  failure: null,
  you: null,
  room: null,
  notice: null,
  clockOffset: 0,
};

export type GameEvent =
  | { readonly type: "boot"; readonly step: BootStep }
  | { readonly type: "connecting" }
  | { readonly type: "fail"; readonly failure: Failure }
  | { readonly type: "socketLost" }
  | { readonly type: "server"; readonly message: ServerMessage; readonly receivedAt: number }
  | { readonly type: "localAnswer"; readonly index: number; readonly choice: number }
  | { readonly type: "dismissNotice" };

/** Errors after which an optimistic answer was not recorded. */
const ANSWER_REFUSALS: ReadonlySet<ErrorCode> = new Set([
  "not_player",
  "wrong_phase",
  "rate_limited",
  "too_fast",
  "wrong_round",
  "wrong_question",
  "question_closed",
]);

/**
 * Players a question waits for: seated, connected and not away (the server's own count, which it
 * only sends with the first answer). Used until a `progress` message gives the exact number.
 */
export function awaitedCount(players: readonly PlayerPublic[]): number {
  return players.filter((player) => player.role === "player" && player.status === "online").length;
}

function selfRole(players: readonly PlayerPublic[], userId: string, fallback: Role): Role {
  return players.find((player) => player.userId === userId)?.role ?? fallback;
}

function updateRoom(state: GameState, change: Partial<RoomView>): GameState {
  return state.room ? { ...state, room: { ...state.room, ...change } } : state;
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "boot":
      return { ...state, connection: "booting", bootStep: event.step, failure: null };
    case "connecting":
      return {
        ...state,
        connection: state.room ? "reconnecting" : "connecting",
        bootStep: state.room ? null : "room",
      };
    case "fail":
      return { ...state, connection: "failed", bootStep: null, failure: event.failure };
    case "socketLost":
      return state.connection === "failed" ? state : { ...state, connection: "reconnecting" };
    case "dismissNotice":
      return { ...state, notice: null };
    case "localAnswer": {
      const room = state.room;
      if (
        !room ||
        room.step !== "question" ||
        room.question?.index !== event.index ||
        room.yourChoice !== null ||
        room.pending !== null
      )
        return state;
      return updateRoom(state, { pending: { index: event.index, choice: event.choice } });
    }
    case "server":
      return reduceServer(state, event.message, event.receivedAt);
  }
}

function reduceServer(state: GameState, message: ServerMessage, receivedAt: number): GameState {
  switch (message.type) {
    case "welcome": {
      const { room } = message;
      const round = room.round;
      return {
        ...state,
        connection: "online",
        bootStep: null,
        failure: null,
        notice: null,
        clockOffset: room.serverTime - receivedAt,
        you: { userId: message.you.userId, role: message.you.role },
        room: {
          instanceId: room.instanceId,
          phase: room.phase,
          hostId: room.hostId,
          config: room.config,
          availableCategories: room.availableCategories,
          maxPlayers: room.maxPlayers,
          players: room.players,
          question: round?.question ?? null,
          step: round?.step ?? null,
          yourChoice: round?.yourChoice ?? null,
          pending: null,
          reveal: round?.reveal ?? null,
          answered: room.players.filter((player) => player.answered).map((p) => p.userId),
          expected: awaitedCount(room.players),
          ranking: room.ranking,
          settled: room.settled,
        },
      };
    }
    case "roster": {
      if (!state.room || !state.you) return state;
      return {
        ...updateRoom(state, {
          hostId: message.hostId,
          players: message.players,
          answered: message.players.filter((player) => player.answered).map((p) => p.userId),
          expected: awaitedCount(message.players),
        }),
        you: {
          userId: state.you.userId,
          role: selfRole(message.players, state.you.userId, state.you.role),
        },
      };
    }
    case "config":
      return updateRoom(state, { config: message.config });
    case "phase": {
      if (message.phase === "lobby")
        return updateRoom(state, {
          phase: "lobby",
          question: null,
          step: null,
          yourChoice: null,
          pending: null,
          reveal: null,
          answered: [],
          ranking: [],
          settled: null,
        });
      if (message.phase === "round")
        return updateRoom(state, {
          phase: "round",
          ranking: [],
          settled: null,
          reveal: null,
          yourChoice: null,
          pending: null,
        });
      return updateRoom(state, { phase: "results" });
    }
    case "question":
      return updateRoom(state, {
        phase: "round",
        question: message.question,
        step: "question",
        yourChoice: null,
        pending: null,
        reveal: null,
        answered: [],
        expected: awaitedCount(state.room?.players ?? []),
      });
    case "progress": {
      const question = state.room?.question;
      if (!question || question.roundId !== message.roundId || question.index !== message.index)
        return state;
      return updateRoom(state, { answered: message.answered, expected: message.expected });
    }
    case "answer_ack": {
      const question = state.room?.question;
      if (!question || question.roundId !== message.roundId || question.index !== message.index)
        return state;
      return updateRoom(state, { yourChoice: message.choice, pending: null });
    }
    case "reveal":
      return updateRoom(state, {
        step: "reveal",
        reveal: message.reveal,
        ranking: message.reveal.ranking,
        pending: null,
      });
    case "results":
      return updateRoom(state, { phase: "results", ranking: message.ranking, pending: null });
    case "settled":
      return updateRoom(state, { settled: message.settled });
    case "error": {
      const refused = ANSWER_REFUSALS.has(message.code);
      const base = refused ? updateRoom(state, { pending: null }) : state;
      return { ...base, notice: message.code };
    }
    case "pong":
      // Round-trip time is unknown here; half of a typical few tens of ms is below one frame.
      return { ...state, clockOffset: message.serverTime - Date.now() };
    case "kicked":
      return {
        ...state,
        connection: "failed",
        failure: { kind: "kicked", reason: message.reason },
      };
    case "closed":
      return {
        ...state,
        connection: "failed",
        failure: { kind: "roomClosed", reason: message.reason },
      };
  }
}

// ── Selectors ────────────────────────────────────────────────────────────────

/** The choice to show as selected: the recorded one, else the click awaiting confirmation. */
export function selectedChoice(room: RoomView): number | null {
  if (room.yourChoice !== null) return room.yourChoice;
  if (room.pending && room.question?.index === room.pending.index) return room.pending.choice;
  return null;
}

export function isHost(state: GameState): boolean {
  return state.you !== null && state.room?.hostId === state.you.userId;
}

export function ownRanking(state: GameState): RankingEntry | null {
  const id = state.you?.userId;
  return state.room?.ranking.find((entry) => entry.userId === id) ?? null;
}

/** Points the server gave `userId` for the revealed question. */
export function pointsOf(reveal: Reveal | null, userId: string | undefined): number {
  return reveal?.answers.find((answer) => answer.userId === userId)?.points ?? 0;
}

/** What `userId` answered at the reveal (`null`: no answer), or `undefined` when absent. */
export function answerOf(
  reveal: Reveal | null,
  userId: string | undefined,
): number | null | undefined {
  return reveal?.answers.find((answer) => answer.userId === userId)?.choice;
}

/** Milliseconds left to answer, by the server's clock. */
export function msLeft(state: GameState, now: number): number {
  const question = state.room?.question;
  if (!question) return 0;
  return Math.max(0, question.deadlineAt - (now + state.clockOffset));
}
