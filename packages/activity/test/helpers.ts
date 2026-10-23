// SPDX-License-Identifier: Apache-2.0
import {
  createBank,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  type ClientMessage,
  type Outbound,
  type PublicQuestion,
  type QuizBank,
  type QuizCategory,
  type QuizQuestion,
  type Room,
  type ServerMessage,
} from "../src";

/** Discord-looking snowflakes. */
export const user = (n: number): string => String(100_000_000_000_000_000n + BigInt(n));
export const U1 = user(1);
export const U2 = user(2);
export const U3 = user(3);
export const U4 = user(4);

const text = (value: string) => ({ fr: value, en: value, ja: value });

/** A synthetic bank whose right answer of question i is "Right i" (tests only, no Dragon Ball fact). */
export function makeBank(count = 20): QuizBank {
  const categories: QuizCategory[] = ["characters", "techniques", "sagas"];
  const questions: QuizQuestion[] = [];
  for (let i = 0; i < count; i++) {
    questions.push({
      id: `test:q${i}`,
      category: categories[i % categories.length] as QuizCategory,
      subjectKey: `test:s${i}`,
      prompt: text(`Question ${i}`),
      answer: { id: `a${i}`, text: text(`Right ${i}`) },
      distractors: [
        { id: `w${i}a`, text: text(`Wrong ${i} alpha`) },
        { id: `w${i}b`, text: text(`Wrong ${i} bravo`) },
        { id: `w${i}c`, text: text(`Wrong ${i} charlie`) },
      ],
      source: { type: "lexicon", id: `q${i}` },
    });
  }
  return createBank(questions);
}

/** Index of the right answer of a question sent by a room built on `makeBank`. */
export function correctChoice(question: PublicQuestion): number {
  const number = /^Question (\d+)$/.exec(question.prompt.fr)?.[1];
  if (number === undefined) throw new Error(`unexpected prompt ${question.prompt.fr}`);
  const index = question.choices.findIndex((choice) => choice.fr === `Right ${number}`);
  if (index < 0) throw new Error("right answer not among the choices");
  return index;
}

export const msg = {
  ping: (t?: number): ClientMessage => ({
    v: PROTOCOL_VERSION,
    type: "ping",
    ...(t !== undefined ? { t } : {}),
  }),
  start: (): ClientMessage => ({ v: PROTOCOL_VERSION, type: "start" }),
  playAgain: (): ClientMessage => ({ v: PROTOCOL_VERSION, type: "play_again" }),
  leave: (): ClientMessage => ({ v: PROTOCOL_VERSION, type: "leave" }),
  kick: (userId: string): ClientMessage => ({ v: PROTOCOL_VERSION, type: "kick", userId }),
  configure: (config: { questionCount?: number; categories?: QuizCategory[] }): ClientMessage => ({
    v: PROTOCOL_VERSION,
    type: "configure",
    config,
  }),
  answer: (roundId: string, index: number, choice: number): ClientMessage => ({
    v: PROTOCOL_VERSION,
    type: "answer",
    roundId,
    index,
    choice,
  }),
};

/**
 * Plays the part of the socket layer: routes a room's outbound messages to per-user inboxes and
 * checks that every message is valid against the protocol schema.
 */
export class Hub {
  readonly inboxes = new Map<string, ServerMessage[]>();
  readonly all: { to: string; message: ServerMessage }[] = [];

  constructor(readonly room: Room) {}

  /** Users who currently have an inbox (ever joined). */
  private recipients(target: Outbound["target"]): string[] {
    const users = [...this.inboxes.keys()];
    if (target.to === "all") return users;
    if (target.to === "user") return [target.userId];
    return users.filter((id) => id !== target.userId);
  }

  deliver(out: readonly Outbound[]): void {
    for (const { target, message } of out) {
      ServerMessageSchema.parse(message);
      for (const id of this.recipients(target)) {
        const inbox = this.inboxes.get(id) ?? [];
        inbox.push(message);
        this.inboxes.set(id, inbox);
        this.all.push({ to: id, message });
      }
    }
  }

  join(userId: string, name = `Player ${userId.slice(-2)}`): ReturnType<Room["join"]> {
    if (!this.inboxes.has(userId)) this.inboxes.set(userId, []);
    const result = this.room.join({ userId, name });
    this.deliver(result.out);
    return result;
  }

  send(userId: string, message: ClientMessage): void {
    this.deliver(this.room.receive(userId, message));
  }

  leave(userId: string): void {
    this.deliver(this.room.leave(userId));
  }

  tick(): void {
    this.deliver(this.room.tick());
  }

  messages<T extends ServerMessage["type"]>(
    userId: string,
    type: T,
  ): Extract<ServerMessage, { type: T }>[] {
    return (this.inboxes.get(userId) ?? []).filter(
      (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
    );
  }

  last<T extends ServerMessage["type"]>(
    userId: string,
    type: T,
  ): Extract<ServerMessage, { type: T }> {
    const found = this.messages(userId, type).at(-1);
    if (!found) throw new Error(`no ${type} message for ${userId}`);
    return found;
  }

  errors(userId: string): string[] {
    return this.messages(userId, "error").map((m) => m.code);
  }

  clear(): void {
    for (const inbox of this.inboxes.values()) inbox.length = 0;
    this.all.length = 0;
  }
}
