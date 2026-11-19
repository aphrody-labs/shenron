import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { idDeFiche } from "@/app/wiki/_id-fiche";
import { TvWatchView, type TvEpisodeItem } from "@/components/tv/TvWatchView";
import { tvSourcesForEpisode } from "@/lib/tv-sources";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) return { title: "Épisode introuvable" };

  return {
    title: `Regarder Épisode ${ep.number_in_series ?? ep.id} : ${ep.title} — TV Shenron`,
    description:
      ep.synopsis ??
      `Lecteur vidéo haute fidélité pour l'épisode ${ep.number_in_series ?? ep.id} de ${ep.series}.`,
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function EpisodeWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = idDeFiche(id);
  const ep = numero === null ? null : await dbUniverse.episode(numero);
  if (!ep) notFound();

  const nav = await dbUniverse.episodeNav(ep.series, ep.number_in_series);

  const sources = tvSourcesForEpisode(ep);
  if (sources.length === 0) redirect(`/wiki/episodes/${ep.id}`);

  // Build playlist items from nav around or fallback
  const aroundEpisodes = nav?.around ?? [ep];
  const episodesList: TvEpisodeItem[] = aroundEpisodes.map((item) => ({
    id: item.id,
    number: item.number_in_series ?? item.id,
    title: item.title,
    thumbnail: item.image ? assetUrl(item.image) : "/images/placeholder-episode.webp",
    duration:
      ep.id === item.id && ep.duration_sec
        ? `${Math.floor(ep.duration_sec / 60)}:${String(ep.duration_sec % 60).padStart(2, "0")}`
        : "23:40",
    href: `/wiki/episodes/${item.id}/watch`,
    active: item.id === ep.id,
  }));

  const airDate = ep.air_date
    ? new Date(ep.air_date * 1000).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : undefined;

  return (
    <TvWatchView
      seriesTitle={ep.series}
      episodeNumber={ep.number_in_series ?? ep.id}
      episodeTitle={ep.title}
      synopsis={ep.synopsis ?? undefined}
      airDate={airDate}
      sources={sources}
      poster={ep.image ? assetUrl(ep.image) : undefined}
      episodesList={episodesList}
      canonicalUrl={`https://dragonballfr.com/wiki/episodes/${ep.id}/watch`}
    />
  );
}
