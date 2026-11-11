import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { assetUrl } from "@/lib/assets";
import { idDeFiche } from "@/app/wiki/_id-fiche";
import { TvWatchView, type TvEpisodeItem } from "@/components/tv/TvWatchView";
import type { VideoSourceOption } from "@/components/tv/TvPlayer";
import { isShenronEpisodeVideoURL } from "@/lib/episode-video-source";

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

  // Identify CDN direct streaming sources
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

  // 1. Direct CDN MP4/HLS stream if available
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

  // 2. High-speed embed players (vidmoly, yourupload, etc.)
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

  // Fallback source if none available
  if (sources.length === 0) {
    sources.push({
      id: "default-placeholder",
      name: "Aperçu",
      type: "iframe",
      url: "about:blank",
    });
  }

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
