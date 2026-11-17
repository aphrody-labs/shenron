"use client";

import { Metric, MetricGrid, StatusBadge } from "@aphrody/shenron-ui/admin";
import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { BotSelector, useBotId, useSearchParamState } from "@/components/admin/BotSelector";
import { CommandsPanel } from "@/components/admin/bot/CommandsPanel";
import {
  EmptyState,
  ErrorState,
  errorMessage,
  Section,
  SkeletonRows,
} from "@/components/admin/bot/BotUi";
import { GuildMirrorPanel } from "@/components/admin/bot/GuildMirrorPanel";
import { useBotFormat } from "@/components/admin/bot/useBotFormat";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@aphrody/shenron-ui/tabs";
import { api } from "@/lib/admin-api";

interface Guild {
  id: string;
  name: string;
  memberCount: number;
  iconUrl: string | null;
  joinedAt: string | null;
}

interface BotInfo {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  online: boolean;
  uptime: number | null;
  wsPing: number;
  guilds: Guild[];
  commandCount: number;
}

const TABS = ["overview", "guild", "commands"] as const;
type BotTab = (typeof TABS)[number];

export default function BotPage() {
  const t = useTranslations("adminBot");
  const [botId, setBotId] = useBotId();
  const [tabParam, setTab] = useSearchParamState("tab", "overview");
  const tab: BotTab = (TABS as readonly string[]).includes(tabParam)
    ? (tabParam as BotTab)
    : "overview";

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">{t("overview.intro")}</p>
      <BotSelector value={botId} onChange={setBotId} />

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList aria-label={t("tabs.label")}>
          {TABS.map((id) => (
            <TabsTab key={id} value={id}>
              {t(`tabs.${id}`)}
            </TabsTab>
          ))}
        </TabsList>
        <TabsPanel value="overview">
          <Overview botId={botId} />
        </TabsPanel>
        <TabsPanel value="guild">
          <GuildMirrorPanel />
        </TabsPanel>
        <TabsPanel value="commands">
          <CommandsPanel botId={botId} />
        </TabsPanel>
      </Tabs>
    </div>
  );
}

function Overview({ botId }: { botId: string }) {
  const t = useTranslations("adminBot.overview");
  const fmt = useBotFormat();
  const info = useQuery({
    queryKey: ["bot", botId, "info"],
    queryFn: () => api.get<BotInfo>(`/bots/${botId}`),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const d = info.data;
  const members = d?.guilds.reduce((sum, g) => sum + g.memberCount, 0);

  return (
    <div className="space-y-6">
      {info.isError ? (
        <ErrorState
          message={errorMessage(info.error)}
          onRetry={() => info.refetch()}
          retrying={info.isFetching}
        />
      ) : (
        <MetricGrid columns={4}>
          <Metric
            label={t("status")}
            value={
              d ? (
                <StatusBadge tone={d.online ? "success" : "danger"} dot pulse={d.online}>
                  {d.online ? t("online") : t("offline")}
                </StatusBadge>
              ) : null
            }
            hint={
              d?.online
                ? t("pingUptime", { ping: d.wsPing, uptime: fmt.duration(d.uptime) })
                : d
                  ? t("loginDisabled")
                  : undefined
            }
          />
          <Metric label={t("commands")} value={fmt.number(d?.commandCount)} tone="accent" />
          <Metric label={t("servers")} value={fmt.number(d?.guilds.length)} />
          <Metric label={t("members")} value={fmt.number(members)} />
        </MetricGrid>
      )}

      <Section title={t("serversTitle")}>
        {info.isLoading ? (
          <SkeletonRows count={2} />
        ) : d?.guilds.length ? (
          <ul className="space-y-2">
            {d.guilds.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/40 p-3"
              >
                {g.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.iconUrl} alt="" className="h-10 w-10 rounded-full" />
                ) : (
                  <span aria-hidden className="h-10 w-10 rounded-full bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("memberCount", { count: g.memberCount })} ·{" "}
                    {t("joined", { date: fmt.date(g.joinedAt) })}
                  </p>
                </div>
                <code className="text-xs text-muted-foreground">{g.id}</code>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={t("noServers")} icon={<Globe />} />
        )}
      </Section>
    </div>
  );
}
