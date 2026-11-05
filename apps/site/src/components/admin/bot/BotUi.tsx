"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * Presentation blocks shared by the bot admin pages (overview, guild mirror,
 * cron, services, settings, reports). One grammar for sections, empty states,
 * errors and loading, built on the semantic tokens of the admin kit
 * (`border-border`, `bg-card`, `text-muted-foreground`).
 */

export function Section({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-card ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <span aria-hidden className="text-muted-foreground [&_svg]:h-7 [&_svg]:w-7">
        {icon ?? <Inbox />}
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const t = useTranslations("adminBot.common");
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-dbz-red/40 bg-dbz-red/10 px-4 py-3 text-sm text-red-200"
    >
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message ?? t("loadFailed")}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying} className="btn btn-ghost">
          <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function SkeletonRows({
  count = 3,
  className = "h-14",
}: {
  count?: number;
  className?: string;
}) {
  const t = useTranslations("adminBot.common");
  return (
    <output aria-label={t("loading")} className="block space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`animate-pulse rounded-lg bg-muted/40 ${className}`} />
      ))}
    </output>
  );
}

export function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
