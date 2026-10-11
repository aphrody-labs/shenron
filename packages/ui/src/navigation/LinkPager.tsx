/**
 * LinkPager — pagination **en liens**, pour les listes rendues côté serveur.
 *
 * À ne pas confondre avec `components/ui/Pagination.tsx`, qui pagine une liste
 * déjà chargée dans le navigateur (grille filtrée de 1 300 personnages). Ici,
 * chaque page est une URL prérendue : le journal, le fil d'actualité et les
 * index wiki doivent rester cacheables par le CDN et crawlables.
 *
 * `rel="prev"`/`rel="next"` sont posés sur les liens : c'est ce qui dit à un
 * crawler que la série continue sans qu'il ait à deviner.
 *
 * Server component.
 */
import type { ReactNode } from "react";
import { ChevronDroite, ChevronGauche } from "../icones";
import { pagerWindow } from "../lib/page-window";
import type { UiLinkComponent } from "./link";

/** Numéros à afficher, `null` = ellipse. Même règle que la pagination client (`@aphrody/shenron-ui`). */
export { pagerWindow };

export function LinkPager({
  page,
  pages,
  href,
  ariaLabel = "Pagination",
  className = "",
  previousLabel = "Précédent",
  nextLabel = "Suivant",
  positionLabel = `Page ${page} sur ${pages}`,
  linkComponent: Link = "a",
}: {
  page: number;
  pages: number;
  /** Construit l'URL d'une page (page 1 = URL canonique sans suffixe). */
  href: (page: number) => string;
  ariaLabel?: string;
  className?: string;
  previousLabel?: ReactNode;
  nextLabel?: ReactNode;
  positionLabel?: ReactNode;
  linkComponent?: UiLinkComponent;
}) {
  if (pages <= 1) return null;
  const numbers = pagerWindow(page, pages);

  const arrow =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 font-display text-[0.875rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center justify-between gap-4 border-t border-os/12 pt-6 ${className}`}
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          rel="prev"
          className={`${arrow} border-os/20 text-os/85 hover:border-os/45 hover:text-os`}
        >
          <ChevronGauche size={16} />
          {previousLabel}
        </Link>
      ) : (
        <span className={`${arrow} border-os/10 text-os/30`} aria-hidden>
          <ChevronGauche size={16} />
          {previousLabel}
        </span>
      )}

      {/* Les numéros sont un confort desktop ; sur mobile, précédent/suivant +
			    la position suffisent et évitent une barre qui déborde. */}
      <ul className="hidden items-center gap-1.5 sm:flex">
        {numbers.map((n, i) =>
          n === null ? (
            <li key={`gap-${i}`} className="px-1 text-os/35" aria-hidden>
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={href(n)}
                aria-current={n === page ? "page" : undefined}
                className={[
                  "inline-flex size-11 items-center justify-center rounded-full border font-display text-[0.875rem] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere",
                  n === page
                    ? "border-dbz-green bg-dbz-green/25 text-os"
                    : "border-os/15 text-os/75 hover:border-os/45 hover:text-os",
                ].join(" ")}
              >
                {n}
              </Link>
            </li>
          ),
        )}
      </ul>

      <span className="text-[0.875rem] tabular-nums text-os/60 sm:hidden">{positionLabel}</span>

      {page < pages ? (
        <Link
          href={href(page + 1)}
          rel="next"
          className={`${arrow} border-os/20 text-os/85 hover:border-os/45 hover:text-os`}
        >
          {nextLabel}
          <ChevronDroite size={16} />
        </Link>
      ) : (
        <span className={`${arrow} border-os/10 text-os/30`} aria-hidden>
          {nextLabel}
          <ChevronDroite size={16} />
        </span>
      )}
    </nav>
  );
}
