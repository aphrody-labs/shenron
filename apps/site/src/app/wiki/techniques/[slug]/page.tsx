import { capParams, hasEditorialDatabase } from "@/lib/prerender";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { WikiFicheVide } from "@/components/wiki/WikiFicheVide";
import { WikiSectionsReader } from "@/components/wiki/WikiSectionsReader";
import { WikiSources } from "@/components/wiki/WikiArticle";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { getShenronTechnique, getShenronTechniques } from "@/lib/shenron";
import { assetUrl } from "@/lib/db-universe";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GatedWrap } from "@/components/GatedLink";
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
    title: `${tech.name} — Technique Dragon Ball`,
    description,
    ...ogMeta({
      title: `${tech.name} — DBFR`,
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
  const contentPanels = await buildWikiContentPanels({
    entityType: "technique",
    entityId: tech.id,
    article: tech.article,
    description: tech.description,
    fallbackHeading: "Présentation",
  });

  const decisiveBattlesBlock =
    tech.battles && tech.battles.length > 0 ? (
      <section className="wiki-content-card space-y-4">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-dbz-orange" />
        <div className="flex items-center gap-4">
          <h3 className="text-dbz-orange font-sans font-extrabold text-xl sm:text-2xl uppercase tracking-wider">
            <T
              k="wiki.techniqueDetail.decisiveBattlesHeading"
              values={{ count: tech.battles.length }}
            />
          </h3>
          <div className="h-0.5 flex-1 bg-gradient-to-r from-dbz-orange/50 to-transparent" />
        </div>
        <p className="text-sm text-white/70">
          <T k="wiki.techniqueDetail.decisiveBattlesLead" values={{ name: tech.name }} />
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tech.battles.map((b) => (
            <GatedWrap
              key={b.slug}
              href="/wiki/events"
              className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-orange-500/40 hover:bg-orange-500/[0.04] space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-orange-400">{b.series}</span>
                {b.winnerName && (
                  <span className="text-emerald-400 font-medium">🏆 {b.winnerName}</span>
                )}
              </div>
              <h4 className="font-bold text-white text-sm">{b.title}</h4>
              {b.climaxSummary && (
                <p className="text-xs text-white/60 line-clamp-2">{b.climaxSummary}</p>
              )}
            </GatedWrap>
          ))}
        </div>
      </section>
    ) : null;

  if (decisiveBattlesBlock) {
    if (contentPanels.length > 0) {
      const firstPanel = contentPanels[0]!;
      contentPanels[0] = {
        ...firstPanel,
        node: (
          <div className="space-y-6">
            {firstPanel.node}
            {decisiveBattlesBlock}
          </div>
        ),
      };
    } else {
      contentPanels.push({
        key: "presentation",
        label: "Présentation",
        accent: "orange",
        origine: "db",
        node: decisiveBattlesBlock,
      });
    }
  }

  // Fallback only when a fiche has neither article, description, nor battles:
  // canonical facts otherwise live permanently in the right-hand infobox.
  if (contentPanels.length === 0) {
    const reperesCanoniques = techniqueCanonicalFactsFallback(tech);
    if (reperesCanoniques) {
      contentPanels.push({
        key: "presentation",
        label: "Présentation",
        accent: "blue",
        origine: "db",
        node: <div className="wiki-content-card">{reperesCanoniques}</div>,
      });
    }
  }

  const otherPractitioners = (tech.practitioners ?? []).filter((p) => p.id !== tech.creatorId);
  const visiblePractitioners = otherPractitioners.slice(0, 8);
  const extraPractitionerCount = Math.max(
    0,
    otherPractitioners.length - visiblePractitioners.length,
  );

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
                {(tech.nameJa || tech.nameRomaji) && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldJapaneseName" />
                    </th>
                    <td className="wiki-infobox-value">
                      {tech.nameJa && (
                        <span className="block font-semibold text-white" lang="ja">
                          {tech.nameJa}
                        </span>
                      )}
                      {tech.nameRomaji && (
                        <span className="block text-xs text-white/60">{tech.nameRomaji}</span>
                      )}
                    </td>
                  </tr>
                )}
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
                          <Link
                            href={`/wiki/characters/${p.slug}`}
                            className="text-white/85 hover:text-dbz-orange hover:underline transition-colors"
                          >
                            {p.name}
                          </Link>
                        </span>
                      ))}
                      {extraPractitionerCount > 0 && (
                        <span className="text-white/50 text-xs"> (+{extraPractitionerCount})</span>
                      )}
                    </td>
                  </tr>
                )}
                {(tech.debutChapter || tech.debutEpisode) && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldFirstAppearance" />
                    </th>
                    <td className="wiki-infobox-value">
                      {tech.debutChapter ? (
                        <Link
                          href={`/wiki/manga/${tech.debutChapter.id}`}
                          className="group block text-dbz-blue-light hover:underline font-medium"
                        >
                          <span>
                            <T
                              k="wiki.techniqueDetail.chapterNumber"
                              values={{
                                number: tech.debutChapter.chapterNumber ?? tech.debutChapter.id,
                              }}
                            />
                          </span>
                          {tech.debutChapter.title && (
                            <span className="block text-xs font-normal text-white/55 group-hover:text-white/75">
                              {tech.debutChapter.title}
                            </span>
                          )}
                        </Link>
                      ) : tech.debutEpisode ? (
                        <span className="block text-white/85">
                          <T
                            k="wiki.techniqueDetail.episodeNumber"
                            values={{
                              number: tech.debutEpisode.numberInSeries ?? tech.debutEpisode.id,
                            }}
                          />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )}
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldIdentifier" />
                  </th>
                  <td className="wiki-infobox-value font-scouter text-white/70">#{tech.id}</td>
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
      {contentPanels.length > 1 ? (
        <div className="space-y-8">
          <WikiSectionsReader panels={contentPanels} />
          <WikiSources sources={tech.articleSources} />
        </div>
      ) : contentPanels.length === 1 ? (
        <div className="space-y-8">
          {contentPanels[0]!.node}
          <WikiSources sources={tech.articleSources} />
        </div>
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
    </WikiDetailPage>
  );
}

function techniqueCanonicalFactsFallback(tech: Awaited<ReturnType<typeof getShenronTechnique>>) {
  if (!tech) return null;
  const hasFacts = tech.nameJa || tech.nameRomaji || tech.debutChapter;
  if (!hasFacts) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(tech.nameJa || tech.nameRomaji) && (
        <div className="rounded-xl border border-dbz-blue/25 bg-dbz-blue/[0.06] p-4">
          <p className="font-scouter text-[10px] uppercase tracking-[0.16em] text-dbz-blue-light">
            <T k="wiki.techniqueDetail.fieldJapaneseName" />
          </p>
          <p className="mt-1 text-base font-semibold text-white" lang="ja">
            {tech.nameJa ?? "—"}
          </p>
          {tech.nameRomaji && <p className="mt-1 text-sm text-white/60">{tech.nameRomaji}</p>}
        </div>
      )}
      {tech.debutChapter && (
        <Link
          href={`/wiki/manga/${tech.debutChapter.id}`}
          className="group rounded-xl border border-dbz-blue/25 bg-dbz-blue/[0.06] p-4 transition-colors hover:border-dbz-blue/60 hover:bg-dbz-blue/[0.12]"
        >
          <p className="font-scouter text-[10px] uppercase tracking-[0.16em] text-dbz-blue-light">
            <T k="wiki.techniqueDetail.fieldFirstAppearance" />
          </p>
          <p className="mt-1 text-base font-semibold text-white group-hover:text-dbz-blue-light">
            <T
              k="wiki.techniqueDetail.chapterNumber"
              values={{ number: tech.debutChapter.chapterNumber ?? tech.debutChapter.id }}
            />
          </p>
          {tech.debutChapter.title && (
            <p className="mt-1 text-sm text-white/60">{tech.debutChapter.title}</p>
          )}
        </Link>
      )}
    </div>
  );
}
