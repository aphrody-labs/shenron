"use client";

import { useEffect, useRef, useState } from "react";
import { useVideoUIText } from "@/lib/video-ui-text";
import styles from "./EpisodeTimeline.module.css";

interface TimelineMetadata {
  durationSeconds: number;
  fps: number;
  frameCount: number;
  width: number;
  height: number;
}

function timeLabel(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(Math.floor((seconds % 1) * 1000)).padStart(3, "0")}`;
}

/** A virtual frame index spans the complete source without eagerly decoding it. */
export function EpisodeTimeline({ episodeId }: { episodeId: number }) {
  const t = useVideoUIText();
  const [metadata, setMetadata] = useState<TimelineMetadata | null>(null);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [stepSeconds, setStepSeconds] = useState(5);
  const [gif, setGif] = useState<string | null>(null);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifFailed, setGifFailed] = useState(false);
  const [duration, setDuration] = useState(2);
  const [gifFps, setGifFps] = useState(6);
  const [gifWidth, setGifWidth] = useState(320);
  const [previewFailed, setPreviewFailed] = useState(false);
  const gifRequest = useRef<AbortController | null>(null);
  const base = `/api/episodes/${episodeId}/timeline`;

  useEffect(() => {
    const controller = new AbortController();
    gifRequest.current?.abort();
    const load = async () => {
      try {
        const response = await fetch(base, { signal: controller.signal });
        if (!response.ok) throw new Error("timeline_unavailable");
        const value: TimelineMetadata = await response.json();
        if (
          !Number.isSafeInteger(value.frameCount) ||
          value.frameCount < 1 ||
          !Number.isFinite(value.fps) ||
          !(value.fps > 0) ||
          !Number.isFinite(value.durationSeconds) ||
          value.durationSeconds <= 0
        )
          throw new Error("invalid_timeline");
        if (!controller.signal.aborted) {
          setMetadata(value);
          setFailed(false);
          setFrame(0);
          setPreviewFrame(0);
          setGif(null);
          setGifBusy(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [base]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewFailed(false);
      setPreviewFrame(frame);
    }, 180);
    return () => clearTimeout(timer);
  }, [frame]);

  useEffect(() => () => gifRequest.current?.abort(), []);

  useEffect(
    () => () => {
      if (gif) URL.revokeObjectURL(gif);
    },
    [gif],
  );

  const selectFrame = (index: number) => {
    setFrame(index);
    const video = document.querySelector<HTMLVideoElement>(`video[data-episode-id="${episodeId}"]`);
    if (video && metadata && Number.isFinite(video.duration))
      video.currentTime = index / metadata.fps;
  };

  const exportGif = async () => {
    gifRequest.current?.abort();
    const controller = new AbortController();
    gifRequest.current = controller;
    setGifBusy(true);
    setGifFailed(false);
    try {
      const response = await fetch(
        `${base}?kind=gif&index=${frame}&duration=${duration}&fps=${gifFps}&width=${gifWidth}`,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("gif_unavailable");
      const blob = await response.blob();
      if (blob.type !== "image/gif") throw new Error("invalid_gif");
      if (!controller.signal.aborted) setGif(URL.createObjectURL(blob));
    } catch {
      if (!controller.signal.aborted) setGifFailed(true);
    } finally {
      if (!controller.signal.aborted) setGifBusy(false);
    }
  };

  if (failed) return <output>{t("timelineUnavailable")}</output>;
  if (!metadata) return <output>{t("timelineLoading")}</output>;
  const last = metadata.frameCount - 1;
  const selected = Math.min(frame, last);
  const preview = Math.min(previewFrame, last);
  const stride = stepSeconds === 0 ? 1 : Math.max(1, Math.round(stepSeconds * metadata.fps));
  const start = Math.floor(preview / (12 * stride)) * 12 * stride;
  const indices = Array.from({ length: 12 }, (_, index) => start + index * stride).filter(
    (index) => index <= last,
  );
  const clipStart = selected / metadata.fps;
  const clipDuration = Math.max(0, Math.min(duration, metadata.durationSeconds - clipStart));

  return (
    <section className={styles.root} aria-label={t("timelineTitle")}>
      <h3 className="font-display text-lg font-bold">{t("timelineTitle")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("timelineCount", { count: metadata.frameCount })}
      </p>
      <label className="flex flex-col gap-2">
        <span>
          {t("timelinePosition", { frame: selected + 1, time: timeLabel(selected / metadata.fps) })}
        </span>
        <input
          className={styles.scrubber}
          aria-valuetext={timeLabel(selected / metadata.fps)}
          type="range"
          min={0}
          max={last}
          step={1}
          value={selected}
          onChange={(event) => selectFrame(Number(event.target.value))}
        />
        <span className={styles.ruler} aria-hidden="true">
          <span>0:00</span>
          <span>{timeLabel(metadata.durationSeconds / 2)}</span>
          <span>{timeLabel(metadata.durationSeconds)}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          {t("timelineStep")}
          <select
            className="rounded border border-border bg-background p-2"
            value={stepSeconds}
            onChange={(event) => setStepSeconds(Number(event.target.value))}
          >
            <option value={5}>{t("timelineFiveSeconds")}</option>
            <option value={1}>{t("timelineOneSecond")}</option>
            <option value={0}>{t("timelineEveryFrame")}</option>
          </select>
        </label>
        <button
          type="button"
          className="min-h-11 rounded border border-border px-3"
          disabled={selected === 0}
          onClick={() => selectFrame(selected - 1)}
        >
          {t("timelinePreviousFrame")}
        </button>
        <button
          type="button"
          className="min-h-11 rounded border border-border px-3"
          disabled={selected === last}
          onClick={() => selectFrame(selected + 1)}
        >
          {t("timelineNextFrame")}
        </button>
      </div>
      <img
        className="aspect-video w-full max-w-2xl rounded bg-black object-contain"
        src={`${base}?kind=frame&index=${preview}`}
        onError={() => setPreviewFailed(true)}
        alt={t("timelineFrame", { frame: preview + 1, time: timeLabel(preview / metadata.fps) })}
      />
      {previewFailed && <p role="alert">{t("timelineFrameFailed")}</p>}
      <div className={styles.filmstrip} aria-label={t("timelineStep")}>
        {indices.map((index) => (
          <button
            type="button"
            className={styles.thumbnail}
            key={index}
            onClick={() => selectFrame(index)}
            aria-pressed={index === selected}
          >
            <img
              loading="lazy"
              className="aspect-video w-full rounded object-contain"
              src={`${base}?kind=frame&index=${index}`}
              alt={t("timelineFrame", { frame: index + 1, time: timeLabel(index / metadata.fps) })}
            />
            <span className="text-xs tabular-nums">{timeLabel(index / metadata.fps)}</span>
          </button>
        ))}
      </div>
      <div className={styles.controls}>
        <button
          type="button"
          disabled={start === 0}
          onClick={() => selectFrame(Math.max(0, start - 12 * stride))}
        >
          {t("timelinePreviousPage")}
        </button>
        <button
          type="button"
          disabled={start + 12 * stride > last}
          onClick={() => selectFrame(Math.min(last, start + 12 * stride))}
        >
          {t("timelineNextPage")}
        </button>
      </div>
      <fieldset className={styles.generator} disabled={gifBusy}>
        <legend>{t("timelineGifSettings")}</legend>
        <p>
          {t("timelineClipRange", {
            start: timeLabel(clipStart),
            end: timeLabel(clipStart + clipDuration),
            duration: clipDuration.toFixed(2),
          })}
        </p>
        <div className={styles.controls}>
          <label>
            {t("timelineGifDuration")}
            <select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {t("timelineSeconds", { count: value })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("timelineGifFps")}
            <select value={gifFps} onChange={(event) => setGifFps(Number(event.target.value))}>
              {[6, 12, 24].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("timelineGifWidth")}
            <select value={gifWidth} onChange={(event) => setGifWidth(Number(event.target.value))}>
              {[320, 480, 640].map((value) => (
                <option key={value} value={value}>
                  {t("timelinePixels", { count: value })}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="min-h-11 rounded bg-primary px-3 text-primary-foreground"
            disabled={gifBusy || clipDuration <= 0}
            onClick={() => void exportGif()}
          >
            {t(gifBusy ? "sceneEncoding" : "timelineGif")}
          </button>
        </div>
      </fieldset>
      {gifBusy && (
        <output className={styles.busy}>
          <progress aria-label={t("sceneEncoding")} />
          <span>{t("sceneEncoding")}</span>
          <button
            type="button"
            onClick={() => {
              gifRequest.current?.abort();
              setGifBusy(false);
            }}
          >
            {t("timelineGifCancel")}
          </button>
        </output>
      )}
      {gifFailed && <p role="alert">{t("timelineGifFailed")}</p>}
      {gif && (
        <div className="space-y-2">
          <img src={gif} alt={t("timelineGifPreview")} className="max-w-full rounded" />
          <a
            className="inline-flex min-h-11 items-center underline"
            href={gif}
            download={`episode-${episodeId}.gif`}
          >
            {t("sceneDownload")}
          </a>
        </div>
      )}
    </section>
  );
}
