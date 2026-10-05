/**
 * Badge d'état de l'administration — publié, brouillon, en ligne, en erreur.
 *
 * Remplace `StatusPill`, `StatusBadge`, `JobStatus`, `LiveBadge` et les
 * `.badge` à bordure noire de 2 px recopiés page par page. Six tons, tous
 * adossés aux jetons `--color-dbz-*` que `/admin/design` pilote. Le ton seul ne
 * porte pas l'information : le texte du badge la dit toujours.
 * Server component.
 */
import type { ReactNode } from "react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<StatusTone, { badge: string; dot: string }> = {
  neutral: { badge: "border-os/15 bg-os/[0.04] text-os/70", dot: "bg-os/50" },
  info: { badge: "border-dbz-ki/40 bg-dbz-ki/10 text-dbz-ki", dot: "bg-dbz-ki" },
  success: { badge: "border-dbz-green/50 bg-dbz-green/15 text-green-300", dot: "bg-dbz-green" },
  warning: { badge: "border-dbz-amber/40 bg-dbz-amber/10 text-dbz-amber", dot: "bg-dbz-amber" },
  danger: { badge: "border-dbz-red/50 bg-dbz-red/10 text-red-300", dot: "bg-dbz-red" },
  accent: { badge: "border-dbz-orange/50 bg-dbz-orange/10 text-dbz-orange", dot: "bg-dbz-orange" },
};

export function StatusBadge({
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
  title,
  className = "",
}: {
  tone?: StatusTone;
  /** Pastille devant le texte (états vivants : en ligne, en cours). */
  dot?: boolean;
  /** Pastille animée, coupée par `prefers-reduced-motion`. */
  pulse?: boolean;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const palette = TONES[tone];
  return (
    <span
      title={title}
      data-tone={tone}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5 ${palette.badge} ${className}`}
    >
      {(dot || pulse) && (
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${palette.dot} ${pulse ? "motion-safe:animate-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
