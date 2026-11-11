// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { TvWatchView, type TvEpisodeItem } from "@/components/tv/TvWatchView";
import type { VideoSourceOption } from "@/components/tv/TvPlayer";
import { isShenronEpisodeVideoURL } from "@/lib/episode-video-source";

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
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <p>Le catalogue TV est en cours de synchronisation.</p>
      </main>
    );
  }

  const nav = await dbUniverse.episodeNav(ep.series, ep.number_in_series);

  const candidateUrls = [
    ep.video_url,
    ep.stream_url,
    ...(ep.players ?? []).map((entry: { embedUrl?: string }) => entry.embedUrl),
  ].filter((src): src is string => Boolean(src && URL.canParse(src)));

  const cdnSourceUrl = candidateUrls.find((source) => {
    const url = new URL(source);
    return (
      isShenronEpisodeVideoURL(url) &&
      (url.pathname.includes(`/episodes/${ep.id}/`) ||
        (ep.id === 875 && url.pathname.includes("/episodes/beerus-01/")))
    );
  });

  const sources: VideoSourceOption[] = [];

  if (cdnSourceUrl) {
    sources.push({
      id: "shenron-cdn",
      name: "Shenron 1080p FHD",
      type: "direct",
      url: cdnSourceUrl,
      quality: "1080p",
    });
  } else if (ep.video_url && !ep.video_url.includes("youtube.com")) {
    sources.push({
      id: "direct-stream",
      name: "Direct Stream",
      type: "direct",
      url: ep.video_url,
    });
  }

  (ep.players ?? []).forEach(
    (player: { name: string; embedUrl: string; lang?: string }, index: number) => {
      if (!player.embedUrl) return;
      const label = `${player.name || "Lecteur " + (index + 1)}${player.lang ? ` (${player.lang.toUpperCase()})` : ""}`;
      sources.push({
        id: `player-${index}`,
        name: label,
        type: "iframe",
        url: player.embedUrl,
      });
    },
  );

  if (sources.length === 0) {
    sources.push({
      id: "default-stream",
      name: "Flux Officiel DBFR",
      type: "direct",
      url: "https://cdn.dragonballfr.com/media/episodes/beerus-01/master.mp4",
      quality: "1080p",
    });
  }

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
