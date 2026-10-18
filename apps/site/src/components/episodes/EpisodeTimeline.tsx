"use client";

import { useEffect, useRef, useState } from "react";
import { useVideoUIText } from "@/lib/video-ui-text";

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
  const gifRequest = useRef<AbortController | null>(null);
  const base = `/api/episodes/${episodeId}/timeline`;

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(base, { signal: controller.signal });
        if (!response.ok) throw new Error("timeline_unavailable");
        const value: TimelineMetadata = await response.json();
        if (!Number.isSafeInteger(value.frameCount) || value.frameCount < 1 || !(value.fps > 0))
          throw new Error("invalid_timeline");
        if (!controller.signal.aborted) setMetadata(value);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    };
    void load();
    return () => controller.abort();
  }, [base]);

  useEffect(() => {
    const timer = setTimeout(() => setPreviewFrame(frame), 180);
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
    const controller = new AbortController();
    gifRequest.current = controller;
    setGifBusy(true);
    setGifFailed(false);
    try {
      const response = await fetch(`${base}?kind=gif&index=${frame}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("gif_unavailable");
      const blob = await response.blob();
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

  return (
    <section
      className="min-w-0 space-y-4 rounded-xl border border-border p-4"
      aria-label={t("timelineTitle")}
    >
      <h3 className="font-display text-lg font-bold">{t("timelineTitle")}</h3>
      <p className="text-sm text-muted-foreground">
        {t("timelineCount", { count: metadata.frameCount })}
      </p>
      <label className="flex flex-col gap-2">
        <span>
          {t("timelinePosition", { frame: selected + 1, time: timeLabel(selected / metadata.fps) })}
        </span>
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={selected}
          onChange={(event) => selectFrame(Number(event.target.value))}
        />
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
        alt={t("timelineFrame", { frame: preview + 1, time: timeLabel(preview / metadata.fps) })}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {indices.map((index) => (
          <button
            type="button"
            className="min-w-0 rounded border border-border p-1"
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
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-11 rounded border border-border px-3"
          disabled={start === 0}
          onClick={() => selectFrame(Math.max(0, start - 12 * stride))}
        >
          {t("timelinePreviousPage")}
        </button>
        <button
          type="button"
          className="min-h-11 rounded border border-border px-3"
          disabled={start + 12 * stride > last}
          onClick={() => selectFrame(Math.min(last, start + 12 * stride))}
        >
          {t("timelineNextPage")}
        </button>
        <button
          type="button"
          className="min-h-11 rounded bg-primary px-3 text-primary-foreground"
          disabled={gifBusy}
          onClick={() => void exportGif()}
        >
          {t(gifBusy ? "sceneEncoding" : "timelineGif")}
        </button>
      </div>
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
