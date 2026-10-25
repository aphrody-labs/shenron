// SPDX-License-Identifier: Apache-2.0
// Shared pieces of the studio screens in the « Planche couleur » direction: panels ruled by a
// 1 px ink line (os at 12 %), full-round status chips, the site's `.btn`/`.input` classes at
// touch size (44 px). No red: an error is a ruled note, not an alarm.
import type { ReactNode } from "react";

export const panelClass =
  "flex flex-col gap-3 rounded-lg border border-os/12 p-5 text-[16px] leading-[1.55] text-os";
export const rowClass =
  "flex items-center justify-between gap-3 rounded-lg border border-os/12 p-3 text-[16px] text-os";
export const primaryButtonClass = "btn btn-primary min-h-11";
export const ghostButtonClass = "btn btn-ghost min-h-11";
export const fieldClass = "input min-h-11 text-[16px]";

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
