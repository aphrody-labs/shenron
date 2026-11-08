"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";

export interface VideoSourceOption {
  id: string;
  name: string;
  type: "direct" | "iframe" | "crunchyroll";
  url: string;
  quality?: string;
}

export interface SubtitleTrack {
  label: string;
  srcLang: string;
  src: string;
  default?: boolean;
}

const DEFAULT_SUBTITLES: SubtitleTrack[] = [];

export interface TvPlayerProps {
  title: string;
  seriesTitle: string;
  episodeNumber: number | string;
  sources: VideoSourceOption[];
  poster?: string;
  nextEpisodeHref?: string;
  prevEpisodeHref?: string;
  subtitles?: SubtitleTrack[];
}

export function TvPlayer({
  title,
  seriesTitle,
  episodeNumber,
  sources,
  poster,
  nextEpisodeHref,
  prevEpisodeHref,
  subtitles = DEFAULT_SUBTITLES,
}: TvPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);

  const controlsTimeoutRef = useRef<Timer | null>(null);
  const currentSource = sources[activeSourceIndex] ?? sources[0];

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2800);
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekRelative = useCallback((delta: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + delta));
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Keyboard shortcuts (YouTube standard)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
          e.preventDefault();
          seekRelative(-10);
          break;
        case "l":
          e.preventDefault();
          seekRelative(10);
          break;
        case "arrowleft":
          e.preventDefault();
          seekRelative(-5);
          break;
        case "arrowright":
          e.preventDefault();
          seekRelative(5);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "t":
          e.preventDefault();
          setIsTheater((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekRelative, toggleMute, toggleFullscreen]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleTimelineScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative bg-black select-none overflow-hidden transition-all duration-300 font-sans group ${
        isTheater ? "w-full max-h-[85vh] aspect-[16/9]" : "w-full aspect-[16/9] rounded-lg shadow-2xl"
      }`}
      style={{ backgroundColor: "#000000" }}
    >
      {currentSource?.type === "direct" ? (
        <video
          ref={videoRef}
          src={currentSource.url}
          poster={poster}
          className="w-full h-full object-contain cursor-pointer"
          onClick={togglePlay}
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onEnded={() => setIsPlaying(false)}
          playsInline
        >
          <track kind="captions" srcLang="fr" label="Français (auto)" />
          {subtitles.map((sub) => (
            <track
              key={sub.srcLang}
              kind="subtitles"
              label={sub.label}
              srcLang={sub.srcLang}
              src={sub.src}
              default={sub.default}
            />
          ))}
        </video>
      ) : (
        <iframe
          src={currentSource?.url}
          title={title}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-presentation allow-popups"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}

      {/* Floating Header Info */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between transition-opacity duration-300 pointer-events-none ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-rose-500 font-bold">
            {seriesTitle} • Episode {episodeNumber}
          </span>
          <h2 className="text-white text-base md:text-lg font-semibold truncate max-w-xl">
            {title}
          </h2>
        </div>

        {/* Source Selector Pill */}
        <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded border border-white/10 pointer-events-auto">
          {sources.map((src, idx) => (
            <button
              key={src.id}
              onClick={() => setActiveSourceIndex(idx)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                activeSourceIndex === idx
                  ? "bg-rose-600 text-white font-semibold"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {src.name}
            </button>
          ))}
        </div>
      </div>

      {/* Overlay Custom Controls for Direct Video */}
      {currentSource?.type === "direct" && (
        <div
          className={`absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 ${
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Progress Bar (Scrubber) */}
          <div className="relative flex items-center group/scrub mb-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleTimelineScrub}
              className="w-full h-1.5 bg-zinc-700/60 rounded-lg appearance-none cursor-pointer accent-rose-600 hover:h-2 transition-all"
            />
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between text-white text-sm">
            <div className="flex items-center gap-4">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="hover:text-rose-500 transition-colors focus:outline-none focus:ring-1 focus:ring-rose-500 rounded p-1"
                aria-label={isPlaying ? "Pause (k)" : "Play (k)"}
              >
                {isPlaying ? (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Prev / Next Episode Links */}
              {prevEpisodeHref && (
                <Link
                  href={prevEpisodeHref}
                  className="hover:text-rose-500 transition-colors p-1"
                  title="Episode précédent"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                  </svg>
                </Link>
              )}
              {nextEpisodeHref && (
                <Link
                  href={nextEpisodeHref}
                  className="hover:text-rose-500 transition-colors p-1"
                  title="Episode suivant"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                  </svg>
                </Link>
              )}

              {/* Volume / Mute */}
              <div className="flex items-center gap-2 group/vol">
                <button
                  onClick={toggleMute}
                  className="hover:text-rose-500 transition-colors p-1"
                  aria-label="Mute (m)"
                >
                  {isMuted || volume === 0 ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setVolume(v);
                    if (videoRef.current) {
                      videoRef.current.volume = v;
                      videoRef.current.muted = v === 0;
                    }
                    setIsMuted(v === 0);
                  }}
                  className="w-16 h-1 bg-zinc-600 appearance-none rounded cursor-pointer accent-rose-600 hidden group-hover/vol:block transition-all"
                />
              </div>

              {/* Timestamp */}
              <div className="text-xs text-zinc-300 font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              {/* Playback Speed selector */}
              <select
                value={playbackRate}
                onChange={(e) => {
                  const rate = parseFloat(e.target.value);
                  setPlaybackRate(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                }}
                className="bg-transparent text-xs text-zinc-300 hover:text-white border border-white/20 rounded px-1.5 py-0.5 focus:outline-none"
              >
                <option value={0.5} className="bg-zinc-900">0.5x</option>
                <option value={0.75} className="bg-zinc-900">0.75x</option>
                <option value={1} className="bg-zinc-900">1x</option>
                <option value={1.25} className="bg-zinc-900">1.25x</option>
                <option value={1.5} className="bg-zinc-900">1.5x</option>
                <option value={2} className="bg-zinc-900">2x</option>
              </select>

              {/* Theater Mode */}
              <button
                onClick={() => setIsTheater((prev) => !prev)}
                className="hover:text-rose-500 transition-colors p-1"
                aria-label="Mode Cinema (t)"
                title="Mode Cinéma (t)"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z" />
                </svg>
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="hover:text-rose-500 transition-colors p-1"
                aria-label="Plein ecran (f)"
                title="Plein écran (f)"
              >
                {isFullscreen ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
