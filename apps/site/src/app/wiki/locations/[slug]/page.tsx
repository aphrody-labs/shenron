import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Place, WithContext } from "schema-dts";
import { T } from "@/components/T";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import {
  WikiCanonicalFooter,
  type CanonicalFactEntry,
} from "@/components/wiki/WikiCanonicalFooter";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { WikiEmbeddedBattles } from "@/components/wiki/WikiEmbeddedBattles";
import { WikiFicheVide } from "@/components/wiki/WikiFicheVide";
import { WikiSectionsReader } from "@/components/wiki/WikiSectionsReader";
import { SITE_URL } from "@/lib/config";
import { assetUrl, dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import { capParams, hasEditorialDatabase } from "@/lib/prerender";
import { mergeArticleAndColumnEvents, resolveMangaChapterHref } from "@/lib/wiki-internal-sources";
import { buildWikiContentPanels } from "@/lib/wiki-panels";

export const revalidate = 3600;

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const locations = (await dbUniverse.locations()) ?? [];
  return capParams(
    locations.map((loc) => ({ slug: loc.slug })),
    200,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loc = await dbUniverse.locationBySlug(slug);
  if (!loc) notFound();

  return {
    title: `${loc.name} · Cosmologie & Lieux Dragon Ball`,
    description: loc.description,
    ...ogMeta({
      title: `${loc.name} · Dragon Ball FR`,
      description: loc.description,
      image: loc.image ? assetUrl(loc.image) : undefined,
      type: "article",
      canonical: `/wiki/locations/${slug}`,
    }),
  };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [loc, allLocations, allBattles] = await Promise.all([
    dbUniverse.locationBySlug(slug),
    dbUniverse.locations(),
    dbUniverse.battles(),
  ]);
  if (!loc) notFound();

  const locBattles = (allBattles ?? [])
    .filter((b) => {
      if (!b.location) return false;
      const lNorm = b.location.toLowerCase();
      const nameNorm = loc.name.toLowerCase();
      const planetNorm = (loc.planet ?? "").toLowerCase();
      return (
        lNorm.includes(nameNorm) ||
        nameNorm.includes(lNorm) ||
        (planetNorm.length >= 4 &&
          planetNorm !== "terre" &&
          planetNorm !== "autre monde" &&
          lNorm.includes(planetNorm))
      );
    })
    .map((b) => ({
      slug: b.slug,
      title: b.title,
      titleJa: b.title_ja,
      series: b.series,
      winnerName: b.winner_name,
      climaxSummary: b.climax_summary,
      location: b.location,
    }));

  const resolvedEvents = mergeArticleAndColumnEvents(loc.article, loc.key_events);
  const embeddedChroniclesAndBattles = (
    <WikiEmbeddedBattles
      events={resolvedEvents}
      battles={locBattles}
      subjectName={loc.name}
      mode="location"
    />
  );

  const contentPanels = await buildWikiContentPanels({
    entityType: "location",
    entityId: loc.id,
    article: loc.article,
    description: loc.description,
    articleTarget: { table: "db_locations", rowId: loc.id },
    fallbackHeading: "Présentation",
    firstPanelExtra: embeddedChroniclesAndBattles,
  });

  const peerLocations = (allLocations ?? [])
    .filter((peer) => peer.slug !== loc.slug && peer.realm_type === loc.realm_type)
    .slice(0, 6);

  const debutMangaHref = resolveMangaChapterHref(loc.debut_chapter);

  const canonicalFacts: CanonicalFactEntry[] = [];
  if (loc.name_ja || loc.name_romaji) {
    canonicalFacts.push({
      key: "name-ja",
      label: <T k="wiki.locationDetail.fieldJapaneseName" />,
      value: <span lang="ja">{loc.name_ja ?? loc.name_romaji}</span>,
      subvalue: loc.name_ja && loc.name_romaji ? loc.name_romaji : undefined,
    });
  }
  canonicalFacts.push({
    key: "realm",
    label: <T k="wiki.locationDetail.fieldRealm" />,
    value: loc.realm_type,
    subvalue: loc.planet ?? undefined,
    href: "/wiki/locations#cosmologie",
  });
  if (loc.debut_chapter) {
    canonicalFacts.push({
      key: "debut-manga",
      label: <T k="wiki.locationDetail.fieldDebutManga" />,
      value: loc.debut_chapter,
      href: debutMangaHref,
    });
  }
  if (loc.debut_episode) {
    canonicalFacts.push({
      key: "debut-anime",
      label: <T k="wiki.locationDetail.fieldDebutAnime" />,
      value: loc.debut_episode,
    });
  }

  const jsonLdData: WithContext<Place> = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: loc.name,
    description: loc.description,
    image: loc.image ? assetUrl(loc.image) : undefined,
    url: `${SITE_URL}/wiki/locations/${loc.slug}`,
  };

  return (
    <WikiDetailPage
      entity={loc.name}
      source="db_locations"
      jsonLd={jsonLdData}
      image={loc.image}
      imageAlt={loc.name}
      crumbs={[
        {
          label: "Cosmologie & Lieux",
          display: <T k="wiki.locationsHub.crumb" />,
          href: "/wiki/locations",
        },
        { label: loc.name },
      ]}
      edit={{ table: "db_locations", id: loc.id, indexHref: "/wiki/locations", label: loc.name }}
      contributeKey="kit.contribute.what.place"
      header={
        <WikiEntityHeader
          name={loc.name}
          nameJa={loc.name_ja}
          nameRomaji={loc.name_romaji}
          chips={
            <>
              <span className="font-scouter rounded border border-dbz-orange/50 bg-dbz-orange/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-dbz-orange">
                {loc.realm_type}
              </span>
              {loc.planet && (
                <span className="rounded border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/75">
                  {loc.planet}
                </span>
              )}
            </>
          }
        >
          {loc.description && (
            <p className="max-w-3xl text-sm leading-relaxed text-white/75 sm:text-base">
              {loc.description}
            </p>
          )}
        </WikiEntityHeader>
      }
      aside={
        <>
          <div className="wiki-infobox">
            <div className="wiki-infobox-header">
              <T k="wiki.locationDetail.infoboxHeader" />
            </div>
            <table className="w-full text-left text-xs sm:text-sm">
              <tbody>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.locationDetail.fieldName" />
                  </th>
                  <td className="wiki-infobox-value font-semibold text-white">{loc.name}</td>
                </tr>
                {(loc.name_ja || loc.name_romaji) && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.locationDetail.fieldJapaneseName" />
                    </th>
                    <td className="wiki-infobox-value">
                      {loc.name_ja && (
                        <span lang="ja" className="block font-semibold text-white">
                          {loc.name_ja}
                        </span>
                      )}
                      {loc.name_romaji && (
                        <span className="block text-xs text-white/60">{loc.name_romaji}</span>
                      )}
                    </td>
                  </tr>
                )}
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.locationDetail.fieldRealm" />
                  </th>
                  <td className="wiki-infobox-value font-semibold text-dbz-orange">
                    {loc.realm_type}
                  </td>
                </tr>
                {loc.planet && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.locationDetail.fieldSectorOrPlanet" />
                    </th>
                    <td className="wiki-infobox-value text-white/85">{loc.planet}</td>
                  </tr>
                )}
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

          {peerLocations.length > 0 && (
            <div className="wiki-content-card space-y-3">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-dbz-orange">
                <T k="wiki.locationDetail.sameRealmHeading" />
              </h3>
              <ul className="space-y-1.5">
                {peerLocations.map((peer) => (
                  <li key={peer.slug}>
                    <Link
                      href={`/wiki/locations/${peer.slug}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs font-medium text-white/85 transition-colors hover:border-dbz-orange/50 hover:text-dbz-orange"
                    >
                      <span className="truncate">{peer.name}</span>
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ul>
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
              table="db_locations"
              rowId={loc.id}
              label={loc.name}
              quoi="sa situation cosmologique, ses règles et les événements qui s'y déroulent"
            />
          </div>
        )}

        <WikiCanonicalFooter
          facts={canonicalFacts}
          sources={loc.article_sources}
          article={loc.article}
        />

        <EntityParticipation
          kind="wiki"
          table="db_locations"
          id={loc.id}
          path={`/wiki/locations/${loc.slug}`}
          label={loc.name}
        />
      </div>
    </WikiDetailPage>
  );
}
