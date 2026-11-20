import { capParams, hasEditorialDatabase } from "@/lib/prerender";
import {
  WikiCanonicalFooter,
  type CanonicalFactEntry,
} from "@/components/wiki/WikiCanonicalFooter";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { WikiEmbeddedBattles } from "@/components/wiki/WikiEmbeddedBattles";
import { WikiFicheVide } from "@/components/wiki/WikiFicheVide";
import { WikiSectionsReader } from "@/components/wiki/WikiSectionsReader";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { getShenronTechnique, getShenronTechniques } from "@/lib/shenron";
import { assetUrl } from "@/lib/db-universe";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GatedLink } from "@/components/GatedLink";
import { T } from "@/components/T";
import type { Metadata } from "next";
import {
  NOTE_PROVENANCE,
  estTypeDeJeu,
  libelleType,
} from "@aphrody/shenron-config/techniques-types";
import type { DefinedTerm, WithContext } from "schema-dts";
import { SITE_URL } from "@/lib/config";
import { ogMeta } from "@/lib/og";
import { TechniqueArtworkPanel } from "@/components/wiki/TechniqueArtworkPanel";
import { resolveTechniqueArtwork } from "@/lib/technique-artwork";

export const revalidate = 3600;

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const list = await getShenronTechniques();
  return capParams(
    list.map((t) => ({ slug: t.slug })),
    300,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tech = await getShenronTechnique(slug);
  if (!tech) notFound();
  const description = tech.description ?? `Fiche détaillée de la technique ${tech.name}.`;
  const bestImage = resolveTechniqueArtwork(tech)?.image;
  return {
    title: `${tech.name} · Technique Dragon Ball`,
    description,
    ...ogMeta({
      title: `${tech.name} · DBFR`,
      description,
      image: bestImage ? assetUrl(bestImage) : undefined,
      canonical: `/wiki/techniques/${slug}`,
    }),
  };
}

export default async function TechniqueDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tech = await getShenronTechnique(slug);
  if (!tech) notFound();
  const artwork = resolveTechniqueArtwork(tech);

  const embeddedBattles =
    tech.battles && tech.battles.length > 0 ? (
      <WikiEmbeddedBattles battles={tech.battles} subjectName={tech.name} mode="entity" />
    ) : null;

  const contentPanels = await buildWikiContentPanels({
    entityType: "technique",
    entityId: tech.id,
    article: tech.article,
    description: tech.description,
    fallbackHeading: "Présentation",
    firstPanelExtra: embeddedBattles,
  });

  if (contentPanels.length === 0 && embeddedBattles) {
    contentPanels.push({
      key: "presentation",
      label: "Présentation",
      accent: "orange",
      origine: "db",
      node: <div className="wiki-content-card">{embeddedBattles}</div>,
    });
  }

  const otherPractitioners = (tech.practitioners ?? []).filter((p) => p.id !== tech.creatorId);
  const visiblePractitioners = otherPractitioners.slice(0, 8);
  const extraPractitionerCount = Math.max(
    0,
    otherPractitioners.length - visiblePractitioners.length,
  );

  // `Repères canoniques` & `Sources` consolidés en pied de page (100 % internes à DBFR).
  const canonicalFacts: CanonicalFactEntry[] = [];
  if (tech.nameJa || tech.nameRomaji) {
    canonicalFacts.push({
      key: "name-ja",
      label: <T k="wiki.techniqueDetail.fieldJapaneseName" />,
      value: <span lang="ja">{tech.nameJa ?? tech.nameRomaji}</span>,
      subvalue: tech.nameJa && tech.nameRomaji ? tech.nameRomaji : undefined,
    });
  }
  if (tech.debutChapter) {
    canonicalFacts.push({
      key: "debut-chapter",
      label: <T k="wiki.techniqueDetail.fieldFirstAppearance" />,
      value: (
        <T
          k="wiki.techniqueDetail.chapterNumber"
          values={{ number: tech.debutChapter.chapterNumber ?? tech.debutChapter.id }}
        />
      ),
      subvalue: tech.debutChapter.title ?? undefined,
      href: `/wiki/manga/${tech.debutChapter.id}`,
    });
  } else if (tech.debutEpisode) {
    canonicalFacts.push({
      key: "debut-episode",
      label: <T k="wiki.techniqueDetail.fieldFirstAppearance" />,
      value: (
        <T
          k="wiki.techniqueDetail.episodeNumber"
          values={{ number: tech.debutEpisode.numberInSeries ?? tech.debutEpisode.id }}
        />
      ),
      subvalue: tech.debutEpisode.title ?? undefined,
      href: `/wiki/episodes/${tech.debutEpisode.id}`,
    });
  }
  if (tech.creatorName) {
    canonicalFacts.push({
      key: "creator",
      label: <T k="wiki.techniqueDetail.fieldCreator" />,
      value: tech.creatorName,
      href: tech.creatorSlug
        ? `/wiki/characters/${tech.creatorSlug}`
        : tech.creatorId
          ? `/wiki/characters/${tech.creatorId}`
          : null,
    });
  }

  const jsonLdData: WithContext<DefinedTerm> = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: tech.name,
    description: tech.description ?? undefined,
    termCode: String(tech.id),
    inDefinedTermSet: `${SITE_URL}/wiki/techniques`,
  };

  return (
    <WikiDetailPage
      entity={tech.name}
      source="db_techniques"
      jsonLd={jsonLdData}
      crumbs={[
        {
          label: "Techniques",
          display: <T k="wiki.techniqueDetail.crumbTechniques" />,
          href: "/wiki/techniques",
        },
        { label: tech.name },
      ]}
      edit={{
        table: "db_techniques",
        id: tech.id,
        indexHref: "/wiki/techniques",
        label: tech.name,
      }}
      header={
        <WikiEntityHeader
          name={tech.name}
          nameJa={tech.nameJa}
          nameRomaji={tech.nameRomaji}
          chips={
            <>
              <span className="font-scouter text-xs uppercase tracking-widest px-3 py-1 rounded bg-black/60 border border-dbz-blue/40 text-dbz-blue-light shadow-[2px_2px_0px_#000]">
                TECH #{tech.id}
              </span>
              <span className="font-saiyan text-xs uppercase tracking-widest px-3 py-1 rounded bg-dbz-orange/20 border border-dbz-orange/50 text-dbz-orange shadow-[2px_2px_0px_#000]">
                {libelleType(tech.type)}
              </span>
            </>
          }
        >
          {tech.creatorName && (
            <p className="text-base sm:text-lg text-white/80 font-medium">
              <T k="wiki.techniqueDetail.creatorOrUser" />{" "}
              <Link
                href={
                  tech.creatorSlug
                    ? `/wiki/characters/${tech.creatorSlug}`
                    : tech.creatorId
                      ? `/wiki/characters/${tech.creatorId}`
                      : "#"
                }
                className="text-dbz-orange font-semibold underline-offset-4 hover:underline hover:text-dbz-yellow transition-colors"
              >
                {tech.creatorName}
              </Link>
            </p>
          )}
        </WikiEntityHeader>
      }
      aside={
        <>
          <div className="wiki-infobox">
            <div className="wiki-infobox-header">
              <T k="wiki.techniqueDetail.infoboxHeader" />
            </div>
            <TechniqueArtworkPanel name={tech.name} artwork={artwork} />
            <table className="w-full text-left text-xs sm:text-sm">
              <tbody>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldName" />
                  </th>
                  <td className="wiki-infobox-value font-semibold text-white">{tech.name}</td>
                </tr>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldType" />
                  </th>
                  <td className="wiki-infobox-value text-dbz-orange font-medium">
                    {libelleType(tech.type)}
                  </td>
                </tr>
                {tech.creatorName && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldCreator" />
                    </th>
                    <td className="wiki-infobox-value">
                      <Link
                        href={
                          tech.creatorSlug
                            ? `/wiki/characters/${tech.creatorSlug}`
                            : tech.creatorId
                              ? `/wiki/characters/${tech.creatorId}`
                              : "#"
                        }
                        className="text-dbz-orange hover:underline font-medium"
                      >
                        {tech.creatorName}
                      </Link>
                    </td>
                  </tr>
                )}
                {visiblePractitioners.length > 0 && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldPractitioners" />
                    </th>
                    <td className="wiki-infobox-value leading-relaxed">
                      {visiblePractitioners.map((p, idx) => (
                        <span key={p.id}>
                          {idx > 0 && <span className="text-white/35"> · </span>}
                          <GatedLink
                            href={`/wiki/characters/${p.slug}`}
                            className="text-white/85 hover:text-dbz-orange hover:underline transition-colors"
                          >
                            {p.name}
                          </GatedLink>
                        </span>
                      ))}
                      {extraPractitionerCount > 0 && (
                        <span className="text-white/50 text-xs"> (+{extraPractitionerCount})</span>
                      )}
                    </td>
                  </tr>
                )}
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldIdentifier" />
                  </th>
                  <td className="wiki-infobox-value font-scouter text-white/70">#{tech.id}</td>
                </tr>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.locationDetail.fieldSourcesJump" />
                  </th>
                  <td className="wiki-infobox-value">
                    <a
                      href="#sources-canoniques"
                      className="font-mono text-xs text-dbz-blue-light hover:text-dbz-orange hover:underline transition-colors"
                    >
                      <T k="wiki.locationDetail.jumpToBottomSources" /> ↓
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {estTypeDeJeu(tech.type) && (
            <div className="wiki-content-card text-xs text-white/60 leading-relaxed space-y-2">
              <p className="font-saiyan text-dbz-yellow tracking-wider uppercase text-[11px]">
                <T k="wiki.techniqueDetail.gameCanonNoteHeading" />
              </p>
              <p>{NOTE_PROVENANCE}</p>
            </div>
          )}
        </>
      }
    >
      <div className="space-y-8">
        {contentPanels.length > 1 ? (
          <WikiSectionsReader panels={contentPanels} />
        ) : contentPanels.length === 1 ? (
          contentPanels[0]!.node
        ) : (
          <div className="wiki-content-card">
            <WikiFicheVide
              table="db_techniques"
              rowId={tech.id}
              label={tech.name}
              quoi="qui l'emploie, comment elle fonctionne et dans quelle planche elle apparaît"
            />
          </div>
        )}

        <WikiCanonicalFooter
          facts={canonicalFacts}
          sources={tech.articleSources}
          article={tech.article}
        />
      </div>
    </WikiDetailPage>
  );
}
