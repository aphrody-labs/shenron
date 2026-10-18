// SPDX-License-Identifier: Apache-2.0
// Shared pieces of the studio screens in the « Planche couleur » direction: panels ruled by a
// 1 px ink line (os at 12 %), full-round status chips, the site's `.btn`/`.input` classes at
// touch size (44 px). No red: an error is a ruled note, not an alarm.
import type { ReactNode } from "react";

export const panelClass =
  "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm leading-relaxed text-card-foreground";
export const rowClass =
  "flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm text-foreground";
export const primaryButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-transparent bg-primary px-4 hover:bg-primary/90 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const ghostButtonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 hover:bg-muted text-sm text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const fieldClass =
  "min-h-12 min-w-0 w-full max-w-full rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function StatusChip({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={
        ok
          ? "inline-flex shrink-0 items-center rounded-full bg-dbz-green px-3 py-1 text-[14px] font-semibold text-encre"
          : "inline-flex shrink-0 items-center rounded-full border border-os/30 px-3 py-1 text-[14px] text-os/80"
      }
    >
      {children}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-os/30 p-3 text-[16px] text-os">
      {children}
    </p>
  );
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  return <p className="text-[16px] leading-[1.55] text-os/75">{children}</p>;
}
