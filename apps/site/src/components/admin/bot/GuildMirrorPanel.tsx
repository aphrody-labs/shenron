"use client";

import { Metric, MetricGrid, StatusBadge } from "@aphrody/shenron-ui/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, UserX } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { useConfirm } from "@/components/admin/admin-ui";
import { api } from "@/lib/admin-api";
import { EmptyState, ErrorState, errorMessage, Section, SkeletonRows } from "./BotUi";
import { useBotFormat } from "./useBotFormat";

/** `guild.stats`: counters of the Discord mirror kept in the bot database. */
export interface GuildMirrorStats {
  membersPresent: number;
  membersLeft: number;
  bots: number;
  boosters: number;
  roles: number;
  channels: number;
  lastSyncAt: number | null;
}

/** `guild.findMembers`: one row of `discord_members`. */
export interface MirrorMember {
  user_id: string;
  username: string;
  global_name: string | null;
  nickname: string | null;
  bot: number;
  joined_at: number | null;
  premium_since: number | null;
  timeout_until: number | null;
  present: number;
  left_at: number | null;
}

/** `guild.sync`: report of a full mirror synchronisation. */
export interface GuildSyncReport {
  members: number;
  membersLeft: number;
  roles: number;
  rolesDeleted: number;
  channels: number;
  channelsDeleted: number;
  durationMs: number;
}

interface ActionResult<T> {
  ok: boolean;
  result: T;
}

const SEARCH_LIMIT = 25;
/** The bot syncs daily at 04:00 UTC: past 36 h the mirror is considered stale. */
const STALE_AFTER_MS = 36 * 3_600_000;

/** Wall clock refreshed every minute, so render stays pure. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const callGuild = <T,>(action: string, body: Record<string, unknown> = {}) =>
  api.post<ActionResult<T>>(`/services/guild/${action}`, body).then((r) => r.result);

export function GuildMirrorPanel() {
  const t = useTranslations("adminBot.guild");
  const fmt = useBotFormat();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const stats = useQuery({
    queryKey: ["bot", "guild", "stats"],
    queryFn: () => callGuild<GuildMirrorStats>("stats"),
    refetchInterval: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => callGuild<GuildSyncReport>("sync"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot", "guild"] }),
  });

  async function onSync() {
    const ok = await confirm({
      title: t("sync.confirmTitle"),
      description: t("sync.confirmBody"),
      confirmLabel: t("sync.confirm"),
    });
    if (ok) sync.mutate();
  }

  const now = useNow();
  const s = stats.data;
  const stale = s?.lastSyncAt != null && now - s.lastSyncAt > STALE_AFTER_MS;

  return (
    <div className="space-y-6">
      {dialog}
      <Section
        title={t("stats.title")}
        description={t("stats.description")}
        actions={
          <button
            type="button"
            onClick={onSync}
            disabled={sync.isPending}
            className="btn btn-primary"
          >
            <RefreshCw
              aria-hidden
              className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`}
            />
            {sync.isPending ? t("sync.running") : t("sync.button")}
          </button>
        }
      >
        {stats.isError ? (
          <ErrorState
            message={errorMessage(stats.error)}
            onRetry={() => stats.refetch()}
            retrying={stats.isFetching}
          />
        ) : !s ? (
          <SkeletonRows count={2} className="h-20" />
        ) : (
          <div className="space-y-4">
            <MetricGrid columns={4}>
              <Metric
                label={t("stats.present")}
                value={fmt.number(s.membersPresent)}
                tone="accent"
              />
              <Metric label={t("stats.left")} value={fmt.number(s.membersLeft)} />
              <Metric label={t("stats.bots")} value={fmt.number(s.bots)} />
              <Metric label={t("stats.boosters")} value={fmt.number(s.boosters)} />
              <Metric label={t("stats.roles")} value={fmt.number(s.roles)} />
              <Metric label={t("stats.channels")} value={fmt.number(s.channels)} />
              <Metric
                label={t("stats.lastSync")}
                value={s.lastSyncAt ? fmt.relative(s.lastSyncAt) : t("stats.never")}
                hint={s.lastSyncAt ? fmt.dateTime(s.lastSyncAt) : undefined}
                tone={stale || !s.lastSyncAt ? "warning" : "success"}
                className="col-span-2"
              />
            </MetricGrid>
            {stale && (
              <p role="status" className="text-sm text-dbz-amber">
                {t("stats.stale")}
              </p>
            )}
          </div>
        )}
        {sync.isError && (
          <div className="mt-4">
            <ErrorState message={errorMessage(sync.error) ?? t("sync.failed")} />
          </div>
        )}
        {sync.data && (
          <p role="status" className="mt-4 text-sm text-foreground">
            {t("sync.done", {
              members: fmt.number(sync.data.members),
              left: fmt.number(sync.data.membersLeft),
              roles: fmt.number(sync.data.roles),
              channels: fmt.number(sync.data.channels),
              duration: fmt.duration(sync.data.durationMs),
            })}
          </p>
        )}
      </Section>

      <MemberSearch />
    </div>
  );
}

function MemberSearch() {
  const now = useNow();
  const t = useTranslations("adminBot.guild.search");
  const fmt = useBotFormat();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const results = useQuery({
    queryKey: ["bot", "guild", "members", query],
    queryFn: () => callGuild<MirrorMember[]>("findMembers", { query, limit: SEARCH_LIMIT }),
    enabled: query.length > 0,
    staleTime: 15_000,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(draft.trim());
  };

  const rows = results.data ?? [];

  return (
    <Section title={t("title")} description={t("description")}>
      <form onSubmit={submit} role="search" className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="guild-member-query">
          {t("label")}
        </label>
        <input
          id="guild-member-query"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("placeholder")}
          autoComplete="off"
          className="input min-w-0 flex-1 basis-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || results.isFetching}
          className="btn btn-primary"
        >
          <Search aria-hidden className="h-3.5 w-3.5" />
          {t("button")}
        </button>
      </form>

      <div className="mt-4" aria-live="polite">
        {!query ? (
          <EmptyState title={t("idle")} hint={t("idleHint")} icon={<Search />} />
        ) : results.isError ? (
          <ErrorState
            message={errorMessage(results.error)}
            onRetry={() => results.refetch()}
            retrying={results.isFetching}
          />
        ) : results.isLoading ? (
          <SkeletonRows count={3} className="h-12" />
        ) : rows.length === 0 ? (
          <EmptyState title={t("empty", { query })} icon={<UserX />} />
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {t("count", { count: rows.length })}
              {rows.length >= SEARCH_LIMIT ? ` · ${t("limit", { limit: SEARCH_LIMIT })}` : ""}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {rows.map((m) => (
                <li
                  key={m.user_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium text-foreground">
                      {m.nickname ?? m.global_name ?? m.username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{m.username} · <span className="font-mono">{m.user_id}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={m.present ? "success" : "neutral"} dot>
                      {m.present ? t("present") : t("left")}
                    </StatusBadge>
                    {m.bot ? <StatusBadge tone="info">{t("bot")}</StatusBadge> : null}
                    {m.premium_since ? (
                      <StatusBadge tone="accent">{t("booster")}</StatusBadge>
                    ) : null}
                    {m.timeout_until && m.timeout_until > now ? (
                      <StatusBadge tone="warning">{t("timeout")}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.present
                      ? t("joined", { date: fmt.date(m.joined_at) })
                      : t("leftAt", { date: fmt.date(m.left_at) })}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Section>
  );
}
