/* oxlint-disable jsx-a11y/prefer-tag-over-role -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
"use client";
import { Button, Banner } from "@aphrody/m3-primitives";

export interface NativePipelineSnapshot {
  native: {
    abi: number | null;
    version: string | null;
    bun: string;
    rag?: { chunks: number; vectors: number; ragReady: boolean | null } | null;
  };
  actions: {
    id: string;
    category: string;
    target: string;
    available: boolean;
    concurrent?: boolean;
  }[];
  jobs: {
    id: string;
    action: string;
    state: string;
    startedAt: string;
    finishedAt: string | null;
    code: number | null;
    host?: string | null;
    remoteId?: string | null;
  }[];
}
export interface NativePipelineLabels {
  title: string;
  description: string;
  refresh: string;
  run: string;
  cancel: string;
  unavailable: string;
  empty: string;
  wasm: string;
  wasmReady: string;
  wasmFailed: string;
  states: Record<string, string>;
  categories: Record<string, string>;
  ragCounts: (chunks: number, vectors: number) => string;
}
/** Presentation only: Bun owns actions, WASM is executed by the browser consumer. */
export function NativePipelinePanel({
  snapshot,
  labels,
  pending,
  error,
  wasmState,
  onRun,
  onCancel,
  onRefresh,
  onWasm,
}: {
  snapshot?: NativePipelineSnapshot;
  labels: NativePipelineLabels;
  pending: boolean;
  error: boolean;
  wasmState: "idle" | "ready" | "failed";
  onRun: (id: string) => void;
  onCancel: (id: string) => void;
  onRefresh: () => void;
  onWasm: () => void;
}) {
  return (
    <section
      className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground"
      aria-label={labels.title}
    >
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <p className="text-sm text-muted-foreground">{labels.description}</p>
      {pending && <progress className="w-full" aria-label={labels.refresh} />}
      <div className="flex flex-wrap gap-3">
        <Button variant="tonal" disabled={pending} onClick={onRefresh}>
          {labels.refresh}
        </Button>
        <Button variant="tonal" disabled={pending} onClick={onWasm}>
          {labels.wasm}
        </Button>
        {wasmState !== "idle" && (
          <span role="status">{wasmState === "ready" ? labels.wasmReady : labels.wasmFailed}</span>
        )}
      </div>
      {error && <Banner>{labels.unavailable}</Banner>}
      {snapshot && (
        <>
          <p className="font-mono text-xs">
            Bun {snapshot.native.bun} · FFI {snapshot.native.version ?? "—"} · ABI{" "}
            {snapshot.native.abi ?? "—"}
          </p>
          {snapshot.native.rag && (
            <p>{labels.ragCounts(snapshot.native.rag.chunks, snapshot.native.rag.vectors)}</p>
          )}
          {!snapshot.actions.length && <p>{labels.empty}</p>}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
            {snapshot.actions.map((action) => (
              <div
                key={action.id}
                className="min-w-0 space-y-2 rounded-lg border border-border p-3"
              >
                <p>
                  {labels.categories[action.category]} · <code>{action.target}</code>
                </p>
                <code className="block break-all text-xs">{action.id}</code>
                <Button
                  variant="filled"
                  disabled={
                    pending ||
                    !action.available ||
                    (!action.concurrent &&
                      snapshot.jobs.some((job) => job.state === "running" && !job.remoteId))
                  }
                  onClick={() => onRun(action.id)}
                >
                  {action.available ? labels.run : labels.unavailable}
                </Button>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {snapshot.jobs.map((job) => (
              <li key={job.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
                <code className="break-all text-xs">{job.action}</code>
                <span role="status">{labels.states[job.state] ?? labels.unavailable}</span>
                {job.code !== null && <code>{job.code}</code>}
                {job.host && <code>{job.host}</code>}
                {job.remoteId && <code className="break-all text-xs">{job.remoteId}</code>}
                {["submitting", "queued", "running"].includes(job.state) && (
                  <Button variant="text" disabled={pending} onClick={() => onCancel(job.id)}>
                    {labels.cancel}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
