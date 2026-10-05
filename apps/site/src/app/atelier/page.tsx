import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { SectionHeading } from "@shenron/ui/layout/SectionHeading";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GatedLink } from "@/components/GatedLink";
import { AtelierNav, BibliothequeNav } from "@/components/bibliotheque/BibliothequeNav";
import { ContributeRail, StatTiles } from "@/components/kit";
import { T } from "@/components/T";
import { mangaUploadStatus, progressionTranscription } from "@/lib/databooks-transcription";
import { ogMeta } from "@/lib/og";

/**
 * L'atelier des planches, côté lecteur : où en sont la transcription et la traduction du
 * manga et des databooks, et comment une planche passe du scan japonais à la page française.
 *
 * Les chiffres viennent des MÊMES calculs que les outils staff (`progressionTranscription`,
 * `mangaUploadStatus`) : un seul compteur, jamais deux versions qui divergent. Page publique
 * et cacheable ; les onglets staff s'ajoutent côté client et leurs pages sont gardées par le
 * proxy.
 */
export const revalidate = 3600;

const title = "Transcription et traduction des planches Dragon Ball";
const description =
  "Où en est la transcription japonaise et la traduction française des planches du manga et des databooks Dragon Ball, et comment Koharu les prépare.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({ title, description, type: "website", canonical: "/atelier" }),
};

/** Part arrondie à l'entier, « — » quand le dénominateur est nul. */
const pourcentage = (part: number, total: number): string =>
  total > 0 ? `${Math.round((part / total) * 100)} %` : "—";

const ETAPES = [
  { cle: "scan", href: "/wiki/manga" },
  { cle: "transcription", href: "/wiki/databooks" },
  { cle: "traduction", href: "/wiki/databooks" },
  { cle: "koharu", href: "/koharu" },
] as const;

export default async function AtelierPage() {
  // En échec (base indisponible), la page s'affiche sans les compteurs.
  const [databooks, manga] = await Promise.all([
    progressionTranscription().catch(() => null),
    mangaUploadStatus().catch(() => null),
  ]);

  return (
    <PageShell rhythm="tight">
      <Breadcrumbs
        className="mb-4"
        items={[
          {
            label: "Transcription et traduction",
            display: <T k="bibliotheque.atelier.breadcrumb" />,
          },
        ]}
      />
      <PageHeader
        className="mb-6"
        eyebrow={<T k="bibliotheque.eyebrow" />}
        title={<T k="bibliotheque.atelier.title" />}
        subtitle={<T k="bibliotheque.atelier.lead" />}
      />
      <BibliothequeNav />
      <AtelierNav />

      {databooks && (
        <section aria-labelledby="atelier-databooks" className="mb-8 space-y-3">
          <SectionHeading
            id="atelier-databooks"
            level={2}
            title={<T k="bibliotheque.atelier.databooksTitle" />}
            actions={
              <GatedLink
                href="/wiki/databooks"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-white"
              >
                <T k="bibliotheque.atelier.readDatabooks" />
              </GatedLink>
            }
          />
          <StatTiles
            items={[
              { label: <T k="wiki.databooks.statWorks" />, value: databooks.total.fiches },
              {
                label: <T k="wiki.databooks.statPlates" />,
                value: databooks.total.planches,
                hint: <T k="wiki.databooks.statPlatesHint" />,
              },
              {
                label: <T k="wiki.databooks.statTranscribed" />,
                value: databooks.total.transcrites,
                hint: (
                  <T
                    k="wiki.databooks.statTranscribedHint"
                    values={{
                      percent: pourcentage(databooks.total.transcrites, databooks.total.planches),
                    }}
                  />
                ),
              },
              {
                label: <T k="wiki.databooks.statTranslated" />,
                value: databooks.total.traduites,
                hint: (
                  <T
                    k="wiki.databooks.statTranslatedHint"
                    values={{
                      percent: pourcentage(databooks.total.traduites, databooks.total.planches),
                    }}
                  />
                ),
              },
            ]}
          />
        </section>
      )}

      {manga && (
        <section aria-labelledby="atelier-manga" className="mb-10 space-y-3">
          <SectionHeading
            id="atelier-manga"
            level={2}
            title={<T k="bibliotheque.atelier.mangaTitle" />}
            actions={
              <Link
                href="/wiki/manga"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-white"
              >
                <T k="bibliotheque.atelier.readManga" />
              </Link>
            }
          />
          <StatTiles
            items={[
              {
                label: <T k="bibliotheque.atelier.mangaChapters" />,
                value: manga.chapitresAvecPages,
                hint: (
                  <T
                    k="bibliotheque.atelier.mangaChaptersHint"
                    values={{ total: manga.chapitres.toLocaleString("fr-FR") }}
                  />
                ),
              },
              { label: <T k="bibliotheque.atelier.mangaPlates" />, value: manga.planches },
              {
                label: <T k="bibliotheque.atelier.mangaTranscribed" />,
                value: manga.ocrPlanchesAvecTexte,
                hint: (
                  <T
                    k="wiki.databooks.statTranscribedHint"
                    values={{ percent: pourcentage(manga.ocrPlanchesAvecTexte, manga.planches) }}
                  />
                ),
              },
            ]}
          />
        </section>
      )}

      <section aria-labelledby="atelier-chaine" className="mb-10 space-y-4">
        <SectionHeading
          id="atelier-chaine"
          level={2}
          title={<T k="bibliotheque.atelier.chainTitle" />}
          standfirst={<T k="bibliotheque.atelier.chainLead" />}
        />
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((etape, index) => (
            <li key={etape.cle}>
              <GatedLink
                href={etape.href}
                className="flex h-full min-h-11 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-dbz-orange/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
              >
                <span className="font-display text-[12px] font-semibold uppercase tracking-wider text-dbz-orange">
                  {index + 1}. <T k={`bibliotheque.atelier.steps.${etape.cle}.label`} />
                </span>
                <span className="text-[14px] text-white/75">
                  <T k={`bibliotheque.atelier.steps.${etape.cle}.text`} />
                </span>
              </GatedLink>
            </li>
          ))}
        </ol>
      </section>

      <ContributeRail className="mt-14" quoiKey="kit.contribute.what.databookPlate" />
    </PageShell>
  );
}
