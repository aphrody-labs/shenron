"use client";

import React from "react";
import Link from "next/link";
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
  const currentIndex = episodesList.findIndex((ep) => ep.active);
  const prevEp = currentIndex > 0 ? episodesList[currentIndex - 1] : undefined;
  const nextEp = currentIndex >= 0 && currentIndex < episodesList.length - 1 ? episodesList[currentIndex + 1] : undefined;

  return (
    <div className="min-h-screen bg-[#000000] text-[#F8FAFC] pb-16">
      {/* Top Bar / Brand Navigation */}
      <header className="sticky top-0 z-40 bg-[#0C0C0D]/95 backdrop-blur border-b border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/wiki/episodes" className="flex items-center gap-2 group">
            <span className="text-rose-600 font-black tracking-tight text-xl group-hover:scale-105 transition-transform">
              TV.DRAGONBALLFR
            </span>
            <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded font-mono font-medium">
              SOVEREIGN STREAM
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-zinc-400">
          <Link href="/wiki/episodes/series/DBS_BEERUS" className="hover:text-white transition-colors">
            Saga Beerus
          </Link>
          <Link href="/wiki/movies" className="hover:text-white transition-colors">
            Films
          </Link>
          <a
            href="https://discord.gg/dragonballfr"
            target="_blank"
            rel="noreferrer"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded transition-colors"
          >
            Watch Together
          </a>
        </div>
      </header>

      {/* Main Watch Layout (YouTube Split Grid) */}
      <div className="max-w-[1780px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Player + Metadata (8 / 12) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Cinema Player */}
          <TvPlayer
            title={episodeTitle}
            seriesTitle={seriesTitle}
            episodeNumber={episodeNumber}
            sources={sources}
            poster={poster}
            prevEpisodeHref={prevEp?.href}
            nextEpisodeHref={nextEp?.href}
          />

          {/* Episode Info Strip */}
          <div className="flex flex-col gap-2 pt-2 border-b border-zinc-800/60 pb-4">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              {seriesTitle} - Épisode {episodeNumber} : {episodeTitle}
            </h1>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <div className="flex items-center gap-3">
                {airDate && <span>Diffusion : {airDate}</span>}
                <span>•</span>
                <span className="text-emerald-400 font-semibold">1080p FHD H.264</span>
                <span>•</span>
                <span className="text-zinc-300">Codec AAC-LC Stéréo</span>
              </div>

              {/* Share & External Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(canonicalUrl);
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Partager
                </button>
              </div>
            </div>
          </div>

          {/* Synopsis & Canonical Specs */}
          {synopsis && (
            <div className="bg-[#0C0C0D] border border-zinc-800/80 rounded-lg p-4 text-sm text-zinc-300 leading-relaxed">
              <h3 className="text-xs uppercase tracking-wider text-zinc-400 font-bold mb-2">
                Synopsis
              </h3>
              <p>{synopsis}</p>
            </div>
          )}
        </div>

        {/* Right Column: Saga Episodes Playlist (4 / 12) */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-bold text-white uppercase tracking-wider">
              {seriesTitle} ({episodesList.length} épisodes)
            </h2>
            <span className="text-xs text-zinc-500 font-mono">AUTOPLAY ON</span>
          </div>

          <div className="flex flex-col gap-2 max-h-[85vh] overflow-y-auto pr-1">
            {episodesList.map((ep) => (
              <Link
                key={ep.id}
                href={ep.href}
                className={`flex gap-3 p-2 rounded-lg transition-colors group ${
                  ep.active
                    ? "bg-zinc-800/80 border border-rose-500/50"
                    : "hover:bg-zinc-900 border border-transparent"
                }`}
              >
                {/* Thumbnail */}
                <div className="relative w-36 aspect-video bg-zinc-900 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={ep.thumbnail}
                    alt={ep.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {ep.duration && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[10px] font-mono px-1 rounded text-white">
                      {ep.duration}
                    </span>
                  )}
                  {ep.active && (
                    <div className="absolute inset-0 bg-rose-600/20 flex items-center justify-center">
                      <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow">
                        EN COURS
                      </span>
                    </div>
                  )}
                </div>

                {/* Episode Meta */}
                <div className="flex flex-col justify-center min-w-0">
                  <span className="text-xs text-rose-500 font-semibold">
                    Épisode {ep.number}
                  </span>
                  <h3 className="text-sm font-medium text-zinc-200 group-hover:text-white truncate">
                    {ep.title}
                  </h3>
                  <span className="text-[11px] text-zinc-400 mt-1">
                    Canon Officiel • VOSTFR
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
