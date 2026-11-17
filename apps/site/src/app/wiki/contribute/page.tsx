import { PageShell } from "@/components/kit";
/**
 * /wiki/contribute — la page qui transforme « signaler » en « écrire ».
 *
 * Trois choses, dans cet ordre, parce que c'est l'ordre dans lequel on se
 * décide à contribuer :
 *   1. comment ça marche, en trois phrases (et ce qu'on risque : rien) ;
 *   2. **où il manque quelque chose**, mesuré en direct — c'est ce qui donne
 *      envie, pas l'invitation générale ;
 *   3. qui a déjà contribué, parce qu'un travail crédité en appelle d'autres.
 *
 * La règle des sources y est écrite noir sur blanc, sans détour : le wiki se
 * rédige sur le manga et les databooks, et le contenu venu de Fandom est en
 * cours de remplacement, pas de prolongement. Autant que ce soit dit ici plutôt
 * que découvert au moment d'un refus.
 */
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import Link from "next/link";
import { Etincelle } from "@aphrody/shenron-ui/icones";
import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { MesContributions } from "@/components/wiki/MesContributions";
import { listeChantiers } from "@/lib/wiki-chantiers";
import { topContributors } from "@/lib/wiki-contributions";
import { ogMeta } from "@/lib/og";
import { T } from "@/components/T";
import {
  ContributionJourneyText,
  WikiContributionJourney,
} from "@/components/wiki/WikiContributionJourney";
import styles from "@/components/wiki/wiki-contribution-journey.module.css";

export const revalidate = 600;

export const metadata: Metadata = ogMeta({
  title: "Contribuer au wiki",
  description:
    "Corrigez et complétez le wiki Dragon Ball : chaque fiche s'édite depuis sa page, la proposition est relue puis publiée à votre nom.",
  canonical: "/wiki/contribute",
  type: "website",
});

/** Les 42 tomes du manga : un nombre imprimé, pas un compteur — mais il ne
 *  s'écrit pas dans le dictionnaire, où il deviendrait intraduisible. */
const TOMES_MANGA = 42;

export default async function PageContribuer() {
  const [workshopsResult, contributorsResult] = await Promise.allSettled([
    listeChantiers(),
    topContributors(20),
  ]);

  const chantiers = workshopsResult.status === "fulfilled" ? workshopsResult.value : [];
  const contributeurs = contributorsResult.status === "fulfilled" ? contributorsResult.value : [];

  const totalVides = chantiers.reduce((n, c) => n + c.vides, 0);

  return (
    <PageShell width="wide" rhythm="loose" className={styles.page} wikiDecorative>
      <Breadcrumbs
        items={[{ label: "Contribuer", display: <T k="wiki.contribuer.breadcrumb" /> }]}
      />

      <PageHeader
        eyebrow={<T k="wiki.contribuer.eyebrow" />}
        title={
          <>
            <T k="wiki.contribuer.titleBefore" />{" "}
            <span className="text-dbz-orange">
              <T k="wiki.contribuer.titleAccent" />
            </span>
          </>
        }
        className="mb-0"
        subtitle={<T k="wiki.contribuer.subtitle" values={{ tomes: TOMES_MANGA }} />}
      />

      <WikiContributionJourney />

      {/* Source policy */}
      <section className="mt-14 rounded-xl border border-dbz-border bg-dbz-card p-6">
        <h2 className="font-saiyan text-2xl uppercase text-[var(--foreground)]">
          <T k="wiki.contribuer.sourcesTitle" />
        </h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              <T k="wiki.contribuer.accepted" />
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--frame-on-surface-variant)]">
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.acceptedMangaTerm" />
                </strong>{" "}
                <T k="wiki.contribuer.acceptedMangaText" />
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.acceptedDatabooksTerm" />
                </strong>{" "}
                <T k="wiki.contribuer.acceptedDatabooksText" />
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.acceptedAnimeTerm" />
                </strong>
                <T k="wiki.contribuer.acceptedAnimeText" />
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-dbz-red">
              <T k="wiki.contribuer.refused" />
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--frame-on-surface-variant)]">
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.refusedWikisTerm" />
                </strong>
                <T k="wiki.contribuer.refusedWikisText" />
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.refusedGamesTerm" />
                </strong>{" "}
                <T k="wiki.contribuer.refusedGamesText" />
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  <T k="wiki.contribuer.refusedGuessTerm" />
                </strong>{" "}
                <T k="wiki.contribuer.refusedGuessText" />
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* --- Où il manque quelque chose --- */}
      <section className="mt-14">
        <h2 className="font-saiyan text-2xl uppercase text-[var(--foreground)]">
          <T k="wiki.contribuer.gapsTitle" />
        </h2>
        {workshopsResult.status === "rejected" ? (
          <p className={styles.status}>
            <ContributionJourneyText name="workshopsUnavailable" />
          </p>
        ) : chantiers.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--frame-on-surface-variant)]">
            <T k="wiki.contribuer.gapsNone" />
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--frame-on-surface-variant)]">
              <T
                k="wiki.contribuer.gapsCount"
                values={{ count: totalVides.toLocaleString("fr-FR") }}
              />
            </p>
            <div className="mt-6 space-y-4">
              {chantiers.map((c) => (
                <div key={c.table} className="rounded-xl border border-dbz-border bg-dbz-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">
                      <ContributionJourneyText table={c.table} />
                    </h3>
                    <p className="text-xs text-[var(--frame-on-surface-variant)]">
                      <span className="font-bold text-dbz-orange">{c.vides}</span>{" "}
                      <T k="wiki.contribuer.gapsToWrite" /> {c.total}
                    </p>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-dbz-orange/70"
                      style={{
                        width: `${Math.round(((c.total - c.vides) / Math.max(c.total, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  {c.exemples.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {c.exemples.map((e) => (
                        <li key={e.href}>
                          <Link
                            href={e.href}
                            className="inline-flex min-h-11 items-center rounded-xl border border-dbz-border px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:border-dbz-gold"
                          >
                            {e.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* --- Les contributeurs --- */}
      <section className="mt-14">
        <h2 className="flex items-center gap-2 font-saiyan text-2xl uppercase text-[var(--foreground)]">
          <Etincelle aria-hidden="true" className="h-5 w-5 text-dbz-orange" />{" "}
          <T k="wiki.contribuer.contributorsTitle" />
        </h2>
        {contributorsResult.status === "rejected" ? (
          <p className={styles.status}>
            <ContributionJourneyText name="contributorsUnavailable" />
          </p>
        ) : contributeurs.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-[var(--frame-on-surface-variant)]">
            <T k="wiki.contribuer.contributorsNone" />
          </p>
        ) : (
          <ol className="mt-6 grid gap-2 sm:grid-cols-2">
            {contributeurs.map((c, i) => (
              <li
                key={c.authorId}
                className="flex items-center justify-between gap-3 rounded-lg border border-dbz-border bg-dbz-card px-4 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-xs font-bold text-[var(--frame-on-surface-variant)]">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm text-[var(--foreground)]">{c.authorName}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--frame-on-surface-variant)]">
                  <T
                    k={
                      c.accepted > 1
                        ? "wiki.contribuer.contributionMany"
                        : "wiki.contribuer.contributionOne"
                    }
                    values={{ count: c.accepted }}
                  />
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div id="my-contributions" className="scroll-mt-24">
        <MesContributions />
      </div>

      {/* --- Les autres façons de participer ---
			    La page ne présentait qu'un seul geste (corriger un champ), alors que
			    deux autres existent désormais et n'avaient aucune porte d'entrée. */}
      <section className="mt-14">
        <h2 className="flex items-center gap-2 font-saiyan text-2xl uppercase text-[var(--foreground)]">
          <Etincelle aria-hidden="true" className="h-5 w-5 text-dbz-orange" />{" "}
          <T k="wiki.contribuer.participateTitle" />
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { href: "/wiki/characters", cle: "waysFix" },
            { href: "/news/feed/discussions", cle: "waysTalk" },
            { href: "/wiki/databooks", cle: "waysTranscribe" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex flex-col border border-white/[0.08] bg-dbz-card/80 p-4 rounded-xl transition-colors hover:border-dbz-gold"
            >
              <span className="font-display text-[15px] font-bold text-[var(--foreground)] group-hover:text-dbz-orange">
                <T k={`wiki.contribuer.${c.cle}Title`} />
              </span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-[var(--frame-on-surface-variant)]">
                <T k={`wiki.contribuer.${c.cle}Text`} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="mt-14 border-t border-white/8 pt-6 text-xs leading-relaxed text-[var(--frame-on-surface-variant)]">
        <T k="wiki.contribuer.footnote" />
      </p>
    </PageShell>
  );
}
