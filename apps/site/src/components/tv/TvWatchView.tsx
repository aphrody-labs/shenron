"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TvPlayer, VideoSourceOption } from "./TvPlayer";

export interface TvEpisodeItem {
  id: number;
  number: number;
  title: string;
  thumbnail: string;
  duration?: string;
  href: string;
  active?: boolean;
}

export interface TvWatchViewProps {
  seriesTitle: string;
  episodeNumber: number | string;
  episodeTitle: string;
  synopsis?: string;
  airDate?: string;
  sources: VideoSourceOption[];
  poster?: string;
  episodesList: TvEpisodeItem[];
  canonicalUrl: string;
}

export function TvWatchView({
  seriesTitle,
  episodeNumber,
  episodeTitle,
  synopsis,
  airDate,
  sources,
  poster,
  episodesList,
  canonicalUrl,
}: TvWatchViewProps) {
  const router = useRouter();
  const [isTheater, setIsTheater] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);

  const currentIndex = episodesList.findIndex((ep) => ep.active);
  const prevEp = currentIndex > 0 ? episodesList[currentIndex - 1] : undefined;
  const nextEp =
    currentIndex >= 0 && currentIndex < episodesList.length - 1
      ? episodesList[currentIndex + 1]
      : undefined;

  const handleShare = () => {
    navigator.clipboard.writeText(canonicalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVideoEnded = () => {
    if (nextEp) {
      setAutoplayCountdown(5);
    }
  };

  useEffect(() => {
    if (autoplayCountdown === null) return;
    if (autoplayCountdown <= 0) {
      if (nextEp) router.push(nextEp.href);
      return;
    }
    const timer = setTimeout(() => {
      setAutoplayCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (nextEp) router.push(nextEp.href);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoplayCountdown, nextEp, router]);

  return (
    <div className="min-h-screen bg-[#000000] text-[#F8FAFC] pb-16 selection:bg-rose-600 selection:text-white">
      {/* Top Bar / Brand Navigation */}
      <header className="sticky top-0 z-40 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/wiki/episodes" className="flex items-center gap-2 group">
            <span className="text-rose-600 font-black tracking-tight text-xl group-hover:scale-105 transition-transform">
              TV.DRAGONBALLFR
            </span>
            <span className="bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded font-mono font-medium tracking-wide">
              SOVEREIGN STREAM
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
          <Link href="/wiki/episodes" className="hover:text-white transition-colors">
            Catalogue
          </Link>
          <Link href="/wiki/movies" className="hover:text-white transition-colors">
            Films
          </Link>
          <a
            href="https://discord.gg/dragonballfr"
            target="_blank"
            rel="noreferrer"
            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-3 py-1.5 rounded-md transition-colors"
          >
            Communauté
          </a>
        </div>
      </header>

      {/* Autoplay Next Episode Toast */}
      {autoplayCountdown !== null && nextEp && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121214] border border-rose-500/50 p-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom duration-300">
          <div className="flex flex-col">
            <span className="text-xs text-zinc-400 font-medium">Épisode suivant dans</span>
            <span className="text-lg font-bold text-rose-500 font-mono">
              {autoplayCountdown}s : Épisode {nextEp.number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoplayCountdown(null)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 rounded-md transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                router.push(nextEp.href);
                setAutoplayCountdown(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors"
            >
              Lire maintenant
            </button>
          </div>
        </div>
      )}

      {/* Main Watch Layout (YouTube Responsive Grid) */}
      <main className="max-w-[1780px] mx-auto p-4 lg:p-6">
        {isTheater ? (
          /* Theater Layout: Full Width Player on Top */
          <div className="flex flex-col gap-6">
            <div className="w-full">
              <TvPlayer
                title={episodeTitle}
                seriesTitle={seriesTitle}
                episodeNumber={episodeNumber}
                sources={sources}
                poster={poster}
                prevEpisodeHref={prevEp?.href}
                nextEpisodeHref={nextEp?.href}
                isTheater={true}
                onToggleTheater={setIsTheater}
                onEnded={handleVideoEnded}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Meta (8 / 12) */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <EpisodeDetailsSection
                  seriesTitle={seriesTitle}
                  episodeNumber={episodeNumber}
                  episodeTitle={episodeTitle}
                  airDate={airDate}
                  synopsis={synopsis}
                  handleShare={handleShare}
                  copied={copied}
                />
              </div>

              {/* Right Playlist (4 / 12) */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                <EpisodePlaylistSection seriesTitle={seriesTitle} episodesList={episodesList} />
              </div>
            </div>
          </div>
        ) : (
          /* Standard Layout: 8 / 4 Grid */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Player + Metadata (8 / 12) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <TvPlayer
                title={episodeTitle}
                seriesTitle={seriesTitle}
                episodeNumber={episodeNumber}
                sources={sources}
                poster={poster}
                prevEpisodeHref={prevEp?.href}
                nextEpisodeHref={nextEp?.href}
                isTheater={false}
                onToggleTheater={setIsTheater}
                onEnded={handleVideoEnded}
              />

              <EpisodeDetailsSection
                seriesTitle={seriesTitle}
                episodeNumber={episodeNumber}
                episodeTitle={episodeTitle}
                airDate={airDate}
                synopsis={synopsis}
                handleShare={handleShare}
                copied={copied}
              />
            </div>

            {/* Right Column: Saga Episodes Playlist (4 / 12) */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <EpisodePlaylistSection seriesTitle={seriesTitle} episodesList={episodesList} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface EpisodeDetailsSectionProps {
  seriesTitle: string;
  episodeNumber: number | string;
  episodeTitle: string;
  airDate?: string;
  synopsis?: string;
  handleShare: () => void;
  copied: boolean;
}

function EpisodeDetailsSection({
  seriesTitle,
  episodeNumber,
  episodeTitle,
  airDate,
  synopsis,
  handleShare,
  copied,
}: EpisodeDetailsSectionProps) {
  return (
    <div className="flex flex-col gap-4 pt-1">
      {/* Title & Metadata Strip */}
      <div className="flex flex-col gap-2 pb-4 border-b border-zinc-800/80">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
          {seriesTitle} - Épisode {episodeNumber} : {episodeTitle}
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex flex-wrap items-center gap-2.5">
            {airDate && <span>Diffusion : {airDate}</span>}
            <span>•</span>
            <span className="text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/30">
              1080p FHD H.264
            </span>
            <span className="text-zinc-300 bg-zinc-800/70 px-2 py-0.5 rounded">
              Codec AAC-LC Stéréo
            </span>
            <span className="text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/30 font-medium">
              Canon Officiel
            </span>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
              aria-label="Partager l'épisode"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              {copied ? "Lien copié !" : "Partager"}
            </button>
          </div>
        </div>
      </div>

      {/* Synopsis Card */}
      {synopsis && (
        <div className="bg-[#0C0C0E] border border-zinc-800/80 rounded-xl p-4 text-sm text-zinc-300 leading-relaxed shadow-sm">
          <h2 className="text-xs uppercase tracking-wider text-rose-500 font-bold mb-2">
            Synopsis officiel
          </h2>
          <p className="text-zinc-300 font-normal leading-relaxed">{synopsis}</p>
        </div>
      )}
    </div>
  );
}

interface EpisodePlaylistSectionProps {
  seriesTitle: string;
  episodesList: TvEpisodeItem[];
}

function EpisodePlaylistSection({ seriesTitle, episodesList }: EpisodePlaylistSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          {seriesTitle} ({episodesList.length} épisodes)
        </h2>
        <span className="text-[11px] text-zinc-500 font-mono tracking-tight">AUTOPLAY SUIVANT</span>
      </div>

      <div className="flex flex-col gap-2 max-h-[85vh] overflow-y-auto pr-1">
        {episodesList.map((ep) => (
          <Link
            key={ep.id}
            href={ep.href}
            className={`flex gap-3 p-2 rounded-xl transition-all group ${
              ep.active
                ? "bg-zinc-800/90 border border-rose-500/60 shadow"
                : "hover:bg-zinc-900/80 border border-transparent"
            }`}
          >
            {/* Thumbnail */}
            <div className="relative w-36 aspect-video bg-zinc-900 rounded-lg overflow-hidden flex-shrink-0">
              <img
                src={ep.thumbnail}
                alt={ep.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              {ep.duration && (
                <span className="absolute bottom-1 right-1 bg-black/85 text-[10px] font-mono px-1 rounded text-white border border-white/10">
                  {ep.duration}
                </span>
              )}
              {ep.active && (
                <div className="absolute inset-0 bg-rose-600/25 flex items-center justify-center">
                  <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                    EN COURS
                  </span>
                </div>
              )}
            </div>

            {/* Episode Meta */}
            <div className="flex flex-col justify-center min-w-0 pr-1">
              <span className="text-xs text-rose-500 font-semibold">Épisode {ep.number}</span>
              <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                {ep.title}
              </h3>
              <span className="text-[11px] text-zinc-400 mt-1">Canon Officiel • VOSTFR</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
