"use client";

import { StatusBadge } from "@aphrody/shenron-ui/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Clock, Pencil, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { useConfirm } from "@/components/admin/admin-ui";
import { EmptyState, ErrorState, errorMessage, SkeletonRows } from "@/components/admin/bot/BotUi";
import { useBotFormat } from "@/components/admin/bot/useBotFormat";
import { api } from "@/lib/admin-api";

interface CronJob {
  name: string;
  description: string | null;
  intervalMs: number;
  lastRunAt: number | null;
  lastDurationMs: number | null;
  runCount: number;
  lastError: string | null;
  nextRunAt: number | null;
}

const REFRESH_MS = 5_000;

function JobStatus({ job }: { job: CronJob }) {
  const t = useTranslations("adminBot.cron");
  if (job.lastError) return <StatusBadge tone="danger">{t("statusError")}</StatusBadge>;
  if (job.lastRunAt) return <StatusBadge tone="success">{t("statusOk")}</StatusBadge>;
  return <StatusBadge tone="neutral">{t("statusNever")}</StatusBadge>;
}

export default function CronPage() {
  const t = useTranslations("adminBot.cron");
  const fmt = useBotFormat();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const jobs = useQuery({
    queryKey: ["cron"],
    queryFn: () => api.get<{ jobs: CronJob[] }>("/cron"),
    refetchInterval: REFRESH_MS,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["cron"] });

  const trigger = useMutation({
    mutationFn: (name: string) => api.post(`/cron/${encodeURIComponent(name)}/trigger`),
    onSuccess: (_data, name) => {
      setFeedback({ ok: true, text: t("triggered", { name }) });
      refresh();
    },
    onError: (err, name) =>
      setFeedback({
        ok: false,
        text: t("triggerFailed", { name, error: errorMessage(err) ?? "" }),
      }),
  });

  const updateInterval = useMutation({
    mutationFn: ({ name, intervalMs }: { name: string; intervalMs: number }) =>
      api.post(`/cron/${encodeURIComponent(name)}/interval`, { intervalMs }),
    onSuccess: (_data, { name }) => {
      setFeedback({ ok: true, text: t("intervalSaved", { name }) });
      refresh();
    },
    onError: (err, { name }) =>
      setFeedback({
        ok: false,
        text: t("intervalFailed", { name, error: errorMessage(err) ?? "" }),
      }),
  });

  async function onTrigger(job: CronJob) {
    const ok = await confirm({
      title: t("confirmTitle", { name: job.name }),
      description: t("confirmBody"),
      confirmLabel: t("run"),
    });
    if (ok) trigger.mutate(job.name);
  }

  const list = jobs.data?.jobs ?? [];

  return (
    <div className="space-y-4">
      {dialog}
      <p className="max-w-3xl text-sm text-muted-foreground">
        {t("intro")}{" "}
        <span className="text-xs">
          {t("refreshNote", { seconds: REFRESH_MS / 1000, count: list.length })}
        </span>
      </p>

      <div aria-live="polite">
        {feedback && (
          <p
            role={feedback.ok ? "status" : "alert"}
            className={`rounded-lg border px-3 py-2 text-sm ${
              feedback.ok
                ? "border-dbz-green/50 bg-dbz-green/10 text-green-300"
                : "border-dbz-red/50 bg-dbz-red/10 text-red-200"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </div>

      {jobs.isError ? (
        <ErrorState
          message={errorMessage(jobs.error)}
          onRetry={() => jobs.refetch()}
          retrying={jobs.isFetching}
        />
      ) : jobs.isLoading ? (
        <SkeletonRows count={4} className="h-40" />
      ) : list.length === 0 ? (
        <EmptyState title={t("empty")} icon={<CalendarClock />} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((job) => (
            <li
              key={job.name}
              className={`min-w-0 rounded-xl border border-l-4 border-border bg-card p-4 ${
                job.lastError
                  ? "border-l-dbz-red"
                  : job.lastRunAt
                    ? "border-l-dbz-green"
                    : "border-l-border"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="break-all font-mono text-sm font-semibold text-primary">
                      {job.name}
                    </h3>
                    <JobStatus job={job} />
                  </div>
                  {job.description && (
                    <p className="text-xs text-muted-foreground">{job.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onTrigger(job)}
                  disabled={trigger.isPending}
                  className="btn btn-ghost shrink-0"
                  title={t("runTitle")}
                >
                  <Play aria-hidden className="h-3.5 w-3.5" />
                  {t("run")}
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="mb-0.5 text-muted-foreground">{t("cadence")}</dt>
                  <dd className="font-medium text-foreground">
                    <IntervalEditor
                      job={job}
                      onSave={(intervalMs) => updateInterval.mutate({ name: job.name, intervalMs })}
                      saving={updateInterval.isPending}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">{t("runCount")}</dt>
                  <dd className="font-medium text-foreground">{fmt.number(job.runCount)}</dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">{t("lastRun")}</dt>
                  <dd className="font-medium text-foreground">
                    {fmt.relative(job.lastRunAt)}
                    {job.lastDurationMs !== null && (
                      <span className="ml-1 text-muted-foreground">
                        ({fmt.duration(job.lastDurationMs)})
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="mb-0.5 text-muted-foreground">{t("nextRun")}</dt>
                  <dd className="flex items-center gap-1 font-medium text-foreground">
                    <Clock aria-hidden className="h-3 w-3 text-muted-foreground" />
                    {fmt.relative(job.nextRunAt)}
                  </dd>
                </div>
              </dl>

              {job.lastError && (
                <p className="mt-3 break-words rounded-lg border border-dbz-red/40 bg-dbz-red/10 p-2 text-xs text-red-200">
                  <span className="font-semibold">{t("lastError")}</span> {job.lastError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IntervalEditor({
  job,
  onSave,
  saving,
}: {
  job: CronJob;
  onSave: (intervalMs: number) => void;
  saving: boolean;
}) {
  const t = useTranslations("adminBot.cron");
  const fmt = useBotFormat();
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const seconds = Number.parseInt(value, 10);
  const valid = Number.isFinite(seconds) && seconds >= 1;

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {fmt.duration(job.intervalMs)}
        <button
          type="button"
          onClick={() => {
            setValue(String(Math.round(job.intervalMs / 1000)));
            setEditing(true);
          }}
          className="cible-44 inline-flex items-center justify-center rounded px-1 text-muted-foreground transition-colors hover:text-primary"
          title={t("editCadence")}
          aria-label={t("editCadence")}
        >
          <Pencil aria-hidden className="h-3 w-3" />
        </button>
      </span>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave(seconds * 1000);
    setEditing(false);
  };

  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1">
      <label htmlFor={inputId} className="sr-only">
        {t("intervalLabel")}
      </label>
      <input
        id={inputId}
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={!valid}
        className="input w-20 !py-0.5 text-xs"
      />
      <span className="text-muted-foreground">{t("secondsUnit")}</span>
      <button
        type="submit"
        disabled={saving || !valid}
        className="px-1 text-green-400 hover:text-green-300 disabled:opacity-40"
        title={t("save")}
        aria-label={t("save")}
      >
        <Check aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="px-1 text-muted-foreground hover:text-foreground"
        title={t("cancel")}
        aria-label={t("cancel")}
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
