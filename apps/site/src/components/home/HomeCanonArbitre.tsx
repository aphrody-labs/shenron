/* oxlint-disable jsx-a11y/prefer-tag-over-role -- reviewed: legacy patterns, behavior preserved */
import Link from "next/link";
import type { HomeCanonConfig } from "@/lib/home-scenes";
import type { CanonConfig } from "@/lib/canon-engine";
import { T } from "@/components/T";
import { HomeSection } from "./HomeSection";

/**
 * L'arbitre de canonicité sur l'accueil.
 *
 * Un `<form method="get">` vers `/wiki/canon` (`/wiki/canon?q=…`) :
 * navigation faite par le navigateur, résultat rendu côté serveur, page
 * partageable par son URL, lisible sans JavaScript. Le bloc est un composant
 * serveur pur : il reçoit la doctrine déjà lue par la page (pas de cookie, pas
 * d'en-tête, l'accueil reste cacheable) et n'affiche que ce qu'elle contient —
 * les rangs tels qu'ils sont définis, et des sujets tranchés à la main.
 */
export function HomeCanonArbitre({
  config,
  doctrine,
  references,
  className = "",
}: {
  config: HomeCanonConfig;
  doctrine: CanonConfig;
  /** Nombre de preuves du corpus ingéré (table `canon_references`). */
  references: number;
  className?: string;
}) {
  if (!config.enabled) return null;
  const rangs = doctrine.tiers;
  const sujets = config.sujets > 0 ? doctrine.entries.slice(0, config.sujets) : [];
  const placeholder = doctrine.placeholder?.trim() || config.placeholder;

  return (
    <HomeSection
      id="canon"
      title={config.title}
      subtitle={config.subtitle}
      moreHref="/wiki/canon"
      moreLabel={<T k="home.canon.readDoctrine" />}
      className={className}
    >
      <div className="rounded-xl border border-white/[0.08] bg-dbz-card/80 p-4 sm:p-5">
        <form
          action="/wiki/canon"
          method="get"
          role="search"
          aria-labelledby="home-canon-form-label"
          className="flex flex-col gap-2 sm:flex-row"
        >
          {/* Un composant serveur ne sait pas remplir un `aria-label` depuis le
					    dictionnaire — il n'a pas de contexte de langue. L'étiquette est
					    donc un nœud, traduit comme le reste, que l'élément désigne. */}
          <span id="home-canon-form-label" className="sr-only">
            <T k="home.canon.formLabel" />
          </span>
          <label htmlFor="home-canon-q" className="sr-only">
            <T k="home.canon.inputLabel" />
          </label>
          <input
            id="home-canon-q"
            name="q"
            type="search"
            required
            minLength={2}
            maxLength={400}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="search"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-white/15 bg-dbz-bg/80 px-4 text-base text-white placeholder:text-white/45 focus:border-dbz-orange focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-12 rounded-lg bg-dbz-orange px-5 font-display text-sm font-bold text-dbz-bg transition-colors hover:bg-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
          >
            <T k="home.canon.submit" />
          </button>
        </form>

        <p id="home-canon-rangs" className="sr-only">
          <T k="home.canon.tiersLabel" />
        </p>
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-labelledby="home-canon-rangs">
          {rangs.map((rang) => (
            <li
              key={rang.id}
              className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-white/80"
            >
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: rang.couleur }}
              />
              {rang.court}
            </li>
          ))}
        </ul>

        {sujets.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-semibold text-white/70">
              <T k="home.canon.settled" />
            </p>
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {sujets.map((sujet) => {
                const rang = rangs.find((t) => t.id === sujet.tier);
                return (
                  <li key={sujet.id}>
                    <Link
                      href={`/wiki/canon?q=${encodeURIComponent(sujet.title)}`}
                      className="group flex min-h-12 items-center gap-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
                    >
                      <span
                        aria-hidden
                        className="inline-block size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: rang?.couleur ?? "#9ca3af" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white transition-colors group-hover:text-dbz-gold">
                          {sujet.title}
                        </span>
                        <span className="block truncate text-xs text-white/55">
                          {rang?.court ?? sujet.tier}
                          {" — "}
                          {sujet.verdict}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xs text-white/50">
          <T k="home.canon.counts" values={{ sujets: doctrine.entries.length, references }} />
        </p>
      </div>
    </HomeSection>
  );
}
