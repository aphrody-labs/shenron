"use client";
/* oxlint-disable jsx-a11y/media-has-caption, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role, react/exhaustive-effect-dependencies, react/set-state-in-effect -- reviewed: legacy patterns, behavior preserved */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { MaterialSymbol } from "@aphrody/shenron-ui/icones";
import styles from "./video-player.module.css";
import { useVideoSource } from "./use-video-source";
import {
  VIDEO_PLAYBACK_RATES,
  videoKeyAction,
  videoSeekTarget,
  isHlsSource,
} from "@/lib/video-controls";
import { nativeEpisodeVideoSource } from "@/lib/episode-video-source";
import { useVideoUIText } from "@/lib/video-ui-text";

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

/** Native controls remain the pre-hydration fallback; one enhanced toolbar owns playback. */
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
  const ui = useVideoUIText();
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
  const [enhanced, setEnhanced] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRevealOnly = useRef(false);
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!paused && !waiting && status === "ready")
      idleTimer.current = setTimeout(() => setControlsVisible(false), 2600);
  }, [paused, waiting, status]);
  useEffect(() => {
    revealControls();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [revealControls]);
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
    setEnhanced(true);
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

  useEffect(() => {
    if (!theater) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    containerRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [theater]);

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
    const settings = containerRef.current?.querySelector<HTMLDetailsElement>("details[open]");
    if (event.key === "Escape" && settings) {
      event.preventDefault();
      settings.open = false;
      settings.querySelector<HTMLElement>("summary")?.focus();
      return;
    }
    if (event.key === "Escape" && theater) {
      event.preventDefault();
      setTheater(false);
      return;
    }
    const target = event.target as HTMLElement;
    if (theater && event.key === "Tab") {
      const controls = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (target === first || target === containerRef.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && target === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
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
      onPointerMove={revealControls}
      onPointerDown={(event) => {
        pointerRevealOnly.current = event.pointerType !== "mouse" && !controlsVisible;
        revealControls();
      }}
      onFocusCapture={revealControls}
      className={`shenron-video ${styles.player}`}
      data-theater={theater}
      data-controls-visible={controlsVisible}
    >
      <header className={styles.heading}>
        <p>{title}</p>
        {(previousEpisode || nextEpisode) && (
          <nav aria-label={t("episodeNavigation")} className="flex gap-3 text-xs text-primary">
            {previousEpisode && (
              <Link
                href={previousEpisode.href}
                title={previousEpisode.label}
                className="rounded px-2 py-2 focus-visible:outline-2"
              >
                <MaterialSymbol name="skip_previous" />
                <span className="sr-only">{t("previousEpisode")}</span>
              </Link>
            )}
            {nextEpisode && (
              <Link
                href={nextEpisode.href}
                title={nextEpisode.label}
                className="rounded px-2 py-2 focus-visible:outline-2"
              >
                <MaterialSymbol name="skip_next" />
                <span className="sr-only">{t("nextEpisode")}</span>
              </Link>
            )}
          </nav>
        )}
      </header>
      <video
        ref={videoRef}
        src={isHlsSource(playbackSource) ? undefined : playbackSource}
        controls={!enhanced}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        poster={poster}
        aria-label={title}
        tabIndex={0}
        onClick={() => {
          if (pointerRevealOnly.current) {
            pointerRevealOnly.current = false;
            return;
          }
          if (enhanced) void playPause();
        }}
        onTimeUpdate={syncTimeline}
        onProgress={syncTimeline}
        onDurationChange={syncTimeline}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
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
      <div hidden={!enhanced} className={styles.overlay}>
        <div className="shenron-video-timeline">
          <div className="flex items-center justify-between gap-3">
            <span>
              {timeLabel(position)} / {timeLabel(duration)}
            </span>
            <span className="sr-only" data-buffer-label>
              {t("bufferedUntil", { time: timeLabel(buffered) })}
            </span>
          </div>
          <div className="shenron-video-buffer" aria-hidden="true">
            <div
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
              className="w-full"
            />
          </label>
        </div>
        <div className="shenron-video-controls" role="group" aria-label={ui("playbackControls")}>
          <button
            type="button"
            onClick={() => void playPause()}
            disabled={status === "failed"}
            data-primary
            aria-label={paused ? t("play") : t("pause")}
          >
            <MaterialSymbol name={paused ? "play_arrow" : "pause"} size={28} />
          </button>
          <button
            type="button"
            onClick={() => seek(-10)}
            disabled={!duration}
            aria-label={ui("backward")}
            className={styles.skip}
          >
            <MaterialSymbol name="replay_10" />
          </button>
          <button
            type="button"
            onClick={() => seek(10)}
            disabled={!duration}
            aria-label={ui("forward")}
            className={styles.skip}
          >
            <MaterialSymbol name="forward_10" />
          </button>
          <button
            type="button"
            aria-pressed={muted}
            aria-label={t(muted ? "unmute" : "mute")}
            onClick={() => {
              if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
            }}
          >
            <MaterialSymbol name={muted || volume === 0 ? "volume_off" : "volume_up"} />
          </button>
          <label className={styles.volume}>
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
              className="w-24"
            />
          </label>
          <button
            type="button"
            aria-pressed={theater}
            aria-label={t(theater ? "exitTheater" : "theater")}
            onClick={() => setTheater(!theater)}
          >
            <MaterialSymbol name="theaters" />
          </button>
          {fullscreenSupported && (
            <button type="button" aria-label={t("fullscreen")} onClick={() => void fullscreen()}>
              <MaterialSymbol name="fullscreen" />
            </button>
          )}
          {pipSupported && (
            <button
              type="button"
              onClick={() => void pictureInPicture()}
              disabled={status !== "ready"}
              aria-label={t("pictureInPicture")}
            >
              <MaterialSymbol name="picture_in_picture_alt" />
            </button>
          )}
        </div>
        <details className={styles.settings}>
          <summary aria-label={ui("playbackSettings")}>
            <MaterialSymbol name="settings" />
          </summary>
          <div className={styles.settingsPanel}>
            <label className={styles.mobileVolume}>
              {t("volume")}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)} %`}
                onChange={(event) => {
                  if (videoRef.current) {
                    videoRef.current.volume = Number(event.target.value);
                    videoRef.current.muted = Number(event.target.value) === 0;
                  }
                }}
              />
            </label>
            <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              {t("speed")}
              <select
                value={rate}
                onChange={(event) => {
                  if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
                }}
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
          </div>
        </details>
      </div>
      {status === "failed" && (
        <div className={styles.failure}>
          <button type="button" onClick={retry} data-primary>
            {t("retryVideo")}
          </button>
        </div>
      )}
      <p
        role={status === "failed" ? "alert" : "status"}
        className={status === "ready" && !waiting ? "sr-only" : styles.status}
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
      {actionError && (
        <p role="alert" className={styles.status}>
          {t("videoActionUnavailable")}
        </p>
      )}
      <p className="sr-only">{t("videoKeyboardHelp")}</p>
    </div>
  );
}
