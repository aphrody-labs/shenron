/**
 * Cadre commun des blocs de l'accueil : un titre souligné d'un repère d'accent,
 * une phrase facultative, un lien « tout voir » aligné à droite avec retour au
 * clic, puis le contenu.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { FlecheDroite } from "@aphrody/shenron-ui/icones";
import { blockTitle, focusRing, tactilePress } from "./ui";

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
        <div className="min-w-0">
          <div
            className={`flex min-h-11 items-center gap-3 text-foreground ${moreHref && moreLabel ? "pr-14" : ""}`}
          >
            <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-primary" />
            <h2 id={titleId} className={`min-w-0 flex-1 ${blockTitle}`}>
              {title}
            </h2>
          </div>
          {subtitle ? (
            <p className="mt-1.5 max-w-[72ch] pl-4 text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
          <div className="pt-4">{children}</div>
        </div>
        {moreHref && moreLabel ? (
          <Link
            href={moreHref}
            aria-describedby={titleId}
            className={`group absolute right-0 top-0 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-os/14 bg-dbz-card/80 text-primary ${tactilePress} hover:border-dbz-gold hover:bg-secondary hover:text-secondary-foreground active:scale-90 ${focusRing}`}
          >
            <span className="transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none">
              <FlecheDroite size={22} />
            </span>
            <span className="sr-only">{moreLabel}</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
