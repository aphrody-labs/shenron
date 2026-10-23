import "./setup"; // must be first
import "./polish-api-env";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ApiServer } from "~/api/server";
import { env } from "~/lib/env";
import { botNoiseMeter } from "~/ui/noise-meter";

const TOKEN = "noise-meter-admin-token-0123456789";

describe("GET /api/health/noise (admin, read-only)", () => {
  const api = new ApiServer({} as never);
  const base = `http://127.0.0.1:${Bun.env.API_PORT}`;
  const saved = env.API_ADMIN_TOKEN;

  beforeAll(async () => {
    (env as { API_ADMIN_TOKEN?: string }).API_ADMIN_TOKEN = TOKEN;
    botNoiseMeter.clear();
    botNoiseMeter.record({ channelId: "100000000000000001", kind: "level" });
    botNoiseMeter.record({ channelId: "100000000000000001", kind: "news" });
    api.start();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await fetch(`${base}/api/health`).catch(() => null))?.ok) return;
      await Bun.sleep(25);
    }
  });
  afterAll(async () => {
    (env as { API_ADMIN_TOKEN?: string }).API_ADMIN_TOKEN = saved;
    botNoiseMeter.clear();
    await api.stop(true);
  });

  const get = (query = "", token: string | null = TOKEN) =>
    fetch(`${base}/api/health/noise${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  test("refuses callers without the admin token", async () => {
    expect((await get("", null)).status).toBeGreaterThanOrEqual(401);
    expect((await get("", "wrong-token-wrong-token-wrong")).status).toBeGreaterThanOrEqual(401);
  });

  test("returns the counters, never cached, and honours the window", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as {
      windowMs: number;
      totals: { all: number; noise: number; editorial: number };
      byKind: Record<string, { count: number; editorial: boolean }>;
      channels: Array<{ channelId: string; all: number }>;
    };
    expect(body.windowMs).toBe(24 * 3_600_000);
    expect(body.totals).toEqual({ all: 2, noise: 1, editorial: 1 });
    expect(body.byKind.news?.editorial).toBe(true);
    expect(body.channels[0]).toMatchObject({ channelId: "100000000000000001", all: 2 });

    const week = (await (await get("?hours=168")).json()) as { windowMs: number };
    expect(week.windowMs).toBe(168 * 3_600_000);
    const clamped = (await (await get("?hours=99999")).json()) as { windowMs: number };
    expect(clamped.windowMs).toBe(336 * 3_600_000);
    const junk = (await (await get("?hours=abc")).json()) as { windowMs: number };
    expect(junk.windowMs).toBe(24 * 3_600_000);
  });
});
