"use client";

import { InferenceControl } from "./InferenceControl";
import { call } from "../../lib/backend";
import { usePage } from "../../lib/queries";
import { pipelineStages, useKoharuStore, type PipelineScope } from "../../lib/store";
import { commands, type Scope, type Stage } from "@aphrody/shenron-koharu/protocol";

export function CanvasCommandBar() {
  const page = usePage().data;
  const selectedPages = useKoharuStore((state) => state.selectedPages);
  const jobs = useKoharuStore((state) => state.jobs);
  const running = Object.values(jobs).find((job) => job.state === "running");

  const run = (selection: PipelineScope, stages: Stage[]) => {
    if (!page) return;
    const scope: Scope =
      selection === "project"
        ? { scope: "project" }
        : selection === "selected-pages"
          ? { scope: "pages", value: selectedPages }
          : { scope: "pages", value: [page.id] };
    const operation =
      stages.length === pipelineStages.length
        ? ({ operation: "full" } as const)
        : stages.length === 1
          ? ({ operation: "only", stage: stages[0]! } as const)
          : ({ operation: "stages", stages } as const);
    void call(commands.process, scope, operation).catch(() => undefined);
  };

  return (
    <header className="flex min-h-11 min-w-0 shrink-0 items-center gap-2 overflow-x-auto border-b border-border/80 bg-[var(--surface-toolbar)] px-2.5 lg:h-10 lg:min-h-10 [&_button]:min-h-11 lg:[&_button]:min-h-0">
      <div className="min-w-0 flex-1" />
      <InferenceControl disabled={!page || Boolean(running)} onRun={run} />
    </header>
  );
}
