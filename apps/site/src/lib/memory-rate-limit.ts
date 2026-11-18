import { resolveRedisUrl } from "@aphrody/shenron-config/services";
type RateLimitOptions = {
  windowMs: number;
  limit: number;
  namespace?: string;
  backend?: () => Promise<RedisClient>;
};
export type RateLimitDecision = {
  limited: boolean;
  retryAfter: number;
  remaining: number;
  backend: "redis" | "upstash" | "memory" | "unavailable";
};
interface RedisClient {
  onclose: ((error: Error) => void) | null;
  send(command: string, args: string[]): Promise<unknown>;
}
interface ConnectingRedisClient extends RedisClient {
  connect(): Promise<void>;
}
let client: RedisClient | null = null;
let loading: Promise<RedisClient> | null = null;
const memoryWindows = new Map<string, { count: number; resetAt: number }>();

function consumeInMemory(
  key: string,
  cost: number,
  windowMs: number,
  limit: number,
): RateLimitDecision {
  const now = Date.now();
  let entry = memoryWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memoryWindows.size > 10_000) {
      for (const [k, v] of memoryWindows) if (v.resetAt <= now) memoryWindows.delete(k);
    }
    entry = { count: 0, resetAt: now + windowMs };
    memoryWindows.set(key, entry);
  }
  entry.count += cost;
  return {
    limited: entry.count > limit,
    retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - entry.count),
    backend: "memory",
  };
}

async function consumeUpstashRest(
  key: string,
  cost: number,
  windowMs: number,
  limit: number,
): Promise<RateLimitDecision | null> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!restUrl || !restToken) return null;
  const res = await fetch(`${restUrl.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${restToken}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCRBY", key, String(cost)],
      ["PEXPIRE", key, String(windowMs), "NX"],
      ["PTTL", key],
    ]),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const results = (await res.json()) as Array<{ result?: number }>;
  const count = Number(results[0]?.result ?? cost);
  const ttl = Number(results[2]?.result ?? windowMs);
  return {
    limited: count > limit,
    retryAfter: Math.max(1, Math.ceil(Math.max(1, ttl) / 1000)),
    remaining: Math.max(0, limit - count),
    backend: "upstash",
  };
}

async function redis(): Promise<RedisClient> {
  if (client) return client;
  if (loading) return loading;
  loading = (async () => {
    const { RedisClient } = (await import("bun")) as unknown as {
      RedisClient: new (url: string, options: Record<string, unknown>) => ConnectingRedisClient;
    };
    const value = new RedisClient(resolveRedisUrl(process.env), {
      autoReconnect: true,
      maxRetries: 2,
      enableOfflineQueue: false,
    });
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- single handler assignment is intended
    value.onclose = () => {
      if (client === value) client = null;
    };
    // Bun ouvre la connexion au premier envoi. Avec l'offline queue désactivée,
    // ce premier EVAL peut être refusé pendant le handshake et le site répond
    // alors 429 bien que Redis soit disponible. Attendre explicitement le
    // handshake conserve le refus fermé lors d'une vraie panne, sans faux refus.
    await value.connect();
    client = value;
    return value;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

const ATOMIC_WINDOW = `local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if count == tonumber(ARGV[1]) then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }`;

/** Compteur Redis atomique, partagé entre slots Next et instances du site (avec repli serverless Upstash/mémoire). */
export function createMemoryRateLimiter({
  windowMs,
  limit,
  namespace = "write",
  backend,
}: RateLimitOptions) {
  if (windowMs <= 0 || limit <= 0) throw new RangeError("Configuration de rate-limit invalide");
  return {
    async consume(key: string, cost = 1): Promise<RateLimitDecision> {
      const normalizedCost = Math.max(1, Math.floor(cost));
      const fullKey = `shenron:rate-limit:${namespace}:${key}`;
      const hasExplicitRedis = Boolean(
        process.env.REDIS_URL?.trim() || process.env.VALKEY_URL?.trim(),
      );
      if (!backend && !hasExplicitRedis) {
        try {
          const upstash = await consumeUpstashRest(fullKey, normalizedCost, windowMs, limit);
          if (upstash) return upstash;
        } catch (error) {
          console.warn("[rate-limit] Upstash REST indisponible, repli mémoire", error);
        }
        return consumeInMemory(fullKey, normalizedCost, windowMs, limit);
      }
      try {
        const result = (await (
          await (backend ?? redis)()
        ).send("EVAL", [
          ATOMIC_WINDOW,
          "1",
          fullKey,
          String(normalizedCost),
          String(windowMs),
        ])) as [number | string, number | string];
        const count = Number(result[0]);
        return {
          limited: count > limit,
          retryAfter: Math.max(1, Math.ceil(Math.max(1, Number(result[1])) / 1000)),
          remaining: Math.max(0, limit - count),
          backend: "redis",
        };
      } catch (error) {
        client = null;
        console.error("[rate-limit] Redis indisponible, écriture refusée", error);
        return {
          limited: true,
          retryAfter: Math.ceil(windowMs / 1000),
          remaining: 0,
          backend: "unavailable",
        };
      }
    },
  };
}
