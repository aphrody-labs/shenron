/**
 * En-tête et sections d’une page d’administration.
 *
 * L’en-tête est le `PageHeader` du site en régime compact : l’admin n’a plus sa
 * propre typographie (`font-saiyan` orange en capitales, `text-lg` gris,
 * `text-4xl`… selon la page). La rubrique de la navigation sert de surtitre, les
 * actions s’alignent à droite sur desktop et passent sous le titre sur mobile.
 *
 * Aucun conteneur de largeur ici : le cadre (`AdminFrame`) la porte déjà.
 * Server component.
 */
import type { ReactNode } from "react";
import { PageHeader } from "../layout/PageHeader";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = "mb-6 md:mb-8",
}: {
  /** Rubrique de la navigation admin (« Encyclopédie », « Communauté »…). */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Ligne de compteurs sous la description (« 42 sagas · 7 séries »). */
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div data-admin-page-header="">
      <PageHeader
        size="md"
        eyebrow={eyebrow}
        title={title}
        subtitle={
          description || meta ? (
            <>
              {description}
              {meta && <span className="mt-2 block text-xs tabular-nums text-os/45">{meta}</span>}
            </>
          ) : undefined
        }
        actions={actions}
        className={className}
      />
    </div>
  );
}

/**
 * Bloc titré d'une page d'administration : bordure fine, rayon 12 px, aucun
 * halo. Remplace les `.card` + `<h2>` écrits à la main, chacun avec sa taille.
 */
export function AdminSection({
  title,
  description,
  actions,
  children,
  className = "",
  id,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Contenu bord à bord (table, liste) : pas de marge intérieure autour des enfants. */
  flush?: boolean;
}) {
  const head = title || description || actions;
  return (
    <section
      id={id}
      className={`rounded-xl border border-os/12 bg-dbz-card/60 ${flush ? "" : "p-4 sm:p-5"} ${className}`}
    >
      {head && (
        <div
          className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${flush ? "p-4 sm:p-5" : "mb-4"}`}
        >
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold leading-snug text-os">{title}</h2>}
            {description && <p className="mt-1 text-sm text-os/55">{description}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
