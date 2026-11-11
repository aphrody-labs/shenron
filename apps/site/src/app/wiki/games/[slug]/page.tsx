import { hasEditorialDatabase } from "@/lib/prerender";
import { Xenoverse2Runtime } from "@/components/games/Xenoverse2Runtime";
import { TenkaichiWasmPlayer } from "@/components/games/TenkaichiWasmPlayer";
import { FighterZBrowserRuntime } from "@/components/games/FighterZBrowserRuntime";
import { EntityParticipation } from "@/components/social/EntityParticipation";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { GameMediaGallery } from "@/components/wiki/GameMediaGallery";
import { EntityRating, EntityRatingSummary } from "@/components/ratings/EntityRating";
import { CommunityRankBadge } from "@/components/ratings/CommunityRankBadge";
import { dbUniverse, assetUrl } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { GatedWrap } from "@/components/GatedLink";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { VideoGame, WithContext } from "schema-dts";

export const revalidate = 3600;

export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const r = await dbUniverse.games();
  return (r?.games ?? []).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = await dbUniverse.game(slug);
  if (!g) notFound();
  const description = g.description ?? `${g.title} (${g.developer ?? "Bandai Namco"}).`;
  return {
    title: `${g.title} — Jeu vidéo Dragon Ball`,
    description,
    ...ogMeta({
      title: `${g.title} — DBFR`,
      description,
      image: g.cover ? assetUrl(g.cover) : undefined,
      canonical: `/wiki/games/${slug}`,
    }),
  };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await dbUniverse.game(slug);
  if (!g) notFound();

  const platforms = (g.platforms ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const jsonLdData: WithContext<VideoGame> = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: g.title,
    image: g.cover ? assetUrl(g.cover) : undefined,
    description: g.description ?? undefined,
    genre: "Fighting",
    author: g.developer ? { "@type": "Organization", name: g.developer } : undefined,
    publisher: g.publisher ? { "@type": "Organization", name: g.publisher } : undefined,
    gamePlatform: platforms,
    datePublished: g.release_date
      ? new Date(g.release_date * 1000).toISOString().split("T")[0]
      : undefined,
  };

  return (
    <WikiDetailPage
      entity={g.title}
      source="db_games"
      jsonLd={jsonLdData}
      crumbs={[{ label: "Jeux vidéo", href: "/wiki/games" }, { label: g.title }]}
      edit={{ table: "db_games", id: g.id, indexHref: "/wiki/games", label: g.title }}
      header={
        <WikiEntityHeader
          name={g.title}
          nameJa={g.title_ja}
          chips={
            <span className="font-display font-semibold text-[12px] tracking-[0.18em] uppercase text-dbz-orange">
              Bandai Namco Entertainment
            </span>
          }
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <EntityRatingSummary targetType="game" targetId={g.id} />
            <CommunityRankBadge kind="game" targetId={g.id} />
          </div>
        </WikiEntityHeader>
      }
      aside={
        <>
          {g.cover && (
            <div className="relative mx-auto w-40 sm:w-48 aspect-[3/4] rounded-xl overflow-hidden border border-white/10 bg-black">
              <Image
                src={assetUrl(g.cover)}
                alt={g.title}
                fill
                sizes="192px"
                className="object-cover"
                priority
              />
            </div>
          )}
          <dl className="grid gap-6 p-6 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {g.release_date && (
              <div>
                <dt className="font-display font-semibold text-[11px] tracking-[0.16em] uppercase text-white/50 mb-1.5">
                  Date de sortie
                </dt>
                <dd className="text-white text-[15px]">
                  {new Date(g.release_date * 1000).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </div>
            )}
            {g.developer && (
              <div>
                <dt className="font-display font-semibold text-[11px] tracking-[0.16em] uppercase text-white/50 mb-1.5">
                  Développeur
                </dt>
                <dd className="text-white text-[15px]">{g.developer}</dd>
              </div>
            )}
            {g.publisher && (
              <div>
                <dt className="font-display font-semibold text-[11px] tracking-[0.16em] uppercase text-white/50 mb-1.5">
                  Éditeur
                </dt>
                <dd className="text-white text-[15px]">{g.publisher}</dd>
              </div>
            )}
            {platforms.length > 0 && (
              <div>
                <dt className="font-display font-semibold text-[11px] tracking-[0.16em] uppercase text-white/50 mb-1.5">
                  Plateformes
                </dt>
                <dd className="flex flex-wrap gap-1.5">
                  {platforms.map((p) => (
                    <span
                      key={p}
                      className="text-[11px] font-display font-semibold tracking-[0.10em] uppercase px-2.5 py-1 rounded-full bg-dbz-orange/15 text-dbz-orange"
                    >
                      {p}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </>
      }
    >
      {slug === "xenoverse-2" && <Xenoverse2Runtime wiki />}

      {slug === "fighterz" && (
        <section className="mb-10 space-y-4">
          <FighterZBrowserRuntime />
        </section>
      )}

      {(slug === "budokai-tenkaichi-3" ||
        slug === "dragon-ball-z-budokai-tenkaichi-3" ||
        slug.includes("tenkaichi")) && (
        <section className="mb-10 space-y-4">
          <TenkaichiWasmPlayer />
        </section>
      )}

      {g.description && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-[20px] text-white border-b border-white/10 pb-2 mb-4">
            Description
          </h2>
          <div className="prose prose-invert max-w-none wiki-content">
            <WikiMarkdown body={g.description} />
          </div>
        </section>
      )}

      {g.media && g.media.length > 0 && <GameMediaGallery media={g.media} title={g.title} />}

      {g.characters && g.characters.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-[20px] text-white border-b border-white/10 pb-2 mb-4">
            Personnages jouables ({g.characters.length})
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {g.characters.map((c) => (
              <GatedWrap
                key={c.id}
                href={`/wiki/characters/${c.slug || c.id}`}
                className="group flex flex-col items-center gap-2 rounded-lg p-2 transition-colors hover:bg-white/[0.04]"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-black">
                  {c.image && (
                    <Image
                      src={assetUrl(c.image)}
                      alt={c.name}
                      fill
                      sizes="120px"
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  )}
                </div>
                <span className="text-center text-[12px] leading-tight text-white/80 group-hover:text-dbz-orange">
                  {c.name}
                </span>
              </GatedWrap>
            ))}
          </div>
        </section>
      )}

      {g.official_url && (
        <a
          href={g.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center h-12 px-6 rounded-full bg-dbz-orange hover:bg-white text-black font-display font-bold text-[13px] tracking-[0.10em] uppercase transition-colors"
        >
          Page officielle Bandai Namco
        </a>
      )}

      {/* Notes & avis — dernier bloc */}
      <div className="mt-16">
        <EntityRating
          targetType="game"
          targetId={g.id}
          signinCallback={`/wiki/games/${slug}`}
          label="ce jeu"
        />
      </div>
      <EntityParticipation
        kind="wiki"
        table="db_games"
        id={g.id}
        path={`/wiki/games/${slug}`}
        label={g.title}
      />
    </WikiDetailPage>
  );
}
