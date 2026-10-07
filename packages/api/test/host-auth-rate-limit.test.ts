// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createAuthRateLimitStorage } from "../src/host/auth-rate-limit";

const rule = { window: 60, max: 2 };

test("memory fallback refuses concurrent excess and resets only after the window", async () => {
  let time = 0;
  const storage = createAuthRateLimitStorage(null, () => time);
  const results = await Promise.all(Array.from({ length: 20 }, () => storage.consume("ip", rule)));
  expect(results.filter((result) => result.allowed)).toHaveLength(2);
  time = 59_001;
  expect(await storage.consume("ip", rule)).toEqual({ allowed: false, retryAfter: 1 });
  time = 60_000;
  expect((await storage.consume("ip", rule)).allowed).toBe(true);
});

test("two host instances share the Redis budget and use the existing site namespace", async () => {
  let count = 0;
  const redis = {
    async send(command: string, args: string[]) {
      expect(command).toBe("EVAL");
      expect(args.slice(1)).toEqual(["1", "dbfr:ba-rate-limit:ip", "60"]);
      return [++count, 42];
    },
  };
  const first = createAuthRateLimitStorage(redis);
  const second = createAuthRateLimitStorage(redis);
  expect((await first.consume("ip", rule)).allowed).toBe(true);
  expect((await second.consume("ip", rule)).allowed).toBe(true);
  expect(await first.consume("ip", rule)).toEqual({ allowed: false, retryAfter: 42 });
});

test("Redis errors and malformed replies preserve the local limit", async () => {
  for (const send of [
    async () => {
      throw new Error("offline");
    },
    async () => ["invalid", 2],
  ]) {
    const storage = createAuthRateLimitStorage({ send });
    expect((await storage.consume("ip", rule)).allowed).toBe(true);
    expect((await storage.consume("ip", rule)).allowed).toBe(true);
    expect((await storage.consume("ip", rule)).allowed).toBe(false);
  }
});

test("the memory fallback bounds distinct keys without evicting active budgets", async () => {
  let time = 0;
  const storage = createAuthRateLimitStorage(null, () => time);
  for (let i = 0; i < 10_000; i++) await storage.consume(String(i), rule);
  expect((await storage.consume("overflow", rule)).allowed).toBe(false);
  expect((await storage.consume("0", rule)).allowed).toBe(true);
  expect((await storage.consume("0", rule)).allowed).toBe(false);
  time = 60_000;
  expect((await storage.consume("overflow", rule)).allowed).toBe(true);
});

test("an unresponsive Redis command cannot stall authentication", async () => {
  const storage = createAuthRateLimitStorage({ send: () => new Promise(() => {}) }, Date.now, 5);
  expect((await storage.consume("ip", rule)).allowed).toBe(true);
  expect((await storage.consume("ip", rule)).allowed).toBe(true);
  expect((await storage.consume("ip", rule)).allowed).toBe(false);
});
