/** Authentification Bearer de la sonde du tableau de bord, sans secret réel. */
import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => false }));
mock.module("@/lib/api-token", () => ({
  hasValidApiToken: (req: Request) =>
    req.headers.get("authorization") === "Bearer test-admin-token",
}));
mock.module("@/lib/config", () => ({
  API_URL: "http://bot.test",
  botApiBaseUrl: () => "http://bot.test",
}));
mock.module("@/lib/env", () => ({ env: { SHENRON_ADMIN_TOKEN: "test-admin-token" } }));
mock.module("@/lib/db", () => ({ db: { execute: async () => [{ ok: 1 }] } }));
mock.module("@/lib/a2a-hub", () => ({
  fetchEnvelopes: async () => ({ status: 200, body: [] }),
  postJsonRpc: async (request: { params: { status: string } }) => ({
    status: 200,
    body: { result: { totalSize: request.params.status === "working" ? 1 : 0 } },
  }),
}));
mock.module("@/lib/admin-dashboard-probes", () => ({ pingDashboardRedis: async () => {} }));

globalThis.fetch = mock(async (input: string | URL | Request) =>
  Response.json(
    String(input).endsWith("/health")
      ? { status: "ok" }
      : {
          botStatus: { online: false, uptime: null },
          pid: { cpu: 1, memory: 1, uptime: 1, rss: 1 },
          host: {
            cpu: { count: 1, usage: 1 },
            memory: { total: 1, free: 0, used: 1, usage: 1 },
            platform: "linux",
            uptime: 1,
          },
          latency: { ws: -1, db: 1 },
        },
  ),
) as unknown as typeof fetch;
const { GET } = await import("../src/app/api/admin/dashboard-live/route");

describe("sonde dashboard par jeton admin", () => {
  test("refuse l'anonyme et accepte le Bearer valide", async () => {
    expect((await GET(new NextRequest("http://test/api/admin/dashboard-live"))).status).toBe(403);
    const response = await GET(
      new NextRequest("http://test/api/admin/dashboard-live", {
        headers: { authorization: "Bearer test-admin-token" },
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.services.find((service: { id: string }) => service.id === "api").state).toBe(
      "ok",
    );
    expect(
      payload.services.find((service: { id: string }) => service.id === "backOffice"),
    ).toMatchObject({
      state: "degraded",
      detail: "bot_offline",
    });
    expect(payload.agents.activeTasks).toBe(1);
    expect(response.headers.get("cache-control")).toContain("private");
    expect((await GET(new NextRequest("http://test/api/admin/dashboard-live"))).status).toBe(403);
  });
});
