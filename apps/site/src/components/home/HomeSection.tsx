/**
 * Cadre commun des blocs de l'accueil : un titre, une phrase facultative, un
 * lien « tout voir » aligné à droite, puis le contenu.
 *
 * Un seul gabarit pour tous les blocs : l'accueil est une page d'application,
 * les blocs se lisent comme les panneaux d'un même écran, pas comme des
 * chapitres d'un magazine — pas de sur-titre, pas de numérotation, pas de
 * capitales espacées.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { FlecheDroite } from "@aphrody/shenron-ui/icones";
import { blockTitle, focusRing } from "./ui";

export function HomeSection({
  id,
  title,
  subtitle,
  moreHref,
  moreLabel,
  className = "",
  children,
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  moreHref?: string;
  moreLabel?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const titleId = `accueil-${id}-titre`;
  return (
    <section id={id} aria-labelledby={titleId} className={`min-w-0 scroll-mt-24 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={titleId} className={blockTitle}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        {moreHref && moreLabel ? (
          <Link
            href={moreHref}
            aria-describedby={titleId}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-primary transition-colors hover:bg-secondary hover:text-secondary-foreground ${focusRing}`}
          >
            <FlecheDroite size={22} />
            <span className="sr-only">{moreLabel}</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
