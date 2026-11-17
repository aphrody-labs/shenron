// SPDX-License-Identifier: Apache-2.0
import {
  parseServerMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type PublicQuestion,
  type ServerMessage,
} from "@aphrody/shenron-activity/protocol";
import { createBank, type QuizBank, type QuizQuestion } from "@aphrody/shenron-activity/quiz";
import type { DiscordIdentity, DiscordPort } from "../src/auth/discord";
import { loadConfig, type ActivityConfig } from "../src/config";
import { silentLogger } from "../src/log";
import {
  startActivityServer,
  type ActivityServerOptions,
  type RunningActivityServer,
} from "../src/server";

export const SECRET = "test-activity-secret-longer-than-16";
export const INSTANCE = "i-1234567890-gc-1111-2222";

export const user = (n: number): string => String(100_000_000_000_000_000n + BigInt(n));
export const U1 = user(1);
export const U2 = user(2);
export const U3 = user(3);

/** Tokens the fake Discord knows. */
export const TOKENS: Record<string, DiscordIdentity> = {
  "token-goku-1": { userId: U1, name: "Son Goku", avatar: null },
  "token-vegeta-2": { userId: U2, name: "Vegeta", avatar: "abc123" },
  "token-bulma-3": { userId: U3, name: "Bulma", avatar: null },
};

export function fakeDiscord(): DiscordPort & { identifyCalls: number } {
  const port = {
    identifyCalls: 0,
    async exchangeCode(code: string) {
      return code === "good-code-123"
        ? ({ ok: true, accessToken: "token-goku-1" } as const)
        : ({ ok: false, reason: "invalid_code" } as const);
    },
    async identify(token: string) {
      port.identifyCalls += 1;
      return TOKENS[token] ?? null;
    },
  };
  return port;
}

const text = (value: string) => ({ fr: value, en: value, ja: value });

/** A bank whose right answer to "Question i" is "Right i" (tests only). */
export function testBank(count = 12): QuizBank {
  const questions: QuizQuestion[] = [];
  const categories = ["characters", "techniques", "sagas"] as const;
  for (let i = 0; i < count; i++) {
    questions.push({
      id: `test:q${i}`,
      category: categories[i % categories.length]!,
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

export function correctChoice(question: PublicQuestion): number {
  const number = /^Question (\d+)$/.exec(question.prompt.fr)?.[1];
  const index = question.choices.findIndex((choice) => choice.fr === `Right ${number}`);
  if (index < 0) throw new Error("right answer not among the choices");
  return index;
}

export function testConfig(extra: Record<string, string> = {}): ActivityConfig {
  return loadConfig({
    SHENRON_ACTIVITY_HOST: "127.0.0.1",
    SHENRON_ACTIVITY_PORT: "0",
    SHENRON_ACTIVITY_SECRET: SECRET,
    DISCORD_CLIENT_ID: "123456789012345678",
    DISCORD_CLIENT_SECRET: "client-secret-value",
    SHENRON_BOT_API_URL: "http://bot.test",
    SHENRON_ACTIVITY_TOKEN: "service-token-1",
    ...extra,
  });
}

/** A round fast enough for tests: answers are accepted at once, reveals are short. */
export const FAST_LIMITS = {
  resultsHoldMs: 60_000,
  session: {
    questionTimeMs: 4_000,
    revealMs: 120,
    minAnswerMs: 0,
    maxTooFastStrikes: 3,
    awayAfterMisses: 3,
  },
} as const;

export function startTestServer(
  overrides: Partial<ActivityServerOptions> = {},
): RunningActivityServer {
  return startActivityServer({
    config: testConfig(),
    discord: fakeDiscord(),
    bank: testBank(),
    limits: FAST_LIMITS,
    log: silentLogger,
    ...overrides,
  });
}

/** A WebSocket client that records what the server sends. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  readonly opened: Promise<void>;
  readonly socket: WebSocket;
  #waiters: Array<() => void> = [];

  constructor(url: string) {
    this.socket = new WebSocket(`${url.replace(/^http/, "ws")}/ws`);
    this.opened = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve());
      this.socket.addEventListener("error", () => reject(new Error("socket error")));
    });
    this.closed = new Promise((resolve) => {
      this.socket.addEventListener("close", (event) =>
        resolve({ code: event.code, reason: event.reason }),
      );
    });
    this.socket.addEventListener("message", (event) => {
      const message = parseServerMessage(event.data);
      if (message) this.messages.push(message);
      for (const waiter of this.#waiters.splice(0)) waiter();
    });
  }

  async hello(token: string, instanceId = INSTANCE): Promise<void> {
    await this.opened;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "hello", token, instanceId }));
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }

  /** Resolves with the first message (already received or future) that satisfies `match`. */
  async waitFor<T extends ServerMessage["type"]>(
    type: T,
    match: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 5_000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.of(type).find(match);
      if (found) return found;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.#waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}
