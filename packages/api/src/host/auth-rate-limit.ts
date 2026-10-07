// SPDX-License-Identifier: Apache-2.0
import type { BetterAuthOptions } from "better-auth";
import type { RedisLike } from "@shenron/db/redis";

export type AuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

// Increment and expiry must execute together, including recovery of legacy keys without TTL.
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

export function createAuthRateLimitStorage(
  redis: Pick<RedisLike, "send"> | null = null,
  now: () => number = Date.now,
  timeoutMs = 1000,
): AuthRateLimitStorage {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async consume(key, rule) {
      if (redis) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            redis.send("EVAL", [CONSUME, "1", `dbfr:ba-rate-limit:${key}`, String(rule.window)]),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Authentication rate limit timeout")),
                timeoutMs,
              );
            }),
          ]);
          if (
            !Array.isArray(result) ||
            result.length !== 2 ||
            !result.every((value) => typeof value === "number" && Number.isFinite(value))
          ) {
            throw new Error("Invalid authentication rate limit reply");
          }
          const [count, ttl] = result as [number, number];
          return {
            allowed: count <= rule.max,
            retryAfter: count <= rule.max ? null : Math.max(1, ttl),
          };
        } catch {
          // Redis is optional; its outage must leave a local limit in place.
        } finally {
          clearTimeout(timer);
        }
      }
      const time = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= time) {
        for (const [expiredKey, value] of windows) {
          if (value.resetAt <= time) windows.delete(expiredKey);
        }
        // Bound memory under an attack with distinct keys. Refuse new keys until a slot expires.
        if (!windows.has(key) && windows.size >= 10_000) {
          return { allowed: false, retryAfter: rule.window };
        }
        entry = { count: 0, resetAt: time + rule.window * 1000 };
        windows.set(key, entry);
      }
      if (entry.count >= rule.max) {
        return {
          allowed: false,
          retryAfter: Math.max(1, Math.ceil((entry.resetAt - time) / 1000)),
        };
      }
      entry.count += 1;
      return { allowed: true, retryAfter: null };
    },
  };
}
