import { hasEditorialDatabase } from "@/lib/prerender";
import { notFound } from "next/navigation";
import Link from "next/link";
import { T } from "@/components/T";
import { GatedLink, GatedWrap } from "@/components/GatedLink";
import {
  WikiCanonicalFooter,
  type CanonicalFactEntry,
} from "@/components/wiki/WikiCanonicalFooter";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { WikiSectionsReader } from "@/components/wiki/WikiSectionsReader";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import { resolveMangaChapterHref } from "@/lib/wiki-internal-sources";
import { buildWikiContentPanels } from "@/lib/wiki-panels";
import { resolveCharacterSlugByName } from "@/lib/wiki-slugs";
import type { Metadata } from "next";

export const revalidate = 3600;

interface ItemDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const items = await dbUniverse.items();
  return (items ?? []).map((it) => ({ slug: it.slug }));
}

export async function generateMetadata({ params }: ItemDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await dbUniverse.itemBySlug(slug);
  if (!item) return {};

  return {
    title: `${item.name} · Objet Dragon Ball`,
    description: item.description,
    ...ogMeta({
      title: `${item.name} · Fiche Objet`,
      description: item.description,
      canonical: `/wiki/items/${slug}`,
      type: "article",
    }),
  };
}

export default async function ItemDetailPage({ params }: ItemDetailPageProps) {
  const { slug } = await params;
  const [item, allItems] = await Promise.all([dbUniverse.itemBySlug(slug), dbUniverse.items()]);
  if (!item) notFound();

  const sameCategory = (allItems ?? [])
    .filter((it) => it.category === item.category && it.slug !== item.slug)
    .slice(0, 4);

  const contentPanels = await buildWikiContentPanels({
    entityType: "item",
    entityId: item.id,
    article: item.article,
    description: item.description,
    articleTarget: { table: "db_items", rowId: item.id },
    fallbackHeading: "Présentation",
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
  if (item.creator) {
    canonicalFacts.push({
      key: "creator",
      label: <T k="wiki.techniqueDetail.fieldCreator" />,
      value: item.creator,
      href: creatorSlug ? `/wiki/characters/${creatorSlug}` : null,
    });
  }

  return (
    <WikiDetailPage
      entity={item.name}
      source="db_items"
      image={item.image}
      imageAlt={item.name}
      crumbs={[{ label: "Objets & Technologies", href: "/wiki/items" }, { label: item.name }]}
      edit={{ table: "db_items", id: item.id, indexHref: "/wiki/items", label: item.name }}
      header={
        <WikiEntityHeader
          name={item.name}
          nameJa={item.name_ja}
          nameRomaji={item.name_romaji}
          chips={
            <span className="font-saiyan text-xs tracking-[0.2em] uppercase text-dbz-orange">
              {`Objet · ${item.category}`}
            </span>
          }
        >
          {item.description && item.article && (
            <p className="max-w-3xl text-sm leading-relaxed text-white/75 sm:text-base">
              {item.description}
            </p>
          )}
        </WikiEntityHeader>
      }
      aside={
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
              <tr className="wiki-infobox-row">
                <th className="wiki-infobox-label">
                  <T k="wiki.techniqueDetail.fieldType" />
                </th>
                <td className="wiki-infobox-value font-medium capitalize text-dbz-orange">
                  {item.category}
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
                    className="font-mono text-xs text-dbz-blue-light hover:text-dbz-orange hover:underline transition-colors"
                  >
                    <T k="wiki.locationDetail.jumpToBottomSources" /> ↓
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    >
      <div className="space-y-8">
        {(item.slug.includes("dragon") || item.slug === "four-star-dragon-ball-memento") && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                🐉 Dragon Balls & Vœux Divins
              </span>
              <p className="text-sm text-white/90">
                Cet artéfact est directement lié à la quête sacrée des Dragon Balls et à
                l&apos;invocation des dragons divins.
              </p>
            </div>
            <GatedWrap
              href="/wiki/characters"
              className="rounded-lg bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0"
            >
              Consulter les Dragons →
            </GatedWrap>
          </div>
        )}

        {contentPanels.length > 1 ? (
          <WikiSectionsReader panels={contentPanels} />
        ) : contentPanels.length === 1 ? (
          contentPanels[0]!.node
        ) : null}

        {sameCategory.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h2 className="text-base font-bold uppercase tracking-wider text-orange-400">
              Dans la même catégorie ({item.category})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sameCategory.map((peer) => (
                <Link
                  key={peer.slug}
                  href={`/wiki/items/${peer.slug}`}
                  className="group min-h-11 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-orange-500/40 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                >
                  <div className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors">
                    {peer.name}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">
                    {peer.description}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <WikiCanonicalFooter
          facts={canonicalFacts}
          sources={item.article_sources}
          article={item.article}
        />
      </div>
    </WikiDetailPage>
  );
}
