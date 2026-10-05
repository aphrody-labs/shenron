/**
 * L'en-tête de l'accueil : le nom du site, la phrase éditable dans
 * `/admin/home`, puis la recherche — le premier geste de la page, pas une
 * bannière (cf. `.coord/ui-sprint.md`).
 *
 * Composant serveur sans état : la recherche est le seul îlot client.
 */
import Link from "next/link";
import { T } from "@/components/T";
import type { HomeConfig } from "@/lib/home-scenes";
import { HomeSearch } from "./HomeSearch";
import { focusRing } from "./ui";

export function HomeHero({
  hero,
  className = "",
}: {
  hero: HomeConfig["hero"];
  className?: string;
}) {
  const lede = hero.lede.trim();
  const cta = hero.ctaLabel.trim() && hero.ctaHref.trim() ? hero : null;
  return (
    <header className={`min-w-0 ${className}`}>
      <h1 className="text-3xl font-[850] leading-tight tracking-[-0.02em] text-os sm:text-4xl lg:text-5xl">
        <T k="accueil.hero.title" />
      </h1>
      {lede ? (
        <p className="mt-3 max-w-[72ch] text-base leading-relaxed text-os/80 lg:text-[1.0625rem]">
          {lede}
        </p>
      ) : null}
      <HomeSearch className="mt-6">
        {cta ? (
          <Link
            href={cta.ctaHref}
            className={`inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-dbz-orange transition-colors hover:text-gi-clair ${focusRing}`}
          >
            {cta.ctaLabel}
          </Link>
        ) : null}
      </HomeSearch>
    </header>
  );
}
