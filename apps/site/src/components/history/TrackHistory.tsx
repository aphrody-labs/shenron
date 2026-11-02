"use client";

/**
 * Records a server page's local visit and binds native playback to its watch layout.
 * The hidden marker scopes observation to the current episode rather than hero media.
 * Unlike TrackView telemetry, this writes only to device storage and sends nothing.
 */
import { useEffect, useRef } from "react";
import { recordHistory, type HistoryKind } from "@/lib/history";
import { observePlaybackProgress } from "@/lib/playback-progress";
import { syncWatchProgress } from "@/lib/watch-sync";

export function TrackHistory({
  kind,
  id,
  title,
  href,
  image,
  caption,
}: {
  kind: HistoryKind;
  id: string | number;
  title: string;
  href: string;
  image?: string | null;
  caption?: string | null;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    recordHistory({ kind, id: String(id), title, href, image, caption });
  }, [kind, id, title, href, image, caption]);
  useEffect(() => {
    if ((kind !== "episode" && kind !== "movie") || !marker.current) return;
    // Reconcile with the account on arrival and again once this item's progress is saved.
    void syncWatchProgress();
    const stop = observePlaybackProgress(marker.current, kind, String(id), href);
    return () => {
      stop();
      void syncWatchProgress();
    };
  }, [kind, id, href]);
  return <span ref={marker} hidden aria-hidden="true" />;
}
