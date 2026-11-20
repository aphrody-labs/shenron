// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GatedLink } from "@/components/GatedLink";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { T } from "@/components/T";
import {
  WikiCanonicalFooter,
  type CanonicalFactEntry,
} from "@/components/wiki/WikiCanonicalFooter";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { WikiEmbeddedBattles } from "@/components/wiki/WikiEmbeddedBattles";
import { WikiFicheVide } from "@/components/wiki/WikiFicheVide";
import { WikiSectionsReader } from "@/components/wiki/WikiSectionsReader";
import { assetUrl, dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import { capParams, hasEditorialDatabase } from "@/lib/prerender";
import { mergeArticleAndColumnEvents, resolveMangaChapterHref } from "@/lib/wiki-internal-sources";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { resolveCharacterSlugByName } from "@/lib/wiki-slugs";

export const revalidate = 3600;

interface ItemDetailPageProps {
  params: Promise<{ slug: string }>;
}

const CATEGORY_KEY_MAP: Record<string, string> = {
  relique_magique: "wiki.itemDetail.categories.relique_magique",
  technologie: "wiki.itemDetail.categories.technologie",
  vehicule: "wiki.itemDetail.categories.vehicule",
  armement: "wiki.itemDetail.categories.armement",
  medical: "wiki.itemDetail.categories.medical",
};

function renderCategoryLabel(category: string) {
  const key = CATEGORY_KEY_MAP[category];
  return key ? <T k={key} /> : category;
}

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const items = (await dbUniverse.items()) ?? [];
  return capParams(
    items.map((it) => ({ slug: it.slug })),
    200,
  );
}

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await dbUniverse.itemBySlug(slug);
  if (!item) return {};

  return {
    title: `${item.name} · Objets & Véhicules Dragon Ball`,
    description: item.description,
    ...ogMeta({
      title: `${item.name} · Dragon Ball FR`,
      description: item.description,
      image: item.image ? assetUrl(item.image) : undefined,
      canonical: `/wiki/items/${slug}`,
      type: "article",
    }),
  };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { slug } = await params;
  const [item, allItems] = await Promise.all([dbUniverse.itemBySlug(slug), dbUniverse.items()]);
  if (!item) notFound();

  const peerItems = (allItems ?? [])
    .filter((it) => it.category === item.category && it.slug !== item.slug)
    .slice(0, 6);

  const resolvedEvents = mergeArticleAndColumnEvents(item.article, null);
  const embeddedChronicles = (
    <WikiEmbeddedBattles events={resolvedEvents} subjectName={item.name} mode="location" />
  );

  const contentPanels = await buildWikiContentPanels({
    entityType: "item",
    entityId: item.id,
    article: item.article,
    description: item.description,
    preferArticle: true,
    articleTarget: { table: "db_items", rowId: item.id },
    fallbackHeading: "Présentation",
    firstPanelExtra: embeddedChronicles,
  });

  const creatorSlug = item.creator ? resolveCharacterSlugByName(item.creator) : null;
  const debutMangaHref = resolveMangaChapterHref(item.debut_chapter);

  const canonicalFacts: CanonicalFactEntry[] = [];
  if (item.name_ja || item.name_romaji) {
    canonicalFacts.push({
      key: "name-ja",
      label: <T k="wiki.techniqueDetail.fieldJapaneseName" />,
      value: <span lang="ja">{item.name_ja ?? item.name_romaji}</span>,
      subvalue: item.name_ja && item.name_romaji ? item.name_romaji : undefined,
    });
  }
  canonicalFacts.push({
    key: "category",
    label: <T k="wiki.techniqueDetail.fieldType" />,
    value: renderCategoryLabel(item.category),
    href: "/wiki/items#arsenal-et-technologies",
  });
  if (item.creator) {
    canonicalFacts.push({
      key: "creator",
      label: <T k="wiki.techniqueDetail.fieldCreator" />,
      value: item.creator,
      href: creatorSlug ? `/wiki/characters/${creatorSlug}` : null,
    });
  }
  if (item.debut_chapter) {
    canonicalFacts.push({
      key: "debut-manga",
      label: <T k="wiki.locationDetail.fieldDebutManga" />,
      value: item.debut_chapter,
      href: debutMangaHref,
    });
  }
  if (item.debut_episode) {
    canonicalFacts.push({
      key: "debut-anime",
      label: <T k="wiki.locationDetail.fieldDebutAnime" />,
      value: item.debut_episode,
    });
  }

  return (
    <WikiDetailPage
      entity={item.name}
      source="db_items"
      image={item.image}
      imageAlt={item.name}
      crumbs={[
        {
          label: "Objets, Véhicules & Technologies",
          display: <T k="wiki.itemsHub.crumb" />,
          href: "/wiki/items",
        },
        { label: item.name },
      ]}
      edit={{ table: "db_items", id: item.id, indexHref: "/wiki/items", label: item.name }}
      header={
        <WikiEntityHeader
          name={item.name}
          nameJa={item.name_ja}
          nameRomaji={item.name_romaji}
          chips={
            <span className="font-saiyan text-xs uppercase tracking-[0.2em] text-dbz-orange">
              {renderCategoryLabel(item.category)}
            </span>
          }
        >
          {item.description && (
            <p className="max-w-3xl text-sm leading-relaxed text-white/75 sm:text-base">
              {item.description}
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
            <table className="w-full text-left text-xs sm:text-sm">
              <tbody>
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldName" />
                  </th>
                  <td className="wiki-infobox-value font-semibold text-white">{item.name}</td>
                </tr>
                {(item.name_ja || item.name_romaji) && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldJapaneseName" />
                    </th>
                    <td className="wiki-infobox-value">
                      {item.name_ja && (
                        <span lang="ja" className="block font-semibold text-white">
                          {item.name_ja}
                        </span>
                      )}
                      {item.name_romaji && (
                        <span className="block text-xs text-white/60">{item.name_romaji}</span>
                      )}
                    </td>
                  </tr>
                )}
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.techniqueDetail.fieldType" />
                  </th>
                  <td className="wiki-infobox-value font-semibold text-dbz-orange">
                    {renderCategoryLabel(item.category)}
                  </td>
                </tr>
                {item.creator && (
                  <tr className="wiki-infobox-row">
                    <th className="wiki-infobox-label">
                      <T k="wiki.techniqueDetail.fieldCreator" />
                    </th>
                    <td className="wiki-infobox-value">
                      {creatorSlug ? (
                        <GatedLink
                          href={`/wiki/characters/${creatorSlug}`}
                          className="font-medium text-dbz-orange hover:underline"
                        >
                          {item.creator}
                        </GatedLink>
                      ) : (
                        <span className="text-white/85">{item.creator}</span>
                      )}
                    </td>
                  </tr>
                )}
                <tr className="wiki-infobox-row">
                  <th className="wiki-infobox-label">
                    <T k="wiki.locationDetail.fieldSourcesJump" />
                  </th>
                  <td className="wiki-infobox-value">
                    <a
                      href="#sources-canoniques"
                      className="font-mono text-xs text-dbz-blue-light transition-colors hover:text-dbz-orange hover:underline"
                    >
                      <T k="wiki.locationDetail.jumpToBottomSources" /> ↓
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {peerItems.length > 0 && (
            <div className="wiki-content-card space-y-3">
              <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-dbz-orange">
                <T k="wiki.itemDetail.sameCategoryHeading" />
              </h3>
              <ul className="space-y-1.5">
                {peerItems.map((peer) => (
                  <li key={peer.slug}>
                    <Link
                      href={`/wiki/items/${peer.slug}`}
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
              table="db_items"
              rowId={item.id}
              label={item.name}
              quoi="son fonctionnement, ses variantes et ses apparitions"
            />
          </div>
        )}

        <WikiCanonicalFooter
          facts={canonicalFacts}
          sources={item.article_sources}
          article={item.article}
        />

        <EntityParticipation
          kind="wiki"
          table="db_items"
          id={item.id}
          path={`/wiki/items/${item.slug}`}
          label={item.name}
        />
      </div>
    </WikiDetailPage>
  );
}
