"use client";
// SPDX-License-Identifier: Apache-2.0
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Chargement, Coche, Croix, LienExterne } from "@aphrody/shenron-ui/icones";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PlainField } from "@/components/editor/PlainField";
import { ContributionRightsPanel } from "@/components/admin/ContributionRightsPanel";
import { CONTRIBUTABLE_COLUMNS, type ContributionStatusKey } from "@/lib/contributions-shared";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";
import { useLangue } from "@/lib/i18n/client";

interface Row {
  id: string;
  createdAt: string;
  authorName: string | null;
  tableName: string;
  rowId: string;
  columnName: string;
  entityLabel: string | null;
  entityPath: string | null;
  valueBefore: string | null;
  valueAfter: string;
  comment: string | null;
  sources: string | null;
  status: ContributionStatusKey;
  reviewerName: string | null;
  reviewNote: string | null;
}
type QueueResponse = { rows: Row[]; total: number; counts: Record<string, number> };
const PAGE_SIZE = 20;
const FILTERS = ["pending", "accepted", "rejected", "superseded", "withdrawn", ""] as const;

/** Shared context is kept around changed lines; long texts expand on request. */
function lineDiff(before: string, after: string) {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    start++;
  let end = 0;
  while (
    end < oldLines.length - start &&
    end < newLines.length - start &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
  )
    end++;
  return {
    prefix: oldLines.slice(Math.max(0, start - 2), start),
    removed: oldLines.slice(start, oldLines.length - end),
    added: newLines.slice(start, newLines.length - end),
    suffix: oldLines.slice(oldLines.length - end, oldLines.length - end + 2),
    unchanged: start === oldLines.length && start === newLines.length,
  };
}

export default function PageContributions() {
  const t = useWikiEditorialText();
  const { locale } = useLangue();
  const [filter, setFilter] = useState<{ status: string; offset: number }>({
    status: "pending",
    offset: 0,
  });
  const queue = useQuery<QueueResponse>({
    queryKey: ["wiki-contributions", filter.status, filter.offset],
    queryFn: async ({ signal }) => {
      const parameters = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(filter.offset),
      });
      if (filter.status) parameters.set("status", filter.status);
      const response = await fetch(`/api/admin/wiki-contributions?${parameters}`, {
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error(`contributions_${response.status}`);
      return response.json() as Promise<QueueResponse>;
    },
  });
  const counts = queue.data?.counts ?? {};
  const total = queue.data?.total ?? 0;
  const range = {
    from: total ? filter.offset + 1 : 0,
    to: Math.min(filter.offset + PAGE_SIZE, total),
    total,
  };

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-6">
      <header className="rounded-xl border border-dbz-border bg-dbz-card p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-dbz-orange">
          {t("queue.eyebrow")}
        </p>
        <h1 className="mt-2 font-saiyan text-3xl text-os sm:text-4xl">{t("queue.title")}</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-os/75">{t("queue.intro")}</p>
        <Link
          href="/admin/wiki/history"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-dbz-yellow"
        >
          {t("queue.history")}
        </Link>
      </header>

      <details className="rounded-xl border border-dbz-border bg-dbz-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-os">
          {t("queue.rights")}{" "}
          <span className="ml-2 font-normal text-os/75">{t("queue.rightsHint")}</span>
        </summary>
        <div className="border-t border-dbz-border p-5">
          <ContributionRightsPanel />
        </div>
      </details>

      <nav className="flex flex-wrap gap-2" aria-label={t("queue.filters")}>
        {FILTERS.map((status) => (
          <button
            key={status || "all"}
            type="button"
            aria-pressed={filter.status === status}
            onClick={() => setFilter({ status, offset: 0 })}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow ${filter.status === status ? "border-dbz-orange bg-dbz-orange text-encre" : "border-dbz-border bg-dbz-card text-os/75 hover:border-dbz-yellow hover:text-os"}`}
          >
            {t(status ? `status.${status}` : "queue.all")}
            {status && counts[status] !== undefined && (
              <span className="tabular-nums">{counts[status]!.toLocaleString(locale)}</span>
            )}
          </button>
        ))}
      </nav>

      {queue.isPending ? (
        <output className="flex items-center gap-2 py-8 text-sm text-os/75">
          <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("queue.loading")}
        </output>
      ) : queue.isError ? (
        <div role="alert" className="rounded-xl border border-dbz-red/40 bg-dbz-card p-5 text-os">
          <p>{t("queue.loadFailed")}</p>
          <button
            type="button"
            onClick={() => void queue.refetch()}
            className="btn btn-ghost mt-3 min-h-11"
          >
            {t("queue.retry")}
          </button>
        </div>
      ) : (
        <>
          <output className="text-sm text-os/75">{t("queue.count", { count: total })}</output>
          {queue.data.rows.length === 0 ? (
            <p className="rounded-xl border border-dbz-border bg-dbz-card p-8 text-center text-os/75">
              {t(filter.status === "pending" ? "queue.emptyPending" : "queue.empty")}
            </p>
          ) : (
            <ul className="space-y-5">
              {queue.data.rows.map((row) => (
                <ContributionCard key={row.id} row={row} />
              ))}
            </ul>
          )}
          {(filter.offset > 0 || total > PAGE_SIZE) && (
            <nav
              className="flex flex-wrap items-center justify-between gap-3"
              aria-label={t("queue.pagination")}
            >
              <button
                type="button"
                disabled={filter.offset === 0}
                className="btn btn-ghost min-h-11"
                onClick={() =>
                  setFilter((current) => ({
                    ...current,
                    offset: Math.max(0, current.offset - PAGE_SIZE),
                  }))
                }
              >
                {t("queue.previous")}
              </button>
              <span className="text-sm tabular-nums text-os/75">{t("queue.range", range)}</span>
              <button
                type="button"
                disabled={filter.offset + PAGE_SIZE >= total}
                className="btn btn-ghost min-h-11"
                onClick={() =>
                  setFilter((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))
                }
              >
                {t("queue.next")}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function ContributionCard({ row }: { row: Row }) {
  const t = useWikiEditorialText();
  const { locale } = useLangue();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [expanded, setExpanded] = useState(false);
  const diff = useMemo(
    () => lineDiff(row.valueBefore ?? "", row.valueAfter),
    [row.valueBefore, row.valueAfter],
  );
  const moderation = useMutation({
    mutationFn: async (action: "accept" | "reject") => {
      const response = await fetch("/api/admin/wiki-contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: row.id, action, note }),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "conflict" : "failed");
      return response.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki-contributions"] });
    },
  });
  const date = new Date(row.createdAt);
  const remaining = Math.max(diff.removed.length, diff.added.length) - 12;
  const field = Object.hasOwn(CONTRIBUTABLE_COLUMNS, row.columnName)
    ? t(`field.${row.columnName}`)
    : row.columnName;
  return (
    <li className="min-w-0 rounded-xl border border-dbz-border bg-dbz-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-display text-lg font-bold text-os">
            {row.entityLabel ?? `${row.tableName} #${row.rowId}`}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-os/75">
            <span className="rounded border border-dbz-border px-2 py-1 text-xs">{field}</span>
            <span>{row.authorName ?? t("queue.anonymous")}</span>
            <time dateTime={row.createdAt}>
              {Number.isFinite(date.getTime())
                ? date.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })
                : row.createdAt}
            </time>
            <span className="font-semibold text-dbz-orange">{t(`status.${row.status}`)}</span>
          </p>
          {row.reviewerName && (
            <p className="mt-1 text-sm text-os/75">
              {t("queue.reviewer", { name: row.reviewerName })}
            </p>
          )}
        </div>
        {row.entityPath && (
          <a
            href={row.entityPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-dbz-orange hover:text-dbz-yellow"
          >
            <LienExterne aria-hidden className="h-4 w-4" />
            {t("queue.open")}
          </a>
        )}
      </header>
      <div className="mt-4 rounded-xl border border-dbz-border bg-dbz-bg p-3 text-sm leading-relaxed text-os/85">
        <h3 className="font-semibold text-dbz-yellow">{t("queue.sources")}</h3>
        <p className="mt-1 whitespace-pre-wrap break-words">
          {row.sources || t("queue.missingSources")}
        </p>
      </div>
      {row.comment && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm italic leading-relaxed text-os/75">
          {row.comment}
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-xl border border-dbz-border bg-dbz-bg text-sm leading-relaxed">
        {diff.unchanged ? (
          <p className="p-3 text-os/75">{t("queue.unchanged")}</p>
        ) : (
          <>
            <DiffLines lines={diff.prefix} tone="context" />
            <h3 className="border-y border-dbz-border px-3 py-2 font-semibold text-dbz-red">
              {t("queue.before")}
            </h3>
            <DiffLines lines={diff.removed.slice(0, expanded ? undefined : 12)} tone="removed" />
            <h3 className="border-y border-dbz-border px-3 py-2 font-semibold text-dbz-cyan">
              {t("queue.after")}
            </h3>
            <DiffLines lines={diff.added.slice(0, expanded ? undefined : 12)} tone="added" />
            <DiffLines lines={diff.suffix} tone="context" />
            {!expanded && remaining > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-expanded={false}
                className="min-h-11 w-full border-t border-dbz-border p-3 font-semibold text-dbz-orange hover:text-dbz-yellow"
              >
                {t("queue.expand", { count: remaining })}
              </button>
            )}
          </>
        )}
      </div>
      {row.status === "pending" ? (
        <div className="mt-4 space-y-3">
          <PlainField
            name={`note-${row.id}`}
            label={t("queue.note")}
            hint={t("queue.noteHint")}
            value={note}
            onChange={(value) => {
              setNote(value);
              moderation.reset();
            }}
            disabled={moderation.isPending}
            minRows={2}
            maxRows={5}
            maxLength={1000}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={moderation.isPending}
              onClick={() => moderation.mutate("accept")}
              className="btn btn-primary min-h-12"
            >
              <Coche aria-hidden className="h-4 w-4" />
              {t("queue.accept")}
            </button>
            <button
              type="button"
              disabled={moderation.isPending || !note.trim()}
              onClick={() => moderation.mutate("reject")}
              className="btn btn-ghost min-h-12"
            >
              <Croix aria-hidden className="h-4 w-4" />
              {t("queue.reject")}
            </button>
          </div>
          {moderation.isPending && (
            <output className="text-sm text-os/75">{t("queue.working")}</output>
          )}
          {moderation.isError && (
            <div role="alert" className="text-sm text-dbz-red">
              <p>
                {t(moderation.error.message === "conflict" ? "queue.conflict" : "queue.failed")}
              </p>
              {moderation.error.message === "conflict" && (
                <button
                  type="button"
                  className="btn btn-ghost mt-2 min-h-11"
                  onClick={() => void qc.invalidateQueries({ queryKey: ["wiki-contributions"] })}
                >
                  {t("queue.retry")}
                </button>
              )}
            </div>
          )}
        </div>
      ) : row.reviewNote ? (
        <p className="mt-4 whitespace-pre-wrap break-words text-sm text-os/75">
          <strong>{t("queue.response")} : </strong>
          {row.reviewNote}
        </p>
      ) : null}
    </li>
  );
}

function DiffLines({ lines, tone }: { lines: string[]; tone: "context" | "added" | "removed" }) {
  const classes = {
    context: "text-os/65",
    added: "bg-dbz-cyan/5 text-os",
    removed: "bg-dbz-red/5 text-os",
  };
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    return (
      <pre
        key={`${line}:${occurrence}`}
        className={`whitespace-pre-wrap break-words px-3 py-1 font-mono ${classes[tone]}`}
      >
        {tone === "added" ? "+ " : tone === "removed" ? "− " : ""}
        {line || " "}
      </pre>
    );
  });
}
