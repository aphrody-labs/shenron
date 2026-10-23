// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  ClientMessageSchema,
  encodeServerMessage,
  ERROR_CODES,
  parseClientMessage,
  parseServerMessage,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  QuizConfigPatchSchema,
  QuizSourceSchema,
  ServerMessageSchema,
} from "../src";
import { msg, U1 } from "./helpers";

const frame = (value: unknown): string => JSON.stringify(value);
const code = (raw: unknown) => {
  const result = parseClientMessage(raw);
  return result.ok ? "ok" : result.code;
};

describe("client messages: valid frames", () => {
  test("every intent parses", () => {
    const valid: unknown[] = [
      msg.ping(),
      msg.ping(1_800_000_000_000),
      msg.start(),
      msg.leave(),
      msg.playAgain(),
      msg.kick(U1),
      msg.configure({ questionCount: 5 }),
      msg.configure({ categories: ["characters", "techniques"] }),
      msg.configure({ questionCount: 10, categories: ["databooks"] }),
      msg.answer("lq3k9d2a-1", 0, 3),
      msg.answer("a-9999", 9, 0),
    ];
    for (const message of valid) {
      const parsed = parseClientMessage(frame(message));
      expect(parsed.ok).toBe(true);
    }
  });

  test("an already parsed object is accepted too (in-process tests)", () => {
    expect(parseClientMessage(msg.start()).ok).toBe(true);
  });
});

describe("client messages: rejected frames", () => {
  test("not JSON, not an object, binary", () => {
    expect(code("not json")).toBe("invalid_message");
    expect(code("")).toBe("invalid_message");
    expect(code("null")).toBe("invalid_message");
    expect(code("42")).toBe("invalid_message");
    expect(code('"start"')).toBe("invalid_message");
    expect(code("[]")).toBe("invalid_message");
    expect(code(null)).toBe("invalid_message");
    expect(code(undefined)).toBe("invalid_message");
    expect(code(new Uint8Array([123, 125]))).toBe("invalid_message");
    expect(code(new ArrayBuffer(8))).toBe("invalid_message");
  });

  test("a frame over the size limit is refused before parsing", () => {
    const big = frame({ v: PROTOCOL_VERSION, type: "ping", pad: "x".repeat(5000) });
    expect(code(big)).toBe("message_too_large");
    const limit = PROTOCOL_LIMITS.maxClientMessageBytes;
    const exact = frame({ v: PROTOCOL_VERSION, type: "ping" });
    expect(exact.length).toBeLessThan(limit);
    expect(code(exact)).toBe("ok");
    // The limit counts UTF-8 bytes, not characters.
    const multibyte = `{"v":1,"type":"ping","t":0,"x":"${"é".repeat(limit / 2)}"}`;
    expect(multibyte.length).toBeLessThan(limit);
    expect(code(multibyte)).toBe("message_too_large");
  });

  test("another protocol version is reported as such, never interpreted", () => {
    expect(code(frame({ v: 2, type: "ping" }))).toBe("unsupported_protocol");
    expect(code(frame({ v: 0, type: "start" }))).toBe("unsupported_protocol");
    expect(code(frame({ type: "ping" }))).toBe("invalid_message");
    expect(code(frame({ v: "1", type: "ping" }))).toBe("invalid_message");
  });

  test("unknown or missing type", () => {
    expect(code(frame({ v: 1, type: "teleport" }))).toBe("invalid_message");
    expect(code(frame({ v: 1 }))).toBe("invalid_message");
    expect(code(frame({ v: 1, type: 7 }))).toBe("invalid_message");
  });

  test("unknown keys are refused (nothing can be smuggled into an intent)", () => {
    expect(code(frame({ v: 1, type: "start", userId: U1 }))).toBe("invalid_message");
    expect(code(frame({ v: 1, type: "ping", xp: 9999 }))).toBe("invalid_message");
    expect(code(frame({ ...msg.answer("a-1", 0, 1), score: 1000 }))).toBe("invalid_message");
    expect(code(frame({ ...msg.answer("a-1", 0, 1), elapsedMs: 1 }))).toBe("invalid_message");
    expect(code('{"v":1,"type":"start","__proto__":{"admin":true}}')).toBe("invalid_message");
    expect(code('{"v":1,"type":"start","constructor":{"prototype":{}}}')).toBe("invalid_message");
  });

  test("answer: choice, index and round id are bounded", () => {
    for (const bad of [
      { roundId: "a-1", index: 0, choice: 4 },
      { roundId: "a-1", index: 0, choice: -1 },
      { roundId: "a-1", index: 0, choice: 1.5 },
      { roundId: "a-1", index: 0, choice: "1" },
      { roundId: "a-1", index: 10, choice: 1 },
      { roundId: "a-1", index: -1, choice: 1 },
      { roundId: "a-1", index: 0.5, choice: 1 },
      { roundId: "", index: 0, choice: 1 },
      { roundId: "A-1", index: 0, choice: 1 },
      { roundId: "a-1; drop table", index: 0, choice: 1 },
      { roundId: "a-12345", index: 0, choice: 1 },
      { roundId: "a-1", index: 0 },
      { index: 0, choice: 1 },
      { roundId: "a-1", index: 0, choice: Number.NaN },
      { roundId: "a-1", index: 0, choice: null },
    ]) {
      expect(code(frame({ v: 1, type: "answer", ...bad }))).toBe("invalid_message");
    }
  });

  test("kick: the target must be a snowflake", () => {
    for (const userId of [
      "",
      "abc",
      "12",
      "1".repeat(26),
      "1234 5678",
      123456,
      null,
      "<@123456>",
    ]) {
      expect(code(frame({ v: 1, type: "kick", userId }))).toBe("invalid_message");
    }
  });

  test("configure: bounds, duplicates, unknown categories, empty patch", () => {
    for (const config of [
      {},
      { questionCount: 4 },
      { questionCount: 11 },
      { questionCount: 7.5 },
      { questionCount: "8" },
      { categories: [] },
      { categories: ["characters", "characters"] },
      { categories: ["cooking"] },
      { categories: "characters" },
      { categories: Array.from({ length: 8 }, () => "characters") },
      { questionCount: 8, timeLimitMs: 1 },
      { questionCount: 8, extra: true },
    ]) {
      expect(code(frame({ v: 1, type: "configure", config }))).toBe("invalid_message");
    }
    expect(QuizConfigPatchSchema.safeParse({ questionCount: 5 }).success).toBe(true);
    expect(code(frame({ v: 1, type: "configure" }))).toBe("invalid_message");
  });

  test("ping: the echo must be a finite number", () => {
    expect(code(frame({ v: 1, type: "ping", t: "now" }))).toBe("invalid_message");
    expect(code('{"v":1,"type":"ping","t":1e999}')).toBe("invalid_message");
  });
});

describe("server messages", () => {
  test("a valid message round-trips through encode and parse", () => {
    const message = {
      v: PROTOCOL_VERSION,
      type: "error",
      code: "rate_limited",
      retryAfterMs: 250,
    } as const;
    expect(parseServerMessage(encodeServerMessage(message))).toEqual(message);
    expect(parseServerMessage(message)).toEqual(message);
  });

  test("the client rejects what is not a server message", () => {
    expect(parseServerMessage("nope")).toBeNull();
    expect(parseServerMessage({ v: 1, type: "error", code: "made_up" })).toBeNull();
    expect(parseServerMessage({ v: 2, type: "pong", serverTime: 1 })).toBeNull();
    expect(parseServerMessage({ v: 1, type: "closed", reason: "bored" })).toBeNull();
    expect(parseServerMessage({ v: 1, type: "kicked", reason: "host", extra: 1 })).toBeNull();
  });

  test("a question never carries its answer or its source", () => {
    const question = {
      roundId: "a-1",
      index: 0,
      total: 5,
      category: "characters",
      prompt: { fr: "Q", en: "Q", ja: "Q" },
      choices: ["A", "B", "C", "D"].map((t) => ({ fr: t, en: t, ja: t })),
      startedAt: 1,
      deadlineAt: 2,
    };
    expect(ServerMessageSchema.safeParse({ v: 1, type: "question", question }).success).toBe(true);
    for (const leak of [
      { answerIndex: 1 },
      { correct: 1 },
      { source: { type: "lexicon", id: "x" } },
    ]) {
      expect(
        ServerMessageSchema.safeParse({
          v: 1,
          type: "question",
          question: { ...question, ...leak },
        }).success,
      ).toBe(false);
    }
    expect(
      ServerMessageSchema.safeParse({
        v: 1,
        type: "question",
        question: { ...question, choices: question.choices.slice(0, 3) },
      }).success,
    ).toBe(false);
  });

  test("question sources: https links only", () => {
    const page = (url: string) => ({ type: "page", kind: "wiki", url });
    expect(QuizSourceSchema.safeParse(page("https://dragonballfr.com/wiki/son-goku")).success).toBe(
      true,
    );
    for (const url of [
      "http://dragonballfr.com/wiki/x",
      "javascript:alert(1)",
      "data:text/html,<script>",
      "//dragonballfr.com/x",
      "https://x.com/a b",
      'https://x.com/"onmouseover="x',
    ]) {
      expect(QuizSourceSchema.safeParse(page(url)).success).toBe(false);
    }
    expect(QuizSourceSchema.safeParse({ type: "lexicon", id: "Not A Slug" }).success).toBe(false);
  });

  test("client and server schemas do not share a type name", () => {
    const client = new Set(ClientMessageSchema.options.map((o) => o.shape.type.value));
    const server = ServerMessageSchema.options.map((o) => o.shape.type.value);
    // `ping` / `pong` are distinct; nothing sent by the client is also a server message.
    expect(server.filter((type) => client.has(type as never))).toEqual([]);
  });

  test("the error code list is closed and unique", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
