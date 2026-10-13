import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import DashboardPage from "../src/app/admin/dashboard/page";
import fr from "../messages/fr.json";
import en from "../messages/en.json";
import ja from "../messages/ja.json";

const monitoring = {
  botStatus: { online: true, uptime: 60000 },
  pid: { cpu: 1, memory: 1000000, uptime: 60000, rss: 1048576 },
  host: {
    cpu: { count: 4, usage: 10 },
    memory: { total: 2000000, free: 1000000, used: 1000000, usage: 50 },
    platform: "linux",
    uptime: 900000,
  },
  latency: { ws: 42, db: 1 },
};
const bot = {
  id: "shenron",
  name: "Shenron",
  username: "Shenron",
  avatar: null,
  online: true,
  uptime: 60000,
  wsPing: 42,
  intents: 0,
  guildCount: 1,
  commandCount: 118,
};

function render(
  locale: "fr" | "en" | "ja",
  options: {
    unknown?: boolean;
    botsMissing?: boolean;
    offline?: boolean;
    automationUnavailable?: boolean;
    monitoringError?: boolean;
    statsError?: boolean;
    botsError?: boolean;
    liveError?: boolean;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (!options.botsMissing)
    client.setQueryData(["admin", "dashboard-bots"], {
      bots: [{ ...bot, online: !options.offline }],
    });
  client.setQueryData(["admin", "dashboard-monitoring"], monitoring);
  client.setQueryData(["admin", "dashboard-totals"], {
    stats: { totalUsers: 5757, totalActiveUsers: 2210, totalGuilds: 1, totalCommands: 118 },
  });
  client.setQueryData(["admin", "dashboard-live"], {
    services: ["api", "database", "redis", "backOffice"].map((id) => ({
      id,
      label: id,
      state: options.unknown && id === "redis" ? "unknown" : "ok",
      latencyMs: 1,
      detail: "response_ok",
    })),
    agents: {
      activePeers: [],
      activeTasks: options.automationUnavailable ? null : 0,
      recentActivity: options.automationUnavailable ? null : 0,
      latestActivityAt: null,
    },
    sampledAt: "2026-10-10T12:00:00Z",
    refreshAfterMs: 10000,
  });
  for (const [key, failed] of [
    ["dashboard-monitoring", options.monitoringError],
    ["dashboard-totals", options.statsError],
    ["dashboard-bots", options.botsError],
    ["dashboard-live", options.liveError],
  ] as const) {
    if (failed)
      client
        .getQueryCache()
        .find({ queryKey: ["admin", key] })
        ?.setState({ status: "error", error: new Error("Probe failed") });
  }
  try {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider
          locale={locale}
          messages={{ fr, en, ja }[locale]}
          timeZone="Europe/Paris"
        >
          <DashboardPage />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  } finally {
    client.clear();
  }
}

describe("admin dashboard rendered evidence", () => {
  test("failed metric refreshes stop presenting cached values as current", () => {
    const unavailableMonitoring = render("fr", { monitoringError: true });
    expect(unavailableMonitoring).toContain(fr.adminDashboard.hostUnavailable);
    expect(unavailableMonitoring).not.toContain("linux");
    const stats = render("en", { statsError: true });
    expect(stats).not.toContain("5,757");
    const bots = render("fr", { botsError: true });
    expect(bots).toContain(fr.adminDashboard.botsUnavailable);
    expect(bots).not.toContain(fr.adminDashboard.operational);
  });
  test("failed live refresh hides cached service and agent evidence", () => {
    const html = render("fr", { liveError: true });
    expect(html).toContain(fr.adminDashboard.liveError);
    expect(html).not.toContain(fr.adminDashboard.healthy);
    expect(html).not.toContain(fr.adminDashboard.technical);
    expect(html).not.toContain(fr.adminDashboard.agentsIdle);
  });
  for (const locale of ["fr", "en", "ja"] as const) {
    test(`renders real metrics and all dictionary keys in ${locale}`, () => {
      const html = render(locale);
      const messages = { fr, en, ja }[locale].adminDashboard;
      expect(html).toContain(messages.title);
      expect(html).toContain(messages.healthy);
      expect(html).toContain("Shenron");
      expect(html).toContain("118");
      expect(html).toContain("1.0");
      expect(html).not.toContain("adminDashboard.");
      expect(html).not.toContain("MISSING_MESSAGE");
    });
  }
  test("unknown service and offline Discord never render an all-healthy summary", () => {
    expect(render("fr", { unknown: true })).not.toContain(fr.adminDashboard.healthy);
    expect(render("fr", { offline: true })).not.toContain(fr.adminDashboard.healthy);
  });
  test("missing bots stay unmeasured and unavailable automation is explicit", () => {
    const missing = render("fr", { botsMissing: true });
    expect(missing).not.toContain(fr.adminDashboard.healthy);
    expect(missing).not.toContain("0 / 0");
    const automation = render("fr", { automationUnavailable: true });
    expect(automation).toContain(fr.adminDashboard.agentsUnavailable);
    expect(automation).not.toContain(fr.adminDashboard.healthy);
  });
});
