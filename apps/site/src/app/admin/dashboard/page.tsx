"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CircleAlert,
  Coins,
  Command,
  Cpu,
  Database,
  MessageSquare,
  Radio,
  RefreshCw,
  Server,
  Settings,
  PanelsTopLeft,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "@/lib/admin-api";
import { formatBytes } from "@/lib/admin-format";
import { type BotSummary } from "@/components/admin/BotSelector";
import { AdminPageHeader } from "@aphrody/shenron-ui/admin";
import styles from "./Dashboard.module.css";
import { NativePipelinePanel } from "@/components/admin/NativePipelinePanel";

import {
  DashboardBots,
  DashboardMonitoring,
  DashboardTotals,
  DashboardLive,
  dashboardHealthy,
  type LiveDashboardResponse,
  type LiveService,
} from "@/lib/admin-dashboard";

async function getLiveDashboard(signal: AbortSignal): Promise<LiveDashboardResponse> {
  const response = await fetch("/api/admin/dashboard-live", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Live dashboard probe unavailable (HTTP ${response.status})`);
  return DashboardLive.parse(await response.json());
}

function formatDuration(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  const unit =
    seconds >= 86400 ? "day" : seconds >= 3600 ? "hour" : seconds >= 60 ? "minute" : "second";
  const divisor = { day: 86400, hour: 3600, minute: 60, second: 1 }[unit];
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(seconds / divisor);
}

const QUICK_ACTIONS = [
  {
    href: "/studio",
    label: "studio",
    description: "studioDescription",
    icon: PanelsTopLeft,
  },
  {
    href: "/admin/wiki",
    label: "wiki",
    description: "wikiDescription",
    icon: BookOpen,
  },
  {
    href: "/admin/levels",
    label: "levels",
    description: "levelsDescription",
    icon: TrendingUp,
  },
  {
    href: "/admin/moderation",
    label: "moderation",
    description: "moderationDescription",
    icon: Shield,
  },
  {
    href: "/admin/economy",
    label: "economy",
    description: "economyDescription",
    icon: Coins,
  },
  {
    href: "/admin/send",
    label: "send",
    description: "sendDescription",
    icon: MessageSquare,
  },
  {
    href: "/admin/settings",
    label: "settings",
    description: "settingsDescription",
    icon: Settings,
  },
];

const SERVICE_COPY: Record<LiveService["id"], { label: string; description: string }> = {
  api: { label: "apiLabel", description: "apiDescription" },
  database: {
    label: "databaseLabel",
    description: "databaseDescription",
  },
  redis: { label: "redisLabel", description: "redisDescription" },
  backOffice: {
    label: "backOfficeLabel",
    description: "backOfficeDescription",
  },
};

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const bots = useQuery({
    queryKey: ["admin", "dashboard-bots"],
    queryFn: async ({ signal }) => DashboardBots.parse(await api.get("/bots", { signal })),
    refetchInterval: 30_000,
  });
  const health = useQuery({
    queryKey: ["admin", "dashboard-monitoring"],
    queryFn: async ({ signal }) =>
      DashboardMonitoring.parse(await api.get("/health/monitoring", { signal })),
    refetchInterval: 30_000,
  });
  const stats = useQuery({
    queryKey: ["admin", "dashboard-totals"],
    queryFn: async ({ signal }) =>
      DashboardTotals.parse(await api.get("/stats/totals", { signal })),
    refetchInterval: 60_000,
  });
  const live = useQuery({
    queryKey: ["admin", "dashboard-live"],
    queryFn: ({ signal }) => getLiveDashboard(signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const liveData = live.isError ? undefined : live.data;
  const botData = bots.isError ? undefined : bots.data;
  const monitoringData = health.isError ? undefined : health.data;
  const totalsData = stats.isError ? undefined : stats.data;
  const onlineCount = botData?.bots.filter((bot) => bot.online).length ?? 0;
  const totalCount = botData?.bots.length ?? 0;
  const avgPing =
    botData && botData.bots.some((bot) => bot.online && bot.wsPing >= 0)
      ? Math.round(
          botData.bots
            .filter((bot) => bot.online && bot.wsPing >= 0)
            .reduce((sum, bot) => sum + bot.wsPing, 0) /
            Math.max(1, botData.bots.filter((bot) => bot.online && bot.wsPing >= 0).length),
        )
      : null;
  const hasError = bots.isError || health.isError || stats.isError || live.isError;
  const unavailableServices = liveData?.services.filter((service) => service.state !== "ok") ?? [];
  const allLiveServicesHealthy =
    dashboardHealthy(liveData) &&
    !hasError &&
    !bots.isPending &&
    !health.isPending &&
    !stats.isPending &&
    totalCount > 0 &&
    onlineCount === totalCount &&
    liveData?.agents.activeTasks !== null &&
    liveData?.agents.recentActivity !== null &&
    monitoringData?.botStatus.online === true;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "native-pipeline"] });
    void bots.refetch();
    void health.refetch();
    void stats.refetch();
    void live.refetch();
  };

  return (
    <div className={styles.dashboard} data-admin-dashboard>
      <AdminPageHeader
        title={t("title")}
        description={t("intro")}
        actions={
          <>
            <button
              type="button"
              onClick={refresh}
              className={styles.toolbarButton}
              aria-busy={
                bots.isFetching || health.isFetching || stats.isFetching || live.isFetching
              }
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t("nativePipeline.refresh")}
            </button>
            <Link href="/admin/live" className={styles.toolbarButton}>
              {t("liveLink")}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/admin/console" className={styles.toolbarButton}>
              <Command className="h-4 w-4" aria-hidden="true" />
              {t("console")}
            </Link>
          </>
        }
      />
      {hasError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[.08] p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t("metricsError")}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-4 font-medium hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            {t("retry")}
          </button>
        </div>
      )}

      <section aria-labelledby="system-health-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="system-health-title" className="text-lg font-semibold text-foreground">
              {t("communityTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("communityDescription")}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("autoUpdate")}
          </span>
        </div>
        <div className={styles.metricGrid}>
          <KpiCard label={t("onlineBots")} icon={<Server className="h-5 w-5" />}>
            <Metric
              value={botData ? onlineCount : "—"}
              suffix={botData ? ` / ${totalCount}` : ""}
            />
            <MetricHelp>
              {totalCount > 0
                ? onlineCount === totalCount
                  ? t("operational")
                  : t("offlineCount", { count: totalCount - onlineCount })
                : "—"}
            </MetricHelp>
          </KpiCard>
          <KpiCard label={t("users")} icon={<Users className="h-5 w-5" />}>
            <Metric value={totalsData ? totalsData.stats.totalUsers.toLocaleString(locale) : "—"} />
            <MetricHelp>
              {totalsData
                ? t("totals", {
                    active: totalsData.stats.totalActiveUsers.toLocaleString(locale),
                    guilds: totalsData.stats.totalGuilds.toLocaleString(locale),
                  })
                : "—"}
            </MetricHelp>
          </KpiCard>
          <KpiCard label={t("latency")} icon={<Activity className="h-5 w-5" />}>
            <Metric value={avgPing ?? "—"} suffix=" ms" />
            <MetricHelp>
              {avgPing === null ? t("measuring") : avgPing < 200 ? t("fast") : t("slow")}
            </MetricHelp>
          </KpiCard>
          <KpiCard label={t("resources")} icon={<Cpu className="h-5 w-5" />}>
            <Metric
              value={monitoringData ? formatBytes(monitoringData.pid.rss).split(" ")[0] : "—"}
              suffix={monitoringData ? ` ${formatBytes(monitoringData.pid.rss).split(" ")[1]}` : ""}
            />
            <MetricHelp>{t("resourceDescription")}</MetricHelp>
          </KpiCard>
        </div>
      </section>
      <div className={styles.workbench}>
        <div className={styles.operations}>
          <NativePipelinePanel />
          <section aria-labelledby="quick-actions-title">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="quick-actions-title" className="text-lg font-semibold text-foreground">
                  {t("quickTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("quickDescription")}</p>
              </div>
              <span className="hidden text-sm text-muted-foreground sm:inline-flex sm:items-center sm:gap-1">
                {t("shortcuts", { count: QUICK_ACTIONS.length })}{" "}
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
            <div className={styles.tools}>
              {QUICK_ACTIONS.map(({ href, label, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex min-h-12 items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{t(label)}</p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">{t(description)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          <section aria-labelledby="bots-title">
            <h2 id="bots-title" className="text-lg font-semibold text-foreground">
              {t("botsTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("botsDescription")}</p>
            <div className={styles.botGrid}>
              {bots.isPending ? (
                Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
                ))
              ) : bots.isError ? (
                <EmptyState text={t("botsUnavailable")} />
              ) : botData?.bots.length ? (
                botData.bots.map((bot) => <BotCard key={bot.id} bot={bot} />)
              ) : (
                <EmptyState text={t("botsEmpty")} />
              )}
            </div>
          </section>
        </div>
        <aside className={styles.observability} aria-label={t("healthTitle")}>
          <section
            aria-labelledby="live-operations-title"
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">
                  {t("automatic")}
                </p>
                <h2
                  id="live-operations-title"
                  className="mt-1 text-lg font-semibold text-foreground"
                >
                  {t("healthTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("healthDescription")}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Radio
                  className={`h-3.5 w-3.5 ${live.isFetching ? "animate-pulse text-primary" : ""}`}
                />
                {liveData
                  ? t("sampledAt", {
                      time: new Date(liveData.sampledAt).toLocaleTimeString(locale),
                    })
                  : t("probeLoading")}
              </div>
            </div>
            {live.isError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[.08] p-3 text-sm text-foreground"
              >
                {t("liveError")}
              </p>
            ) : (
              <>
                <LiveSummary
                  healthy={allLiveServicesHealthy}
                  unavailableCount={unavailableServices.length}
                  loading={!liveData}
                />
                <div className={styles.serviceGrid}>
                  {liveData?.services.map((service) => (
                    <LiveServiceCard key={service.id} service={service} />
                  )) ??
                    Array.from({ length: 4 }, (_, index) => (
                      <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
                    ))}
                </div>
                <AgentActivity agents={liveData?.agents} />
              </>
            )}
          </section>
          <section
            aria-labelledby="host-title"
            className="rounded-xl border border-border bg-card p-4"
          >
            <h2 id="host-title" className="text-lg font-semibold text-foreground">
              {t("hostTitle")}
            </h2>
            {monitoringData ? (
              <dl className={styles.hostMetrics}>
                <HostMetric label={t("os")} value={monitoringData.host.platform} />
                <HostMetric label={t("cores")} value={monitoringData.host.cpu.count} />
                <HostMetric
                  label={t("memory")}
                  value={`${formatBytes(monitoringData.host.memory.used)} / ${formatBytes(monitoringData.host.memory.total)} (${monitoringData.host.memory.usage} %)`}
                />
                <HostMetric
                  label={t("uptime")}
                  value={formatDuration(monitoringData.pid.uptime, locale)}
                />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">{t("hostUnavailable")}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-medium">{label}</h3>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function Metric({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  return (
    <p className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
      {value}
      <span className="text-base font-normal text-muted-foreground">{suffix}</span>
    </p>
  );
}

function MetricHelp({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-5 text-muted-foreground">{children}</p>;
}

function HostMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function LiveSummary({
  healthy,
  unavailableCount,
  loading,
}: {
  healthy: boolean;
  unavailableCount: number;
  loading: boolean;
}) {
  const t = useTranslations("adminDashboard");
  if (loading) return <div className="mt-4 h-12 animate-pulse rounded-xl bg-muted" />;
  const message = healthy
    ? t("healthy")
    : unavailableCount > 0
      ? t("attention", { count: unavailableCount })
      : t("checking");
  return (
    <p
      className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${healthy ? "bg-emerald-400/10 text-foreground" : "bg-amber-300/[.08] text-foreground"}`}
    >
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-300"}`}
      />
      {message}
    </p>
  );
}

function LiveServiceCard({ service }: { service: LiveService }) {
  const t = useTranslations("adminDashboard");
  const stateStyle = {
    ok: "bg-emerald-400",
    degraded: "bg-amber-300",
    down: "bg-rose-400",
    unknown: "bg-muted-foreground",
  }[service.state];
  const icon =
    service.id === "database" || service.id === "redis" ? (
      <Database className="h-5 w-5" />
    ) : (
      <Activity className="h-5 w-5" />
    );
  const stateLabel = {
    ok: "ok",
    degraded: "degraded",
    down: "down",
    unknown: "unknown",
  }[service.state];
  const copy = SERVICE_COPY[service.id];
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-primary">{icon}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${stateStyle}`} />
          {t(stateLabel)}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-foreground">{t(copy.label)}</h3>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">{t(copy.description)}</p>
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {t("technical")}
        </summary>
        <p className="mt-2 break-words">
          {service.detail.startsWith("HTTP ")
            ? t("httpFailure", { status: service.detail.slice(5) })
            : t(`details.${service.detail}`)}
          {service.latencyMs === null ? "" : t("responseTime", { latency: service.latencyMs })}
        </p>
      </details>
    </article>
  );
}

function AgentActivity({ agents }: { agents: LiveDashboardResponse["agents"] | undefined }) {
  const t = useTranslations("adminDashboard");
  return (
    <div className={styles.agentActivity}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-medium text-foreground">{t("agentsTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {agents?.activeTasks === null || agents?.recentActivity === null
              ? t("agentsUnavailable")
              : agents
                ? (agents.activeTasks ?? 0) > 0 || (agents.recentActivity ?? 0) > 0
                  ? t("agentCounts", {
                      tasks: agents.activeTasks ?? "—",
                      messages: agents.recentActivity ?? "—",
                      limit: 100,
                    })
                  : t("agentsIdle")
                : t("agentsLoading")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {agents?.activePeers.length ? (
          agents.activePeers.map((peer) => (
            <span
              key={peer}
              className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              {peer}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">
            {!agents
              ? t("agentsLoading")
              : agents.recentActivity === null
                ? t("agentsUnavailable")
                : t("noActivity")}
          </span>
        )}
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: BotSummary }) {
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  return (
    <article
      className={`flex min-h-28 gap-3 rounded-xl border border-border bg-card p-4 ${bot.online ? "" : "opacity-60"}`}
      title={bot.username ?? bot.name}
    >
      {bot.avatar ? (
        <img
          src={bot.avatar}
          alt=""
          className={`h-12 w-12 shrink-0 rounded-full ${bot.online ? "" : "grayscale"}`}
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-full bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium text-foreground">{bot.name}</h3>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${bot.online ? "bg-emerald-400" : "bg-rose-400"}`}
            title={bot.online ? t("online") : t("offline")}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {bot.online ? (
            <>
              {t("botLatency", {
                ping: bot.wsPing >= 0 ? bot.wsPing : "—",
                uptime: bot.uptime === null ? "—" : formatDuration(bot.uptime, locale),
              })}
            </>
          ) : (
            t("offline")
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("botCounts", { commands: bot.commandCount, guilds: bot.guildCount })}
        </p>
      </div>
    </article>
  );
}
