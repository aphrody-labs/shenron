/* oxlint-disable react/no-array-index-key -- reviewed: legacy patterns, behavior preserved */
/**
 * Cartes « pages wiki affiliées » d'une section : chaque lien renvoie vers une
 * autre fiche wiki avec sa photo (ex. affilier des personnages à une catégorie
 * « Powerscaling »). Server Component présentationnel — liens internes indexables.
 */
import Link from "next/link";
import type { WikiSectionLink } from "@/db/bot-schema";

export function WikiSectionLinks({ links }: { links: WikiSectionLink[] }) {
  if (!links || links.length === 0) return null;
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {links.map((l, i) => (
        <Link
          key={`${l.href}-${i}`}
          href={l.href}
          className="group flex min-w-0 items-center gap-3 rounded-lg border border-dbz-border bg-dbz-card/60 p-2 transition-colors hover:border-dbz-orange hover:bg-dbz-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange motion-reduce:transition-none"
        >
          {l.image ? (
            <img
              src={l.image}
              alt=""
              loading="lazy"
              className="h-14 w-14 shrink-0 rounded-md object-cover object-top ring-1 ring-white/10"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-md bg-dbz-bg" />
          )}
          <div className="min-w-0 flex-1">
            <p className="min-w-0 whitespace-normal break-words font-display text-sm leading-snug font-bold text-white/90 group-hover:text-dbz-orange">
              {l.label}
            </p>
            {l.sub && (
              <p className="min-w-0 whitespace-normal break-words text-xs leading-relaxed text-white/60">
                {l.sub}
              </p>
            )}
            <span className="mt-1 inline-block text-xs font-semibold uppercase tracking-wide text-dbz-blue-light/80">
              Voir la fiche →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
