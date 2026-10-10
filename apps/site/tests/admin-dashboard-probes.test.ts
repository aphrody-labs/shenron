import { describe, expect, test } from "bun:test";
import net from "node:net";
import { pingDashboardRedis } from "../src/lib/admin-dashboard-probes";
import { dashboardHealthy, DashboardMonitoring } from "../src/lib/admin-dashboard";

async function withRedis(
  reply: (data: string) => string | null,
  run: (url: string) => Promise<void>,
) {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("data", (data) => {
      const response = reply(data.toString());
      if (response !== null) socket.write(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`redis://127.0.0.1:${(server.address() as net.AddressInfo).port}`);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("dashboard Redis protocol", () => {
  test("accepts PONG and authenticated PING", async () => {
    await withRedis(
      (data) => (data.includes("AUTH") ? "+OK\r\n+PONG\r\n" : "+PONG\r\n"),
      async (url) => {
        await pingDashboardRedis(url);
        await pingDashboardRedis(url.replace("redis://", "redis://default:secret@"));
      },
    );
  });
  test("rejects a listening port that never answers PING", async () => {
    await withRedis(
      () => null,
      async (url) => {
        await expect(pingDashboardRedis(url, 30)).rejects.toThrow("timeout");
      },
    );
  });
  test("rejects authentication errors without disclosing credentials", async () => {
    await withRedis(
      () => "-WRONGPASS secret\r\n",
      async (url) => {
        await expect(
          pingDashboardRedis(url.replace("redis://", "redis://default:secret@")),
        ).rejects.toThrow("authentication failed");
      },
    );
  });
});

describe("dashboard evidence", () => {
  test("unknown, missing and duplicate services cannot produce an all-healthy summary", () => {
    const base = {
      agents: { activePeers: [], activeTasks: 0, recentActivity: 0, latestActivityAt: null },
      sampledAt: "now",
      refreshAfterMs: 10000,
    };
    const services = (["api", "database", "redis", "backOffice"] as const).map((id) => ({
      id,
      label: id,
      state: "ok" as const,
      latencyMs: 1,
      detail: "ok",
    }));
    expect(dashboardHealthy({ ...base, services })).toBe(true);
    expect(dashboardHealthy(undefined)).toBe(false);
    expect(dashboardHealthy({ ...base, services: services.slice(1) })).toBe(false);
    expect(
      dashboardHealthy({
        ...base,
        services: services.map((service) => ({ ...service, id: "api" })),
      }),
    ).toBe(false);
    expect(
      dashboardHealthy({
        ...base,
        services: services.map((service) => ({ ...service, state: "unknown" })),
      }),
    ).toBe(false);
  });
  test("a liveness or HTML response is insufficient for monitoring", () => {
    expect(DashboardMonitoring.safeParse({ status: "ok" }).success).toBe(false);
    expect(DashboardMonitoring.safeParse("<html>login</html>").success).toBe(false);
  });
});
