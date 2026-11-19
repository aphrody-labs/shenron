// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { TvWatchView, type TvEpisodeItem } from "@/components/tv/TvWatchView";
import { tvSourcesForEpisode } from "@/lib/tv-sources";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "TV Dragon Ball — Lecteur Streaming Haute Définition",
  description:
    "Regardez Dragon Ball, Dragon Ball Z, GT, Kai, Super et Daima en streaming direct avec ambient lighting, raccourcis clavier et design YouTube/Crunchyroll.",
  robots: {
    index: true,
    follow: true,
  },
};

export default async function TvHubPage({
  searchParams,
}: {
  searchParams?: Promise<{ ep?: string }>;
}) {
  const query = await searchParams;
  const targetId = query?.ep ? Number(query.ep) : 875;
  const validId = Number.isSafeInteger(targetId) && targetId > 0 ? targetId : 875;

  let ep = await dbUniverse.episode(validId);
  if (!ep) {
    ep = await dbUniverse.episode(1);
  }
  if (!ep) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <h1 className="text-base font-normal">Le catalogue TV est en cours de synchronisation.</h1>
      </div>
    );
  }

  const nav = await dbUniverse.episodeNav(ep.series, ep.number_in_series);

  const sources = tvSourcesForEpisode(ep);
  if (sources.length === 0) redirect(`/wiki/episodes/${ep.id}`);

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
    href: `/tv?ep=${item.id}`,
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
      canonicalUrl="https://dragonballfr.com/tv"
    />
  );
}
