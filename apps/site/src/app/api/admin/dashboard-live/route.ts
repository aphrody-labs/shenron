import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { fetchEnvelopes, postJsonRpc } from "@/lib/a2a-hub";
import { botApiBaseUrl } from "@/lib/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isAdminOrToken } from "@/lib/admin-guard";
import { resolveRedisUrl } from "@shenron/config/services";
import {
  DashboardMonitoring,
  type LiveDashboardResponse,
  type LiveService,
} from "@/lib/admin-dashboard";
import { pingDashboardRedis } from "@/lib/admin-dashboard-probes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServiceProbe = LiveService;
type LivePayload = LiveDashboardResponse;

// Brief private snapshot cache; every caller is authorized before cache access.
let cachedPayload: { data: LivePayload; expiresAt: number } | null = null;
const CACHE_TTL_MS = 6_000;

const timeout = async <T>(work: Promise<T>, milliseconds = 1_500): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Probe timeout")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

async function probeHttp(
  id: ServiceProbe["id"],
  label: string,
  url: string,
  headers?: HeadersInit,
  timeoutMs = 1_500,
): Promise<ServiceProbe> {
  const started = performance.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await (async () => {
      const response = await fetch(url, {
        cache: "no-store",
        headers,
        signal: controller.signal,
      });
      if (!response.ok) return { valid: false, status: response.status };
      const body = await response.json();
      const valid =
        id === "api" ? body?.status === "ok" : DashboardMonitoring.safeParse(body).success;
      return { valid, status: response.status };
    })().finally(() => clearTimeout(timer));
    const latencyMs = Math.round(performance.now() - started);
    return {
      id,
      label,
      state: response.valid ? "ok" : "degraded",
      latencyMs,
      detail: response.valid
        ? "response_ok"
        : response.status === 200
          ? "invalid_response"
          : `HTTP ${response.status}`,
    };
  } catch {
    return {
      id,
      label,
      state: "down",
      latencyMs: Math.round(performance.now() - started),
      detail: "probe_unavailable",
    };
  }
}

async function probeDatabase(): Promise<ServiceProbe> {
  const started = performance.now();
  try {
    await timeout(db.execute(sql`select 1`), 1_500);
    return {
      id: "database",
      label: "PostgreSQL",
      state: "ok",
      latencyMs: Math.round(performance.now() - started),
      detail: "database_ok",
    };
  } catch {
    return {
      id: "database",
      label: "PostgreSQL",
      state: "down",
      latencyMs: Math.round(performance.now() - started),
      detail: "database_failed",
    };
  }
}

async function probeRedis(): Promise<ServiceProbe> {
  const started = performance.now();
  try {
    await pingDashboardRedis(resolveRedisUrl(process.env));
    return {
      id: "redis",
      label: "Redis",
      state: "ok",
      latencyMs: Math.round(performance.now() - started),
      detail: "redis_ok",
    };
  } catch {
    return {
      id: "redis",
      label: "Redis",
      state: "down",
      latencyMs: Math.round(performance.now() - started),
      detail: "redis_failed",
    };
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAdminOrToken(req))) {
    return NextResponse.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const now = Date.now();
  if (cachedPayload && now < cachedPayload.expiresAt) {
    return NextResponse.json(cachedPayload.data, {
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  }

  const token = env.SHENRON_ADMIN_TOKEN;
  const API_URL = botApiBaseUrl();
  const [api, database, redis, backOffice] = await Promise.all([
    probeHttp("api", "API bot", `${API_URL}/health`),
    probeDatabase(),
    probeRedis(),
    token
      ? probeHttp("backOffice", "Back-office bot", `${API_URL}/api/health/monitoring`, {
          authorization: `Bearer ${token}`,
        })
      : Promise.resolve<ServiceProbe>({
          id: "backOffice",
          label: "Back-office bot",
          state: "unknown",
          latencyMs: null,
          detail: "admin_unconfigured",
        }),
  ]);

  const [mailbox, taskReplies] = await Promise.all([
    timeout(fetchEnvelopes(100)).catch(() => null),
    Promise.all(
      ["submitted", "working"].map((status) =>
        timeout(
          postJsonRpc({
            jsonrpc: "2.0",
            id: `dashboard-${status}`,
            method: "ListTasks",
            params: { pageSize: 100, status },
          }),
        ).catch(() => null),
      ),
    ),
  ]);
  const envelopeSchema = z.array(
    z.object({
      ts: z.string(),
      from: z.string(),
      to: z.string(),
    }),
  );
  const parsedEnvelopes = mailbox?.status === 200 ? envelopeSchema.safeParse(mailbox.body) : null;
  const envelopes = parsedEnvelopes?.success ? parsedEnvelopes.data : [];
  const activityNow = Date.now();
  const recentEnvelopes = envelopes.filter((envelope) => {
    const timestamp = Date.parse(envelope.ts);
    return (
      Number.isFinite(timestamp) &&
      timestamp <= activityNow &&
      activityNow - timestamp <= 5 * 60_000
    );
  });
  const peers = [
    ...new Set(
      recentEnvelopes
        .flatMap((envelope) => [envelope.from, envelope.to])
        .filter((peer) => peer && peer !== "broadcast" && peer !== "shenron-dragonball"),
    ),
  ];
  const taskSchema = z.object({ result: z.object({ totalSize: z.number().int().nonnegative() }) });
  const counts = taskReplies.map((reply) =>
    reply?.status === 200 ? taskSchema.safeParse(reply.body) : null,
  );
  const activeTasks = counts.every((count) => count?.success)
    ? counts.reduce((sum, count) => sum + (count?.success ? count.data.result.totalSize : 0), 0)
    : null;

  const payload: LivePayload = {
    services: [api, database, redis, backOffice],
    agents: {
      activePeers: peers,
      recentActivity: parsedEnvelopes?.success ? recentEnvelopes.length : null,
      activeTasks,
      latestActivityAt:
        recentEnvelopes.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0]?.ts ?? null,
    },
    sampledAt: new Date().toISOString(),
    refreshAfterMs: 10_000,
  };

  cachedPayload = {
    data: payload,
    expiresAt: now + CACHE_TTL_MS,
  };

  return NextResponse.json(payload, {
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}
