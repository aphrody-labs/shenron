"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
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
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "@/lib/admin-api";
import { formatBytes } from "@/lib/admin-format";
import { type BotSummary } from "@/components/admin/BotSelector";
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

async function getLiveDashboard(): Promise<LiveDashboardResponse> {
  const response = await fetch("/api/admin/dashboard-live", { cache: "no-store" });
  if (!response.ok) throw new Error(`Sonde live indisponible (HTTP ${response.status})`);
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
  const t = useTranslations("adminDashboard");
  const locale = useLocale();
  const bots = useQuery({
    queryKey: ["admin", "dashboard-bots"],
    queryFn: async () => DashboardBots.parse(await api.get("/bots")),
    refetchInterval: 30_000,
  });
  const health = useQuery({
    queryKey: ["admin", "dashboard-monitoring"],
    queryFn: async () => DashboardMonitoring.parse(await api.get("/health/monitoring")),
    refetchInterval: 30_000,
  });
  const stats = useQuery({
    queryKey: ["admin", "dashboard-totals"],
    queryFn: async () => DashboardTotals.parse(await api.get("/stats/totals")),
    refetchInterval: 60_000,
  });
  const live = useQuery({
    queryKey: ["admin", "dashboard-live"],
    queryFn: getLiveDashboard,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const onlineCount = bots.data?.bots.filter((bot) => bot.online).length ?? 0;
  const totalCount = bots.data?.bots.length ?? 0;
  const avgPing =
    bots.data && bots.data.bots.some((bot) => bot.online && bot.wsPing >= 0)
      ? Math.round(
          bots.data.bots
            .filter((bot) => bot.online && bot.wsPing >= 0)
            .reduce((sum, bot) => sum + bot.wsPing, 0) /
            Math.max(1, bots.data.bots.filter((bot) => bot.online && bot.wsPing >= 0).length),
        )
      : null;
  const hasError = bots.isError || health.isError || stats.isError || live.isError;
  const unavailableServices = live.data?.services.filter((service) => service.state !== "ok") ?? [];
  const allLiveServicesHealthy =
    dashboardHealthy(live.data) &&
    !hasError &&
    !bots.isPending &&
    !health.isPending &&
    !stats.isPending &&
    totalCount > 0 &&
    onlineCount === totalCount &&
    live.data?.agents.activeTasks !== null &&
    live.data?.agents.recentActivity !== null &&
    health.data?.botStatus.online === true;
  const refresh = () => {
    void bots.refetch();
    void health.refetch();
    void stats.refetch();
    void live.refetch();
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-8 pb-8">
      <NativePipelinePanel />
      <header className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <p className="text-xs font-medium text-white/55">{t("admin")}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/live"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
          >
            {t("liveLink")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            href="/admin/console"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white/80 transition-colors hover:bg-white/[.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Command className="h-4 w-4" />
            {t("console")}
          </Link>
        </div>
      </header>

      {hasError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-amber-300/25 bg-amber-300/[.08] p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
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

      <section
        aria-labelledby="live-operations-title"
        className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 md:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-300">
              {t("automatic")}
            </p>
            <h2 id="live-operations-title" className="mt-1 text-lg font-semibold text-white">
              {t("healthTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t("healthDescription")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/45">
            <Radio
              className={`h-3.5 w-3.5 ${live.isFetching ? "animate-pulse text-blue-300" : ""}`}
            />
            {live.data
              ? t("sampledAt", { time: new Date(live.data.sampledAt).toLocaleTimeString(locale) })
              : t("probeLoading")}
          </div>
        </div>
        {live.isError ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[.08] p-3 text-sm text-amber-100"
          >
            {t("liveError")}
          </p>
        ) : (
          <>
            <LiveSummary
              healthy={allLiveServicesHealthy}
              unavailableCount={unavailableServices.length}
              loading={!live.data}
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {live.data?.services.map((service) => (
                <LiveServiceCard key={service.id} service={service} />
              )) ??
                Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-xl bg-white/[.04]" />
                ))}
            </div>
            <AgentActivity agents={live.data?.agents} />
          </>
        )}
      </section>

      <section aria-labelledby="quick-actions-title">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="quick-actions-title" className="text-lg font-semibold text-white">
              {t("quickTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t("quickDescription")}</p>
          </div>
          <span className="hidden text-sm text-white/45 sm:inline-flex sm:items-center sm:gap-1">
            {t("shortcuts", { count: QUICK_ACTIONS.length })} <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-24 items-center gap-4 rounded-xl border border-white/10 bg-white/[.025] p-4 transition-colors hover:bg-white/[.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.08] text-blue-300">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-white">{t(label)}</p>
                <p className="mt-1 text-sm leading-5 text-white/55">{t(description)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="system-health-title">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="system-health-title" className="text-lg font-semibold text-white">
              {t("communityTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/50">{t("communityDescription")}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-white/45">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("autoUpdate")}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label={t("onlineBots")} icon={<Server className="h-5 w-5" />}>
            <Metric
              value={bots.data ? onlineCount : "—"}
              suffix={bots.data ? ` / ${totalCount}` : ""}
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
            <Metric value={stats.data ? stats.data.stats.totalUsers.toLocaleString(locale) : "—"} />
            <MetricHelp>
              {stats.data
                ? t("totals", {
                    active: stats.data.stats.totalActiveUsers.toLocaleString(locale),
                    guilds: stats.data.stats.totalGuilds.toLocaleString(locale),
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
              value={health.data ? formatBytes(health.data.pid.rss).split(" ")[0] : "—"}
              suffix={health.data ? ` ${formatBytes(health.data.pid.rss).split(" ")[1]}` : ""}
            />
            <MetricHelp>{t("resourceDescription")}</MetricHelp>
          </KpiCard>
        </div>
      </section>

      <section aria-labelledby="bots-title">
        <h2 id="bots-title" className="text-lg font-semibold text-white">
          {t("botsTitle")}
        </h2>
        <p className="mt-1 text-sm text-white/50">{t("botsDescription")}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {bots.isPending ? (
            Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl bg-white/[.04]" />
            ))
          ) : bots.isError ? (
            <EmptyState text={t("botsUnavailable")} />
          ) : bots.data.bots.length ? (
            bots.data.bots.map((bot) => <BotCard key={bot.id} bot={bot} />)
          ) : (
            <EmptyState text={t("botsEmpty")} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="host-title"
        className="rounded-xl border border-white/10 bg-white/[.025] p-4 md:p-6"
      >
        <h2 id="host-title" className="text-lg font-semibold text-white">
          {t("hostTitle")}
        </h2>
        {health.data ? (
          <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <HostMetric label={t("os")} value={health.data.host.platform} />
            <HostMetric label={t("cores")} value={health.data.host.cpu.count} />
            <HostMetric
              label={t("memory")}
              value={`${formatBytes(health.data.host.memory.used)} / ${formatBytes(health.data.host.memory.total)} (${health.data.host.memory.usage} %)`}
            />
            <HostMetric
              label={t("uptime")}
              value={formatDuration(health.data.pid.uptime, locale)}
            />
          </dl>
        ) : (
          <p className="mt-4 text-sm text-white/50">{t("hostUnavailable")}</p>
        )}
      </section>
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
    <article className="rounded-xl border border-white/10 bg-white/[.025] p-4 md:p-5">
      <div className="flex items-center gap-3 text-white/60">
        <span className="text-blue-300">{icon}</span>
        <h3 className="text-sm font-medium">{label}</h3>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function Metric({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  return (
    <p className="font-mono text-3xl font-semibold tracking-tight text-white tabular-nums">
      {value}
      <span className="text-base font-normal text-white/45">{suffix}</span>
    </p>
  );
}

function MetricHelp({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-5 text-white/50">{children}</p>;
}

function HostMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/10 py-3 text-sm">
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right font-medium text-white/85">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-white/50">
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
  if (loading) return <div className="mt-4 h-12 animate-pulse rounded-xl bg-white/[.04]" />;
  const message = healthy
    ? t("healthy")
    : unavailableCount > 0
      ? t("attention", { count: unavailableCount })
      : t("checking");
  return (
    <p
      className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${healthy ? "bg-emerald-400/10 text-emerald-100" : "bg-amber-300/[.08] text-amber-100"}`}
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
    unknown: "bg-white/35",
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
    <article className="rounded-xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-blue-300">{icon}</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70">
          <span className={`h-2 w-2 rounded-full ${stateStyle}`} />
          {t(stateLabel)}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-medium text-white">{t(copy.label)}</h3>
      <p className="mt-1 text-sm leading-5 text-white/50">{t(copy.description)}</p>
      <details className="mt-3 text-xs text-white/45">
        <summary className="cursor-pointer text-white/60 hover:text-white">
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
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/10 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-400/10 text-blue-300">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-medium text-white">{t("agentsTitle")}</h3>
          <p className="mt-1 text-sm text-white/50">
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
              className="rounded-lg bg-white/[.08] px-2.5 py-1 text-xs text-white/70"
            >
              {peer}
            </span>
          ))
        ) : (
          <span className="text-sm text-white/45">
            {agents?.recentActivity === null ? t("agentsUnavailable") : t("noActivity")}
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
      className={`flex min-h-28 gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 ${bot.online ? "" : "opacity-60"}`}
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
          <h3 className="truncate font-medium text-white">{bot.name}</h3>
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${bot.online ? "bg-emerald-400" : "bg-rose-400"}`}
            title={bot.online ? t("online") : t("offline")}
          />
        </div>
        <p className="mt-1 text-sm text-white/50">
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
        <p className="mt-2 text-sm text-white/65">
          {t("botCounts", { commands: bot.commandCount, guilds: bot.guildCount })}
        </p>
      </div>
    </article>
  );
}
