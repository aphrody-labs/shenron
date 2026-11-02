// Keep the index loader scoped to the catalogue, not streamed detail routes.
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { GatedLink } from "@/components/GatedLink";
import { PageBanner } from "@/components/media/PageBanner";
import { EditorialTabs } from "@/components/databooks/EditorialTabs";
import { T } from "@/components/T";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { pageHero } from "@/lib/banner-config";
import { DatabookGrid } from "@/components/databooks/DatabookGrid";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { ContinueRail } from "@/components/history/ContinueRail";
import { progressionTranscription } from "@/lib/databooks-transcription";
import { DomainBar, StatTiles, ContributeRail } from "@/components/kit";

import { ogMeta } from "@/lib/og";
import { LibraryNav } from "@/components/library/LibraryNav";
import { publicDatabookImage } from "@/lib/databook-media";
import { isToriyamaInterviewBook } from "@/lib/toriyama-words";

/** Part arrondie à l'entier, « — » quand le dénominateur est nul. */
const pourcentage = (part: number, total: number): string =>
  total > 0 ? `${Math.round((part / total) * 100)} %` : "—";

export const revalidate = 3600;

const title = "Databooks Dragon Ball";
const description =
  "Guides officiels, artbooks et daizenshuu Dragon Ball, séparés des interviews et des paroles d'Akira Toriyama.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({
    title: "Databooks Dragon Ball — DBFR",
    description,
    type: "website",
    canonical: "/wiki/databooks",
  }),
};

export default async function DatabooksIndexPage() {
  // `access` : la grille est un composant client et ne peut pas lire la
  // configuration de lancement ; on la résout ici et on la lui passe.
  const [data, access, progression] = await Promise.all([
    dbUniverse.databooks({ order: "desc" }),
    getLaunchConfig().catch(() => null),
    // La couverture de transcription vient du MÊME calcul que l'écran
    // d'administration : un seul chiffre, pas deux versions qui divergent.
    // En échec (base indisponible), la page s'affiche sans les compteurs.
    progressionTranscription().catch(() => null),
  ]);
  const items = (data?.items ?? [])
    .filter((d) => {
      if (d.kind === "interview") return false;
      if (d.category === "Interview") return false;
      if (isToriyamaInterviewBook(d)) return false;
      return true;
    })
    .map((d) => ({
      id: d.id,
      kind: d.kind,
      category: d.category ?? null,
      title: d.title,
      titleJa: d.title_ja,
      author: d.author,
      publishedAt: d.published_at,
      // Chemin brut : DatabookGrid / WikiImg résolvent via assetUrl (évite
      // double-préfixe et permet le repli placeholder si cover 404).
      cover: publicDatabookImage(d.cover),
      pageCount: d.pages.filter((page) =>
        Boolean(publicDatabookImage(page.image) || page.text?.trim()),
      ).length,
      hasDescription: Boolean(d.description?.trim()),
    }));

  // Bannière fixe plutôt que la couverture du dernier ouvrage entré : une
  // jaquette portrait étirée sur 1920 px de large sortait floue, et le hero
  // changeait de visage à chaque nouveau V-Jump ingéré.
  const heroImage = await pageHero("databooks");

  return (
    <PageShell rhythm="tight">
      {/* Pont staff → pilotage des campagnes de traduction, sans repasser par la sidebar
          d’administration. Invisible pour les visiteurs. */}
      <DomainBar
        domain="databooks"
        className="mb-6"
        actions={[
          { href: "/workshop/transcription", label: "Transcription & arbitrage" },
          { href: "/workshop/translation", label: "Traduction & campagnes" },
        ]}
      />
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Databooks", display: <T k="wiki.databooks.breadcrumb" /> }]}
      />
      <PageHeader
        art="ki"
        className="mb-6"
        eyebrow={<T k="wiki.databooks.eyebrow" />}
        title={<T k="wiki.databooks.title" />}
        subtitle={
          // Un nombre vérifiable plutôt qu’une promesse d’ambiance (règle 18) ;
          // catalogue vide, le compteur disparaît au lieu d’afficher un zéro.
          items.length > 0 ? (
            <T
              k="wiki.databooks.leadCount"
              values={{ count: items.length.toLocaleString("fr-FR") }}
            />
          ) : (
            <T k="wiki.databooks.lead" />
          )
        }
      />
      <LibraryNav className="mb-3" />
      <EditorialTabs active="/wiki/databooks" className="mb-6" />
      <PageBanner src={heroImage} alt="Databooks Dragon Ball" />

      {/* Couverture réelle de la transcription : elle dit au lecteur ce qu’il peut espérer
          trouver — et ce qui reste à faire. Mesurée, jamais arrondie à la hausse. */}
      {progression && (
        <StatTiles
          className="mb-6"
          items={[
            { label: <T k="wiki.databooks.statWorks" />, value: progression.total.fiches },
            {
              label: <T k="wiki.databooks.statPlates" />,
              value: progression.total.planches,
              hint: <T k="wiki.databooks.statPlatesHint" />,
            },
            {
              label: <T k="wiki.databooks.statTranscribed" />,
              value: progression.total.transcrites,
              hint: (
                <T
                  k="wiki.databooks.statTranscribedHint"
                  values={{
                    percent: pourcentage(progression.total.transcrites, progression.total.planches),
                  }}
                />
              ),
            },
            {
              label: <T k="wiki.databooks.statTranslated" />,
              value: progression.total.traduites,
              hint: (
                <T
                  k="wiki.databooks.statTranslatedHint"
                  values={{
                    percent: pourcentage(progression.total.traduites, progression.total.planches),
                  }}
                />
              ),
            },
          ]}
        />
      )}

      {/* Les ouvrages restent séparés des interviews et de la page auteur. */}
      <p className="mb-8 text-[14px] text-white/60">
        <GatedLink
          href="/wiki/interviews"
          className="inline-flex min-h-11 items-center text-dbz-orange underline-offset-4 hover:underline"
        >
          <T k="wiki.databooks.toriyamaLink" />
        </GatedLink>{" "}
        <T k="wiki.databooks.toriyamaAfter" />
      </p>

      <ContinueRail kinds={["databook"]} titleKey="history.resumeBook" />
      <DatabookGrid items={items} access={access} />
      <ContributeRail className="mt-14" quoiKey="kit.contribute.what.databookPlate" />
    </PageShell>
  );
}
