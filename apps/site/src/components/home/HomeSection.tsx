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
import { ChevronBas, FlecheDroite } from "@aphrody/shenron-ui/icones";
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
      <div className="relative min-w-0">
        <details name="dbfr-home-sections" className="group min-w-0">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-lg text-foreground [&::-webkit-details-marker]:hidden ${moreHref && moreLabel ? "pr-14" : ""} ${focusRing}`}
          >
            <h2 id={titleId} className={`min-w-0 flex-1 ${blockTitle}`}>
              {title}
            </h2>
            <ChevronBas
              size={22}
              className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          {subtitle ? (
            <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          <div className="pt-3">{children}</div>
        </details>
        {moreHref && moreLabel ? (
          <Link
            href={moreHref}
            aria-describedby={titleId}
            className={`absolute right-0 top-0 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-primary transition-colors hover:bg-secondary hover:text-secondary-foreground ${focusRing}`}
          >
            <FlecheDroite size={22} />
            <span className="sr-only">{moreLabel}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
