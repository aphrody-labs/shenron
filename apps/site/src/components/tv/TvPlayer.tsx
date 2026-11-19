"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useVideoSource } from "@/components/episodes/use-video-source";
import {
  isHlsSource,
  readResume,
  videoResumeKey,
  videoResumePosition,
  writeResume,
} from "@/lib/video-controls";
import { useVideoUIText } from "@/lib/video-ui-text";

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

interface PlayerKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}

interface KeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

const TEXT_ENTRY_TAGS = ["INPUT", "TEXTAREA", "SELECT"];
const ACTIVATION_TAGS = ["BUTTON", "A", "SUMMARY"];

/** True when the key event is a player shortcut and the player may consume it. */
export function isPlayerShortcut(event: PlayerKeyEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target as KeyTarget | null;
  const tag = target?.tagName?.toUpperCase() ?? "";
  if (TEXT_ENTRY_TAGS.includes(tag) || target?.isContentEditable) return false;
  const activation = event.key === " " || event.key === "Enter";
  if (activation) {
    const role = target?.getAttribute?.("role");
    if (ACTIVATION_TAGS.includes(tag) || role === "slider") return false;
  }
  return true;
}

export interface TvPlayerProps {
  title: string;
  seriesTitle: string;
  episodeNumber: number | string;
  sources: VideoSourceOption[];
  poster?: string;
  nextEpisodeHref?: string;
  prevEpisodeHref?: string;
  subtitles?: SubtitleTrack[];
  isTheater?: boolean;
  onToggleTheater?: (theater: boolean) => void;
  onEnded?: () => void;
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
  isTheater: externalIsTheater,
  onToggleTheater,
  onEnded,
}: TvPlayerProps) {
  const t = useTranslations("mediaPlayback");
  const ui = useVideoUIText();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);

  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [internalIsTheater, setInternalIsTheater] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [ambientMode, setAmbientMode] = useState(true);
  const [waiting, setWaiting] = useState(false);

  // Scrubber hover preview state
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Center action feedback indicator
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<Timer | null>(null);

  const controlsTimeoutRef = useRef<Timer | null>(null);
  const focusWithinRef = useRef(false);
  const currentSource = sources[activeSourceIndex] ?? sources[0];
  const directUrl = currentSource?.type === "direct" ? currentSource.url : "";
  const { status, retry } = useVideoSource(videoRef, directUrl);
  const resumeKey = videoResumeKey(directUrl);
  const lastSaved = useRef(0);

  const isTheater = externalIsTheater !== undefined ? externalIsTheater : internalIsTheater;

  const triggerFeedback = useCallback((text: string) => {
    setActionFeedback(text);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setActionFeedback(null);
    }, 600);
  }, []);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isScrubbing && !focusWithinRef.current) setShowControls(false);
    }, 2800);
  };

  const handleFocusCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    let keyboardFocus = false;
    try {
      keyboardFocus = event.target.matches(":focus-visible");
    } catch {
      keyboardFocus = false;
    }
    if (!keyboardFocus) return;
    focusWithinRef.current = true;
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
  };

  const handleBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    focusWithinRef.current = false;
    handleMouseMove();
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
      triggerFeedback(t("play"));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      triggerFeedback(t("pause"));
    }
  }, [triggerFeedback, t]);

  const seekRelative = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      const target = Math.max(
        0,
        Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + delta),
      );
      videoRef.current.currentTime = target;
      setCurrentTime(target);
      triggerFeedback(delta > 0 ? `+${delta}s` : `${delta}s`);
    },
    [triggerFeedback],
  );

  const seekToPercent = useCallback(
    (pct: number) => {
      if (!videoRef.current || !videoRef.current.duration) return;
      const target = videoRef.current.duration * pct;
      videoRef.current.currentTime = target;
      setCurrentTime(target);
      triggerFeedback(`${Math.round(pct * 100)}%`);
    },
    [triggerFeedback],
  );

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
    triggerFeedback(videoRef.current.muted ? t("mute") : t("unmute"));
  }, [triggerFeedback, t]);

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

  const toggleTheater = useCallback(() => {
    const nextVal = !isTheater;
    if (onToggleTheater) {
      onToggleTheater(nextVal);
    } else {
      setInternalIsTheater(nextVal);
    }
  }, [isTheater, onToggleTheater]);

  useEffect(() => {
    lastSaved.current = 0;
    setWaiting(false);
  }, [directUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!directUrl) return;
    const save = () => {
      if (!video) return;
      const resume = videoResumePosition(video.currentTime, video.duration);
      if (resume !== null) writeResume(resumeKey, resume);
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [directUrl, resumeKey]);

  // YouTube standard keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlayerShortcut(e)) return;

      const key = e.key.toLowerCase();
      if (key === " " || key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (key === "j") {
        e.preventDefault();
        seekRelative(-10);
      } else if (key === "l") {
        e.preventDefault();
        seekRelative(10);
      } else if (key === "arrowleft") {
        e.preventDefault();
        seekRelative(-5);
      } else if (key === "arrowright") {
        e.preventDefault();
        seekRelative(5);
      } else if (key === "m") {
        e.preventDefault();
        toggleMute();
      } else if (key === "f") {
        e.preventDefault();
        toggleFullscreen();
      } else if (key === "t") {
        e.preventDefault();
        toggleTheater();
      } else if (key >= "0" && key <= "9") {
        e.preventDefault();
        seekToPercent(Number(key) / 10);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, seekRelative, seekToPercent, toggleMute, toggleFullscreen, toggleTheater]);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const updateBufferedProgress = () => {
    if (!videoRef.current) return;
    const b = videoRef.current.buffered;
    if (b.length > 0) {
      const cur = videoRef.current.currentTime;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= cur && cur <= b.end(i)) {
          setBufferedEnd(b.end(i));
          return;
        }
      }
      setBufferedEnd(b.end(b.length - 1));
    }
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubTrackRef.current || !duration) return;
    const rect = scrubTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverRatio(ratio);
    setHoverTime(ratio * duration);
  };

  const handleTimelineMouseLeave = () => {
    setHoverTime(null);
  };

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div className="relative w-full">
      {/* Ambient Mode Backdrop Glow (YouTube Cinema Ambient) */}
      {ambientMode && (
        <div
          aria-hidden="true"
          className="absolute -inset-4 bg-gradient-to-r from-rose-600/25 via-amber-500/20 to-orange-600/25 blur-3xl rounded-3xl opacity-50 transition-opacity duration-700 motion-reduce:transition-none pointer-events-none -z-10"
        />
      )}

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        className={`relative bg-black select-none overflow-hidden transition-all duration-300 motion-reduce:transition-none font-sans group ${
          isTheater
            ? "w-full max-h-[82vh] aspect-[16/9]"
            : "w-full aspect-[16/9] rounded-xl shadow-2xl border border-zinc-800/80"
        }`}
        style={{ backgroundColor: "#000000" }}
      >
        {currentSource?.type === "direct" ? (
          <video
            ref={videoRef}
            src={isHlsSource(currentSource.url) ? undefined : currentSource.url}
            poster={poster}
            className="w-full h-full object-contain cursor-pointer"
            onClick={togglePlay}
            onDoubleClick={toggleFullscreen}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              setCurrentTime(video.currentTime || 0);
              updateBufferedProgress();
              if (Math.abs(video.currentTime - lastSaved.current) < 5) return;
              lastSaved.current = video.currentTime;
              const resume = videoResumePosition(video.currentTime, video.duration);
              if (resume !== null) writeResume(resumeKey, resume);
            }}
            onProgress={updateBufferedProgress}
            onWaiting={() => setWaiting(true)}
            onStalled={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}
            onSeeked={() => setWaiting(false)}
            onLoadedMetadata={() => {
              const video = videoRef.current;
              setDuration(video?.duration || 0);
              if (!video) return;
              const resume = videoResumePosition(readResume(resumeKey), video.duration);
              if (resume !== null && video.currentTime < 1) {
                video.currentTime = resume;
                lastSaved.current = resume;
              }
            }}
            onEnded={() => {
              setIsPlaying(false);
              writeResume(resumeKey, null);
              lastSaved.current = 0;
              if (onEnded) onEnded();
            }}
            playsInline
          >
            {subtitles
              .filter((sub) => sub.src)
              .map((sub) => (
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
        ) : currentSource ? (
          <iframe
            src={currentSource.url}
            title={title}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-presentation allow-popups"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-zinc-300">
            {ui("unavailableHeading")}
          </div>
        )}

        {/* Playback state: buffering, loading, recovery, failure */}
        {currentSource?.type === "direct" && (
          <>
            {status === "failed" && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                <button
                  type="button"
                  onClick={retry}
                  className="pointer-events-auto min-h-[44px] rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-white"
                >
                  {t("retryVideo")}
                </button>
              </div>
            )}
            <p
              role={status === "failed" ? "alert" : "status"}
              className={
                status === "ready" && !waiting
                  ? "sr-only"
                  : "absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-black/75 px-4 py-1.5 text-xs font-medium text-white"
              }
            >
              {waiting && status !== "failed"
                ? t("videoBuffering")
                : t(
                    status === "loading"
                      ? "videoLoading"
                      : status === "recovering"
                        ? "videoRecovering"
                        : status === "failed"
                          ? "videoError"
                          : "videoReady",
                  )}
            </p>
          </>
        )}

        {/* Center Action Feedback Ripple (Play / Pause / Seek) */}
        <p role="status" aria-live="polite" className="sr-only">
          {actionFeedback ?? ""}
        </p>
        {actionFeedback && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in fade-in zoom-in-75 duration-200"
          >
            <div className="bg-black/75 backdrop-blur-md text-white text-sm font-semibold px-4 py-2 rounded-full border border-white/10 shadow-2xl">
              {actionFeedback}
            </div>
          </div>
        )}

        {/* Floating Header Info */}
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-20 pointer-events-none ${
            showControls ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col pr-4">
            <span className="text-xs uppercase tracking-wider text-rose-500 font-bold">
              {seriesTitle} • Episode {episodeNumber}
            </span>
            <h2 className="text-white text-base md:text-lg font-semibold truncate max-w-xl">
              {title}
            </h2>
          </div>

          {/* Source Selector Pill */}
          <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md p-1 rounded-lg border border-white/15 pointer-events-auto shrink-0">
            {sources.map((src, idx) => (
              <button
                key={src.id}
                onClick={() => setActiveSourceIndex(idx)}
                className={`min-h-[32px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeSourceIndex === idx
                    ? "bg-rose-600 text-white font-semibold shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
                aria-label={t("playerTitle", { number: idx + 1, name: src.name })}
              >
                {src.name}
              </button>
            ))}
          </div>
        </div>

        {/* Overlay Custom Controls for Direct Video */}
        {currentSource?.type === "direct" && (
          <div
            className={`absolute bottom-0 left-0 right-0 p-3 pt-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 z-20 ${
              showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Accessible YouTube / Crunchyroll Scrubber Progress Bar */}
            <div
              ref={scrubTrackRef}
              onMouseMove={handleTimelineMouseMove}
              onMouseLeave={handleTimelineMouseLeave}
              className="relative w-full h-3 flex items-center group/scrub mb-2"
            >
              {/* Floating Hover Time Tooltip */}
              {hoverTime !== null && (
                <div
                  className="absolute bottom-5 -translate-x-1/2 bg-black/95 text-white text-[11px] font-mono font-medium px-2 py-0.5 rounded shadow pointer-events-none border border-white/10 z-20"
                  style={{ left: `${hoverRatio * 100}%` }}
                >
                  {formatTime(hoverTime)}
                </div>
              )}

              {/* Background Track */}
              <div className="absolute inset-x-0 h-1 group-hover/scrub:h-1.5 bg-zinc-700/60 rounded-full transition-all motion-reduce:transition-none overflow-hidden pointer-events-none group-has-[:focus-visible]/scrub:ring-2 group-has-[:focus-visible]/scrub:ring-amber-400">
                {/* Buffered Progress */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white/25 transition-all duration-150"
                  style={{ width: `${bufferedPercent}%` }}
                />
                {/* Active Played Progress */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-rose-600 transition-all"
                  style={{ width: `${currentPercent}%` }}
                />
              </div>

              {/* Scrubber Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-rose-600 rounded-full shadow scale-0 group-hover/scrub:scale-100 group-has-[:focus-visible]/scrub:scale-100 transition-transform motion-reduce:transition-none pointer-events-none z-10"
                style={{ left: `${currentPercent}%` }}
              />

              {/* Semantic Native Range Input for WAI-ARIA and Keyboard Accessibility */}
              <input
                type="range"
                aria-label={t("seekPosition")}
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const targetTime = Number(e.target.value);
                  if (videoRef.current) {
                    videoRef.current.currentTime = targetTime;
                    setCurrentTime(targetTime);
                  }
                }}
                onMouseDown={() => setIsScrubbing(true)}
                onMouseUp={() => setIsScrubbing(false)}
                onTouchStart={() => setIsScrubbing(true)}
                onTouchEnd={() => setIsScrubbing(false)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                aria-valuemin={0}
                aria-valuemax={duration || 100}
                aria-valuenow={currentTime}
                aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
              />
            </div>

            {/* Action Row */}
            <div className="flex items-center justify-between text-white text-sm">
              <div className="flex items-center gap-3">
                {/* Play/Pause Button */}
                <button
                  onClick={togglePlay}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md focus-visible:ring-2 focus-visible:ring-amber-400"
                  aria-label={`${isPlaying ? t("pause") : t("play")} (k)`}
                  title={`${isPlaying ? t("pause") : t("play")} (k)`}
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

                {/* Step Backward 10s */}
                <button
                  onClick={() => seekRelative(-10)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md"
                  aria-label={`${ui("backward")} (j)`}
                  title={`${ui("backwardShort")} (j)`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"
                    />
                  </svg>
                </button>

                {/* Step Forward 10s */}
                <button
                  onClick={() => seekRelative(10)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md"
                  aria-label={`${ui("forward")} (l)`}
                  title={`${ui("forwardShort")} (l)`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M11.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 005 8v8a1 1 0 001.6.8l5.334-4zM19.934 12.8a1 1 0 000-1.6l-5.334-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.334-4z"
                    />
                  </svg>
                </button>

                {/* Prev / Next Episode Links */}
                {prevEpisodeHref && (
                  <Link
                    href={prevEpisodeHref}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md"
                    title={t("previousEpisode")}
                    aria-label={t("previousEpisode")}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                  </Link>
                )}
                {nextEpisodeHref && (
                  <Link
                    href={nextEpisodeHref}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md"
                    title={t("nextEpisode")}
                    aria-label={t("nextEpisode")}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </Link>
                )}

                {/* Volume / Mute */}
                <div className="flex items-center gap-1.5 group/vol">
                  <button
                    onClick={toggleMute}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:text-rose-500 transition-colors rounded-md"
                    aria-label={`${isMuted || volume === 0 ? t("unmute") : t("mute")} (m)`}
                    title={`${isMuted || volume === 0 ? t("unmute") : t("mute")} (m)`}
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
                    className="w-16 h-1 bg-zinc-600 appearance-none rounded-full cursor-pointer accent-rose-600 hidden group-hover/vol:block transition-all"
                    aria-label={t("volume")}
                  />
                </div>

                {/* Timestamp Display */}
                <div className="text-xs text-zinc-300 font-mono tracking-tight pl-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              {/* Right Controls */}
              <div className="flex items-center gap-2">
                {/* Ambient Mode Toggle */}
                <button
                  onClick={() => setAmbientMode((prev) => !prev)}
                  className={`min-w-[40px] min-h-[40px] flex items-center justify-center p-1 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    ambientMode ? "text-amber-400" : "text-zinc-400 hover:text-white"
                  }`}
                  aria-pressed={ambientMode}
                  aria-label="Mode ambiant"
                  title="Éclairage ambiant"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </button>

                {/* Playback Speed selector */}
                <select
                  value={playbackRate}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value);
                    setPlaybackRate(rate);
                    if (videoRef.current) videoRef.current.playbackRate = rate;
                  }}
                  className="bg-black/60 text-xs text-zinc-300 hover:text-white border border-white/20 rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
                  aria-label={t("speed")}
                >
                  <option value={0.5} className="bg-zinc-900">
                    0.5x
                  </option>
                  <option value={0.75} className="bg-zinc-900">
                    0.75x
                  </option>
                  <option value={1} className="bg-zinc-900">
                    1x (Normal)
                  </option>
                  <option value={1.25} className="bg-zinc-900">
                    1.25x
                  </option>
                  <option value={1.5} className="bg-zinc-900">
                    1.5x
                  </option>
                  <option value={2} className="bg-zinc-900">
                    2x
                  </option>
                </select>

                {/* Theater Mode Toggle */}
                <button
                  onClick={toggleTheater}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center hover:text-rose-500 transition-colors p-1 rounded-md"
                  aria-label={`${isTheater ? t("exitTheater") : t("theater")} (t)`}
                  title={`${isTheater ? t("exitTheater") : t("theater")} (t)`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 6H5c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H5V8h14v8z" />
                  </svg>
                </button>

                {/* Fullscreen Toggle */}
                <button
                  onClick={toggleFullscreen}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center hover:text-rose-500 transition-colors p-1 rounded-md"
                  aria-label={`${t("fullscreen")} (f)`}
                  title={`${t("fullscreen")} (f)`}
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
    </div>
  );
}
