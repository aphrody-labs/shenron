import { z } from "zod";
import { BotAdminStats } from "@aphrody/shenron-api/contract";

const measurement = z.number().finite().nonnegative();
export const DashboardMonitoring = z.object({
  botStatus: z.object({ online: z.boolean(), uptime: measurement.nullable() }),
  pid: z.object({ cpu: measurement, memory: measurement, uptime: measurement, rss: measurement }),
  host: z.object({
    cpu: z.object({ count: measurement, usage: measurement }),
    memory: z.object({
      total: measurement,
      free: measurement,
      used: measurement,
      usage: measurement,
    }),
    platform: z.string(),
    uptime: measurement,
  }),
  latency: z.object({ ws: z.number().finite(), db: measurement }),
});
export const DashboardTotals = BotAdminStats;
export const DashboardBots = z.object({
  bots: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      username: z.string().nullable(),
      avatar: z.string().nullable(),
      online: z.boolean(),
      uptime: measurement.nullable(),
      wsPing: z.number().finite(),
      intents: measurement,
      guildCount: measurement,
      commandCount: measurement,
    }),
  ),
});
export const DashboardLive = z.object({
  services: z.array(
    z.object({
      id: z.enum(["api", "database", "redis", "backOffice"]),
      label: z.string(),
      state: z.enum(["ok", "degraded", "down", "unknown"]),
      latencyMs: measurement.nullable(),
      detail: z.string(),
    }),
  ),
  agents: z.object({
    activePeers: z.array(z.string()),
    recentActivity: measurement.nullable(),
    activeTasks: measurement.nullable(),
    latestActivityAt: z.iso.datetime({ offset: true }).nullable(),
  }),
  sampledAt: z.iso.datetime({ offset: true }),
  refreshAfterMs: measurement,
});
export type LiveDashboardResponse = z.infer<typeof DashboardLive>;
export type LiveService = LiveDashboardResponse["services"][number];

export function dashboardHealthy(data: LiveDashboardResponse | undefined): boolean {
  const ids = new Set(data?.services.map((service) => service.id));
  return ids.size === 4 && data?.services.every((service) => service.state === "ok") === true;
}
