"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useVideoSource } from "./use-video-source";
import {
  VIDEO_PLAYBACK_RATES,
  videoKeyAction,
  videoSeekTarget,
  isHlsSource,
} from "@/lib/video-controls";
import { nativeEpisodeVideoSource } from "@/lib/episode-video-source";

export interface SubtitleTrack {
  lang: string;
  label: string;
  src: string;
}
export interface VideoPlayerProps {
  src: string;
  title: string;
  poster?: string;
  subtitles?: SubtitleTrack[];
  previousEpisode?: { href: string; label: string };
  nextEpisode?: { href: string; label: string };
  onError?: () => void;
}
function trackUrl(src: string): string {
  return /^https?:\/\//i.test(src)
    ? src
    : `/api/subtitles?src=${encodeURIComponent(src.replace(/^\.?\/*/, ""))}`;
}
function timeLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/** Native controls stay available; HLS menus expose only observed renditions. */
export function VideoPlayer({
  src,
  title,
  poster,
  subtitles,
  previousEpisode,
  nextEpisode,
  onError,
}: VideoPlayerProps) {
  const t = useTranslations("mediaPlayback");
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playbackSource = nativeEpisodeVideoSource(src);
  const {
    status,
    levels,
    quality,
    selectQuality,
    audioTracks,
    audioTrack,
    selectAudioTrack,
    retry,
  } = useVideoSource(videoRef, playbackSource, onError);
  const rateRef = useRef(1);
  const [paused, setPaused] = useState(true);
  const [rate, setRate] = useState(1);
  const [caption, setCaption] = useState(-1);
  const [textTracks, setTextTracks] = useState<{ index: number; label: string }[]>([]);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [theater, setTheater] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const syncTimeline = () => {
    const video = videoRef.current;
    if (!video) return;
    setPosition(video.currentTime);
    setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const ranges = video.buffered;
    let end = video.currentTime;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= video.currentTime && ranges.end(i) >= video.currentTime)
        end = ranges.end(i);
    }
    setBuffered(end);
  };
  useEffect(() => {
    const tracks = videoRef.current?.textTracks;
    if (!tracks) return;
    const sync = () => {
      const list = Array.from(tracks);
      setTextTracks(
        list.map((track, index) => ({
          index,
          label: track.label || track.language || t("captionNumber", { number: index + 1 }),
        })),
      );
      setCaption(list.findIndex((track) => track.mode === "showing"));
    };
    sync();
    tracks.addEventListener("addtrack", sync);
    tracks.addEventListener("removetrack", sync);
    tracks.addEventListener("change", sync);
    return () => {
      tracks.removeEventListener("addtrack", sync);
      tracks.removeEventListener("removetrack", sync);
      tracks.removeEventListener("change", sync);
    };
  }, [src, subtitles, t]);

  useEffect(() => {
    setPaused(videoRef.current?.paused ?? true);
    setActionError(false);
    setPosition(0);
    setDuration(0);
    setBuffered(0);
    setWaiting(false);
    setFullscreenSupported(
      Boolean(document.fullscreenEnabled && containerRef.current?.requestFullscreen),
    );
    setPipSupported(
      Boolean(document.pictureInPictureEnabled && videoRef.current?.requestPictureInPicture),
    );
  }, [src]);

  const playPause = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) {
      video.pause();
      return;
    }
    try {
      await video.play();
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };
  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const range = video.seekable;
    const target = videoSeekTarget(
      video.currentTime,
      delta,
      range.length ? range.start(0) : 0,
      range.length ? range.end(range.length - 1) : video.duration,
    );
    if (target !== null) video.currentTime = target;
  };
  const fullscreen = async () => {
    if (!fullscreenSupported) return;
    try {
      if (document.fullscreenElement === containerRef.current) await document.exitFullscreen();
      else await containerRef.current?.requestFullscreen();
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };
  const pictureInPicture = async () => {
    const video = videoRef.current;
    if (!pipSupported || !video || video.readyState < 2) return;
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
      setActionError(false);
    } catch {
      setActionError(true);
    }
  };
  const selectCaption = (index: number) => {
    const video = videoRef.current;
    if (!video || !Number.isInteger(index) || index < -1 || index >= video.textTracks.length)
      return;
    Array.from(video.textTracks).forEach((track, i) => {
      track.mode = i === index ? "showing" : "disabled";
    });
    setCaption(index);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && theater) {
      event.preventDefault();
      setTheater(false);
      return;
    }
    const target = event.target as HTMLElement;
    if (target !== videoRef.current && target !== containerRef.current) return;
    const action = videoKeyAction(event.key, target.tagName, {
      editable: target.isContentEditable,
      modified:
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.shiftKey && !/^[a-z]$/i.test(event.key)),
      repeat: event.repeat,
    });
    if (
      !action ||
      (action === "captions" && textTracks.length === 0) ||
      (action === "fullscreen" && !fullscreenSupported) ||
      (action === "pip" && !pipSupported)
    )
      return;
    event.preventDefault();
    switch (action) {
      case "play":
        void playPause();
        break;
      case "backward":
        seek(event.key.toLowerCase() === "j" ? -10 : -5);
        break;
      case "forward":
        seek(event.key.toLowerCase() === "l" ? 10 : 5);
        break;
      case "mute":
        if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
        break;
      case "fullscreen":
        void fullscreen();
        break;
      case "pip":
        void pictureInPicture();
        break;
      case "captions":
        selectCaption(caption === -1 ? 0 : -1);
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={title}
      onKeyDown={handleKeyDown}
      className={`dbz-panel relative overflow-hidden rounded-xl border border-amber-500/30 bg-black p-0 shadow-lg focus-visible:outline-2 focus-visible:outline-amber-400 ${theater ? "left-1/2 w-[calc(100vw-3rem)] -translate-x-1/2" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/20 px-4 py-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        {(previousEpisode || nextEpisode) && (
          <nav aria-label={t("episodeNavigation")} className="flex gap-3 text-xs text-amber-300">
            {previousEpisode && (
              <Link
                href={previousEpisode.href}
                title={previousEpisode.label}
                className="rounded px-2 py-2 focus-visible:outline-2"
              >
                {t("previousEpisode")}
              </Link>
            )}
            {nextEpisode && (
              <Link
                href={nextEpisode.href}
                title={nextEpisode.label}
                className="rounded px-2 py-2 focus-visible:outline-2"
              >
                {t("nextEpisode")}
              </Link>
            )}
          </nav>
        )}
      </div>
      <video
        ref={videoRef}
        src={isHlsSource(playbackSource) ? undefined : playbackSource}
        controls
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        poster={poster}
        title={title}
        className={`aspect-video w-full bg-black ${theater ? "max-h-[75dvh] object-contain" : "rounded-xl"}`}
        onTimeUpdate={syncTimeline}
        onProgress={syncTimeline}
        onDurationChange={syncTimeline}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onSeeked={() => setWaiting(false)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onPlay={(event) => setPaused(event.currentTarget.paused)}
        onPause={(event) => setPaused(event.currentTarget.paused)}
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.playbackRate = rateRef.current;
          syncTimeline();
        }}
        onRateChange={() => {
          if (videoRef.current) {
            rateRef.current = videoRef.current.playbackRate;
            setRate(rateRef.current);
          }
        }}
      >
        {subtitles?.map((track, index) => (
          <track
            key={`${track.lang}-${track.src}`}
            kind="subtitles"
            src={trackUrl(track.src)}
            srcLang={track.lang}
            label={track.label}
            default={index === 0}
          />
        ))}
      </video>
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-3 text-xs tabular-nums text-white/80">
          <span>
            {timeLabel(position)} / {timeLabel(duration)}
          </span>
          <span>{t("bufferedUntil", { time: timeLabel(buffered) })}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded bg-white/15" aria-hidden="true">
          <div
            className="h-full bg-white/40"
            style={{ width: `${duration ? Math.min(100, (buffered / duration) * 100) : 0}%` }}
          />
        </div>
        <label className="block">
          <span className="sr-only">{t("seekPosition")}</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(position, duration || 1)}
            disabled={!duration}
            aria-valuetext={`${timeLabel(position)} / ${timeLabel(duration)}`}
            onChange={(event) => {
              if (videoRef.current) videoRef.current.currentTime = Number(event.target.value);
              setPosition(Number(event.target.value));
            }}
            className="h-10 w-full cursor-pointer accent-dbz-orange focus-visible:outline-2 focus-visible:outline-amber-400"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 p-3 text-xs text-white">
        <button
          type="button"
          onClick={() => void playPause()}
          disabled={status === "failed"}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          {paused ? t("play") : t("pause")}
        </button>
        <button
          type="button"
          onClick={() => seek(-10)}
          disabled={!duration}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          −10 s
        </button>
        <button
          type="button"
          onClick={() => seek(10)}
          disabled={!duration}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          +10 s
        </button>
        <button
          type="button"
          aria-pressed={muted}
          onClick={() => {
            if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
          }}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          {t(muted ? "unmute" : "mute")}
        </button>
        <label className="flex items-center gap-2">
          <span className="sr-only">{t("volume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} %`}
            onChange={(event) => {
              const video = videoRef.current;
              if (video) {
                video.volume = Number(event.target.value);
                video.muted = video.volume === 0;
              }
            }}
            className="h-10 w-24 accent-dbz-orange"
          />
        </label>
        <button
          type="button"
          aria-pressed={theater}
          onClick={() => setTheater(!theater)}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          {t(theater ? "exitTheater" : "theater")}
        </button>
        <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {t("speed")}
          <select
            value={rate}
            onChange={(event) => {
              if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
            }}
            className="min-h-10 min-w-0 max-w-full rounded bg-zinc-900 p-2"
          >
            {VIDEO_PLAYBACK_RATES.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
        {levels.length > 1 && (
          <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {t("quality")}
            <select
              value={quality}
              onChange={(event) => {
                const value = Number(event.target.value);
                selectQuality(value);
              }}
              className="min-h-10 min-w-0 max-w-full rounded bg-zinc-900 p-2"
            >
              <option value={-1}>{t("automatic")}</option>
              {levels.map((level) => (
                <option key={level.index} value={level.index}>
                  {level.height > 0
                    ? `${level.height}p`
                    : t("bitrate", { rate: Math.round(level.bitrate / 1000) })}
                </option>
              ))}
            </select>
          </label>
        )}
        {audioTracks.length > 1 && (
          <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {t("audioTrack")}
            <select
              value={audioTrack}
              onChange={(event) => {
                const value = Number(event.target.value);
                selectAudioTrack(value);
              }}
              className="min-h-10 min-w-0 max-w-full rounded bg-zinc-900 p-2"
            >
              {audioTracks.map((track) => (
                <option key={track.index} value={track.index}>
                  {track.name || t("audioTrackNumber", { number: track.index + 1 })}
                </option>
              ))}
            </select>
          </label>
        )}
        {textTracks.length > 0 && (
          <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {t("captions")}
            <select
              value={caption}
              onChange={(event) => selectCaption(Number(event.target.value))}
              className="min-h-10 min-w-0 max-w-full rounded bg-zinc-900 p-2"
            >
              <option value={-1}>{t("captionsOff")}</option>
              {textTracks.map((track) => (
                <option key={track.index} value={track.index}>
                  {track.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {fullscreenSupported && (
          <button
            type="button"
            onClick={() => void fullscreen()}
            className="min-h-10 rounded border border-white/30 px-3"
          >
            {t("fullscreen")}
          </button>
        )}
        {pipSupported && (
          <button
            type="button"
            onClick={() => void pictureInPicture()}
            disabled={status !== "ready"}
            className="min-h-10 rounded border border-white/30 px-3"
          >
            {t("pictureInPicture")}
          </button>
        )}
        {status === "failed" && (
          <button
            type="button"
            onClick={retry}
            className="min-h-10 rounded bg-dbz-orange px-3 text-black"
          >
            {t("retryVideo")}
          </button>
        )}
      </div>
      <p
        role={status === "failed" ? "alert" : "status"}
        className="px-3 pb-3 text-xs text-white/70"
      >
        {waiting
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
      {actionError && (
        <p role="alert" className="px-3 pb-3 text-xs text-white/70">
          {t("videoActionUnavailable")}
        </p>
      )}
      <p className="px-3 pb-3 text-[11px] text-white/50">{t("videoKeyboardHelp")}</p>
    </div>
  );
}
