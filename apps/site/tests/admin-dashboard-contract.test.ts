import { expect, test } from "bun:test";
import { DashboardLive } from "../src/lib/admin-dashboard";

const live = {
  services: [],
  agents: { activePeers: [], activeTasks: 0, recentActivity: 0, latestActivityAt: null },
  sampledAt: "2026-10-13T12:00:00Z",
  refreshAfterMs: 10000,
};

test("live dashboard rejects invalid timestamps before rendering them", () => {
  expect(DashboardLive.safeParse(live).success).toBe(true);
  expect(DashboardLive.safeParse({ ...live, sampledAt: "invalid" }).success).toBe(false);
  expect(
    DashboardLive.safeParse({ ...live, agents: { ...live.agents, latestActivityAt: "invalid" } })
      .success,
  ).toBe(false);
});

test("live dashboard accepts ISO timestamps with timezone offsets", () => {
  expect(
    DashboardLive.safeParse({
      ...live,
      sampledAt: "2026-10-13T14:00:00+02:00",
      agents: { ...live.agents, latestActivityAt: "2026-10-13T13:59:00+02:00" },
    }).success,
  ).toBe(true);
});
