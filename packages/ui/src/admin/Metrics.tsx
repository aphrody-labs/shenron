/**
 * Compteurs d'administration : la rangée de chiffres en tête des tableaux de
 * bord (membres, Zénis en circulation, tâches en échec…).
 *
 * `StatTiles` (`@aphrody/shenron-ui/public`) ne prend que des nombres ; l'admin affiche
 * aussi des durées, des tailles et des états (« 12 Mo », « 3 h », « OK »). Même
 * grammaire visuelle — bordure fine, rayon 12 px, chiffre tabulaire — avec une
 * valeur libre et un ton. Deux colonnes sur mobile, quatre sur grand écran.
 * Server component.
 */
import type { ReactNode } from "react";
import type { UiLinkComponent } from "../navigation/link";

export type MetricTone = "default" | "success" | "warning" | "danger" | "accent";

const VALUE_TONE: Record<MetricTone, string> = {
  default: "text-os",
  success: "text-green-300",
  warning: "text-dbz-amber",
  danger: "text-red-300",
  accent: "text-dbz-orange",
};

export function MetricGrid({
  children,
  className = "",
  columns = 4,
}: {
  children: ReactNode;
  className?: string;
  /** Colonnes au plus large ; deux sur mobile quoi qu'il arrive. */
  columns?: 2 | 3 | 4 | 5 | 6;
}) {
  const wide = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-3 xl:grid-cols-4",
    5: "md:grid-cols-3 xl:grid-cols-5",
    6: "md:grid-cols-3 xl:grid-cols-6",
  }[columns];
  return <dl className={`grid grid-cols-2 gap-3 sm:gap-4 ${wide} ${className}`}>{children}</dl>;
}

export function Metric({
  label,
  value,
  hint,
  icon,
  tone = "default",
  href,
  linkComponent: Link = "a",
  className = "",
}: {
  label: ReactNode;
  /** Valeur déjà formatée ; `null` affiche « — » plutôt qu'un zéro trompeur. */
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  href?: string;
  linkComponent?: UiLinkComponent;
  className?: string;
}) {
  // Lien étiré depuis l'intitulé : un `<a>` ne peut pas envelopper `<dt>`/`<dd>`,
  // et le nom accessible du lien reste l'intitulé du compteur.
  return (
    <div
      className={`relative min-w-0 rounded-xl border border-os/12 bg-dbz-card/70 p-3.5 sm:p-4 ${href ? "transition-colors hover:border-dbz-orange/60 focus-within:border-kinto-lumiere" : ""} ${className}`}
    >
      <dt className="flex min-w-0 items-center gap-2 text-xs font-medium text-os/55">
        {icon && (
          <span aria-hidden className="shrink-0 text-os/45 [&_svg]:h-4 [&_svg]:w-4">
            {icon}
          </span>
        )}
        {href ? (
          <Link
            href={href}
            className="truncate outline-none after:absolute after:inset-0 after:rounded-xl hover:text-os"
          >
            {label}
          </Link>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </dt>
      <dd
        className={`mt-1.5 text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-semibold leading-none tabular-nums ${VALUE_TONE[tone]}`}
      >
        {value ?? "—"}
      </dd>
      {hint && <dd className="mt-1.5 text-xs text-os/40">{hint}</dd>}
    </div>
  );
}
