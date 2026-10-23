"use client";

/**
 * /admin/reports: back-office of the user reports (tickets). Lists the "Report
 * an error" submissions of members with status filters, a workflow (open, in
 * progress, resolved, closed), an internal note and deletion. Read/write through
 * /api/admin/reports (site Postgres).
 */
import { StatusBadge, type StatusTone } from "@aphrody/shenron-ui/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bulle, Chargement, Corbeille, Drapeau } from "@aphrody/shenron-ui/icones";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useConfirm } from "@/components/admin/admin-ui";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/admin/bot/BotUi";
import { useBotFormat } from "@/components/admin/bot/useBotFormat";
import { PlainField } from "@/components/editor/PlainField";
import { REPORT_STATUSES, type ReportRow } from "@/lib/report-types";

type ReportsResponse = { ok: true; items: ReportRow[]; counts: Record<string, number> };

async function fetchReports(status: string): Promise<ReportsResponse> {
  const res = await fetch(`/api/admin/reports?status=${encodeURIComponent(status)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`reports ${res.status}`);
  return res.json() as Promise<ReportsResponse>;
}

const STATUS_TONE: Record<string, StatusTone> = {
  orange: "accent",
  blue: "info",
  green: "success",
  muted: "neutral",
};

function toneFor(status: string): StatusTone {
  const s = REPORT_STATUSES.find((x) => x.key === status);
  return STATUS_TONE[s?.tone ?? "muted"] ?? "neutral";
}

const FILTERS = ["open", "in_progress", "resolved", "closed", "all"] as const;

/** Label of a status or category key, falling back to the raw key if unknown. */
function useKeyLabel(group: "status" | "category") {
  const t = useTranslations("adminBot.reports");
  return (key: string) => (t.has(`${group}.${key}`) ? t(`${group}.${key}`) : key);
}

export default function ReportsPage() {
  const t = useTranslations("adminBot.reports");
  const statusLabel = useKeyLabel("status");
  const [filter, setFilter] = useState<string>("open");
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin-reports", filter],
    queryFn: () => fetchReports(filter),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-reports"] });
  const items = q.data?.items ?? [];
  const counts = q.data?.counts ?? {};

  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>

      <div role="group" aria-label={t("filters")} className="flex flex-wrap items-center gap-2">
        {FILTERS.map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-dbz-orange bg-dbz-orange text-black"
                  : "border-border bg-background/40 text-foreground/70 hover:bg-card hover:text-foreground"
              }`}
            >
              {key === "all" ? t("status.all") : statusLabel(key)}
              <span
                className={`rounded-full px-1.5 font-mono text-[11px] ${
                  active ? "bg-black/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[key] ?? 0}
              </span>
            </button>
          );
        })}
        {q.isFetching && (
          <Chargement aria-hidden className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {q.isError ? (
        <ErrorState message={t("loadFailed")} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : q.isLoading ? (
        <SkeletonRows count={3} className="h-40" />
      ) : items.length === 0 ? (
        <EmptyState
          title={filter === "all" ? t("emptyAll") : t("empty", { status: statusLabel(filter) })}
          hint={t("emptyHint")}
          icon={<Drapeau />}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <ReportCard key={r.id} report={r} onChanged={invalidate} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({ report, onChanged }: { report: ReportRow; onChanged: () => void }) {
  const t = useTranslations("adminBot.reports");
  const statusLabel = useKeyLabel("status");
  const categoryLabel = useKeyLabel("category");
  const fmt = useBotFormat();
  const { confirm, dialog } = useConfirm();
  const [note, setNote] = useState(report.adminNote ?? "");

  const patch = useMutation({
    mutationFn: (body: { status?: string; adminNote?: string }) =>
      fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: report.id, ...body }),
      }).then((res) => {
        if (!res.ok) throw new Error(`patch ${res.status}`);
        return undefined;
      }),
    onSuccess: onChanged,
  });

  const remove = useMutation({
    mutationFn: () =>
      fetch(`/api/admin/reports?id=${encodeURIComponent(report.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      }).then((res) => {
        if (!res.ok) throw new Error(`delete ${res.status}`);
        return undefined;
      }),
    onSuccess: onChanged,
  });

  const busy = patch.isPending || remove.isPending;
  const noteDirty = note !== (report.adminNote ?? "");
  const failed = patch.isError || remove.isError;

  async function onDelete() {
    const ok = await confirm({
      title: t("deleteTitle"),
      description: t("deleteBody"),
      confirmLabel: t("delete"),
      tone: "danger",
    });
    if (ok) remove.mutate();
  }

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={toneFor(report.status)}>{statusLabel(report.status)}</StatusBadge>
        <StatusBadge tone="neutral">{categoryLabel(report.category)}</StatusBadge>
        <Link
          href={report.path}
          target="_blank"
          rel="noreferrer"
          className="break-all font-mono text-xs text-dbz-ki hover:underline"
          title={report.pageTitle ?? report.path}
        >
          {report.path}
        </Link>
        <time dateTime={report.createdAt} className="ml-auto text-xs text-muted-foreground">
          {fmt.dateTime(report.createdAt)}
        </time>
      </div>

      <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background/40 p-3 text-sm text-foreground">
        {report.message}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("by", { name: report.username ?? "?" })}</span>
        {report.discordId && (
          <span className="font-mono">{t("discordId", { id: report.discordId })}</span>
        )}
        {report.resolvedBy && <span>{t("resolvedBy", { name: report.resolvedBy })}</span>}
      </div>

      <div className="flex items-start gap-2">
        <Bulle aria-hidden className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <PlainField
          className="flex-1"
          value={note}
          onChange={setNote}
          minRows={1}
          maxRows={8}
          label={t("noteLabel")}
          hideLabel
          placeholder={t("notePlaceholder")}
        />
        {noteDirty && (
          <button
            type="button"
            disabled={busy}
            onClick={() => patch.mutate({ adminNote: note })}
            className="btn btn-ghost shrink-0 text-xs"
          >
            {t("saveNote")}
          </button>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-xs text-red-300">
          {t("actionFailed")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {REPORT_STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={report.status === s.key}
            disabled={busy || report.status === s.key}
            onClick={() => patch.mutate({ status: s.key })}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-foreground/70 transition-colors hover:border-dbz-orange hover:text-foreground disabled:opacity-40 aria-pressed:border-dbz-orange aria-pressed:text-dbz-orange"
          >
            {statusLabel(s.key)}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-red-300 transition-colors hover:border-dbz-red hover:text-red-200 disabled:opacity-40"
        >
          <Corbeille aria-hidden className="h-3.5 w-3.5" /> {t("delete")}
        </button>
      </div>
    </li>
  );
}
