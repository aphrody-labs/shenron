import { hasEditorialDatabase } from "@/lib/prerender";
import { notFound } from "next/navigation";
import Link from "next/link";
import { GatedLink, GatedWrap } from "@/components/GatedLink";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { dbUniverse } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
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
    title: `${item.name} — Objet Dragon Ball`,
    description: item.description,
    ...ogMeta({
      title: `${item.name} — Fiche Objet`,
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

  return (
    <WikiDetailPage
      entity={item.name}
      source="db_items"
      crumbs={[{ label: "Objets & Technologies", href: "/wiki/items" }, { label: item.name }]}
      edit={{ table: "db_items", id: item.id, indexHref: "/wiki/items", label: item.name }}
      header={
        <WikiEntityHeader
          name={item.name}
          nameJa={item.name_ja}
          nameRomaji={item.name_romaji}
          chips={
            <span className="font-saiyan text-xs tracking-[0.2em] uppercase text-dbz-orange">
              {`Objet • ${item.category}`}
            </span>
          }
        />
      }
      aside={
        <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white/50">
            Fiche Technique
          </h3>

          {item.name_ja && (
            <div>
              <div className="text-xs text-white/60">Nom Japonais</div>
              <div className="text-sm font-mono text-white/90">{item.name_ja}</div>
            </div>
          )}

          {item.name_romaji && (
            <div>
              <div className="text-xs text-white/60">Romaji Hepburn</div>
              <div className="text-sm text-white/80">{item.name_romaji}</div>
            </div>
          )}

          <div>
            <div className="text-xs text-white/60">Catégorie</div>
            <div className="text-sm font-medium text-orange-300 capitalize">{item.category}</div>
          </div>

          {item.creator && (
            <div>
              <div className="text-xs text-white/60">Concepteur / Origine</div>
              {(() => {
                const creatorSlug = resolveCharacterSlugByName(item.creator);
                return creatorSlug ? (
                  <GatedLink
                    href={`/wiki/characters/${creatorSlug}`}
                    className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white transition-colors hover:text-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
                  >
                    <span>{item.creator}</span>
                    <span className="text-white/40 text-xs">↗</span>
                  </GatedLink>
                ) : (
                  <div className="text-sm font-semibold text-white">{item.creator}</div>
                );
              })()}
            </div>
          )}

          {item.debut_chapter && (
            <div>
              <div className="text-xs text-white/60">Première Apparition Manga</div>
              <div className="text-sm text-white">{item.debut_chapter}</div>
            </div>
          )}

          {item.debut_episode && (
            <div>
              <div className="text-xs text-white/60">Première Apparition Animée</div>
              <div className="text-sm text-white">{item.debut_episode}</div>
            </div>
          )}
        </div>
      }
    >
      {/* Encart Dragon Balls si pertinent */}
      {(item.slug.includes("dragon") || item.slug === "four-star-dragon-ball-memento") && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              🐉 Dragon Balls & Vœux Divins
            </span>
            <p className="text-sm text-white/90">
              Cet artéfact est directement lié à la quête sacrée des Dragon Balls et à l'invocation
              des dragons divins.
            </p>
          </div>
          <GatedWrap
            href="/wiki/dragons"
            className="rounded-lg bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-colors shrink-0"
          >
            Consulter les Dragons & Vœux →
          </GatedWrap>
        </div>
      )}

      <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 backdrop-blur-md">
        <h2 className="mb-3 text-base font-semibold uppercase tracking-wider text-orange-400">
          Description & Fonctionnement
        </h2>
        <p className="text-base leading-relaxed text-white/85 whitespace-pre-line">
          {item.description}
        </p>
      </div>

      {item.article && (
        <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <h2 className="mb-3 text-base font-semibold uppercase tracking-wider text-orange-400">
            Histoire & Contexte Canonique
          </h2>
          <p className="text-base leading-relaxed text-white/85">{item.article}</p>
        </div>
      )}

      {/* Autres objets de la même catégorie */}
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
    </WikiDetailPage>
  );
}
