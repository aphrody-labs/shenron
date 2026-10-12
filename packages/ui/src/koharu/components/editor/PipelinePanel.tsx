"use client";

import { CircleAlert, Cpu, Download, LoaderCircle, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import { call } from "../../lib/backend";
import { useKoharuStore } from "../../lib/store";
import { commands } from "@aphrody/shenron-koharu/protocol";
import { Button } from "../../../components/button";
import { ResourceMonitor } from "./ResourceMonitor";

/** A single source of truth for native pipeline state and controls. */
export function PipelinePanel() {
  const { t } = useTranslation();
  const jobs = useKoharuStore((state) => state.jobs);
  const downloads = useKoharuStore((state) => state.downloads);
  const visibleJobs = Object.values(jobs).filter(
    (job) => job.state === "running" || job.state === "failed",
  );
  const visibleDownloads = Object.values(downloads).filter(
    (download) => download.state === "running" || download.state === "failed",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <div className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="size-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium">{t("menu.process")}</p>
          <p className="truncate text-[9px] text-muted-foreground">
            {t("activity.title")}
          </p>
        </div>
        <ResourceMonitor />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visibleJobs.length === 0 && visibleDownloads.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-6 text-center">
            <div>
              <Cpu className="mx-auto size-6 text-primary" />
              <p className="mt-3 text-xs font-semibold">{t("activity.emptyTitle")}</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                {t("activity.emptyDescription")}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 p-3">
            {visibleDownloads.map((download) => (
              <div key={download.id} className="rounded-xl border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2 text-[10px]">
                  {download.state === "failed" ? (
                    <CircleAlert className="size-3.5 text-destructive" />
                  ) : (
                    <Download className="size-3.5 text-primary" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {download.name || t("activity.modelDownload")}
                  </span>
                  {download.total > 0 ? (
                    <span className="tabular-nums">
                      {Math.round((download.completed / download.total) * 100)}%
                    </span>
                  ) : null}
                </div>
                {download.state === "running" ? (
                  <progress
                    max={download.total || undefined}
                    value={download.completed}
                    className="mt-2 h-1 w-full accent-primary"
                  />
                ) : (
                  <p className="mt-1 text-[10px] text-destructive">{download.error}</p>
                )}
              </div>
            ))}
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-xl border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2 text-[10px]">
                  {job.state === "failed" ? (
                    <CircleAlert className="size-3.5 text-destructive" />
                  ) : (
                    <LoaderCircle className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {job.stage ? t(`phase.${job.stage}`, { defaultValue: job.stage }) : t("activity.processing")}
                  </span>
                  {job.state === "running" ? (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={t("activity.stop")}
                      onClick={() => void call(commands.stopJob, job.id).catch(() => undefined)}
                    >
                      <Square className="size-2.5 fill-current" />
                    </Button>
                  ) : null}
                </div>
                {job.state === "failed" ? (
                  <p className="mt-1 text-[10px] text-destructive">{job.error}</p>
                ) : (
                  <progress
                    max={job.total || undefined}
                    value={job.completed}
                    className="mt-2 h-1 w-full accent-primary"
                  />
                )}
                {job.model ? <p className="mt-1 truncate text-[9px] text-muted-foreground">{job.model}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
