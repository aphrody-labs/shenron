"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { useVideoSource } from "./use-video-source";
import { VIDEO_PLAYBACK_RATES, videoKeyAction, videoSeekTarget } from "@/lib/video-controls";

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
  onError?: () => void;
}
function trackUrl(src: string): string {
  return /^https?:\/\//i.test(src)
    ? src
    : `/api/subtitles?src=${encodeURIComponent(src.replace(/^\.?\/*/, ""))}`;
}

/** Native controls stay available; HLS menus expose only observed renditions. */
export function VideoPlayer({ src, title, poster, subtitles, onError }: VideoPlayerProps) {
  const t = useTranslations("mediaPlayback");
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    status,
    levels,
    quality,
    selectQuality,
    audioTracks,
    audioTrack,
    selectAudioTrack,
    retry,
  } = useVideoSource(videoRef, src, onError);
  const rateRef = useRef(1);
  const [paused, setPaused] = useState(true);
  const [rate, setRate] = useState(1);
  const [caption, setCaption] = useState(-1);
  const [textTracks, setTextTracks] = useState<{ index: number; label: string }[]>([]);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [actionError, setActionError] = useState(false);
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
    setPaused(true);
    setActionError(false);
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
    if (!video) return;
    Array.from(video.textTracks).forEach((track, i) => {
      track.mode = i === index ? "showing" : "disabled";
    });
    setCaption(index);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
      className="dbz-panel relative overflow-hidden rounded-xl border border-amber-500/30 bg-black p-0 shadow-lg focus-visible:outline-2 focus-visible:outline-amber-400"
    >
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        poster={poster}
        title={title}
        className="aspect-video w-full rounded-xl bg-black"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.playbackRate = rateRef.current;
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
      <div className="flex flex-wrap items-center gap-3 p-3 text-xs text-white">
        <button
          type="button"
          onClick={() => void playPause()}
          disabled={status === "failed"}
          className="min-h-10 rounded border border-white/30 px-3"
        >
          {paused ? t("play") : t("pause")}
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
        {t(
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
