/**
 * En-tête et sections d’une page d’administration.
 *
 * L’en-tête compact appartient à l’atelier : titre lisible, description et actions
 * tactiles, sans la mise en scène des pages publiques. La rubrique vient de la
 * navigation et les actions restent celles du consommateur.
 *
 * Aucun conteneur de largeur ici : le cadre (`AdminFrame`) la porte déjà.
 * Server component.
 */
import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className = "mb-5",
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
    <header data-admin-page-header="" className={`border-b border-border pb-5 ${className}`}>
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow && <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>}
          <h1 className="break-words text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
          {meta && <div className="text-xs tabular-nums text-muted-foreground">{meta}</div>}
        </div>
        {actions && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 [&>*]:min-h-12">{actions}</div>
        )}
      </div>
    </header>
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
      className={`min-w-0 rounded-xl border border-border bg-card text-card-foreground ${flush ? "" : "p-4 sm:p-5"} ${className}`}
    >
      {head && (
        <div
          className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${flush ? "p-4 sm:p-5" : "mb-4"}`}
        >
          <div className="min-w-0">
            {title && <h2 className="break-words text-base font-semibold leading-snug">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
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
