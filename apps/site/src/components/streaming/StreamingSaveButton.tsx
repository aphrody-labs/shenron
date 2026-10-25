"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { StreamingEpisode } from "@/lib/streaming-catalogue";
import { useStreamingListText } from "@/lib/streaming-list-text";
import { useMe } from "@/lib/use-me";
import { syncFavorites } from "@/lib/favorites";
import {
  readStreamingWatchlist,
  STREAMING_WATCHLIST_EVENT,
  toggleStreamingWatchlist,
} from "@/lib/streaming-watchlist";
import styles from "./StreamingList.module.css";

export function StreamingSaveButton({
  episode,
  compact = false,
}: {
  episode: StreamingEpisode;
  compact?: boolean;
}) {
  const t = useStreamingListText();
  const me = useMe();
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const update = () => setSaved(readStreamingWatchlist().some((item) => item.id === episode.id));
    const storage = () => update();
    update();
    window.addEventListener(STREAMING_WATCHLIST_EVENT, update);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(STREAMING_WATCHLIST_EVENT, update);
      window.removeEventListener("storage", storage);
    };
  }, [episode.id]);

  useEffect(() => {
    if (me?.authenticated) void syncFavorites();
  }, [me?.authenticated]);

  return (
    <div className={styles.saveWrap}>
      <button
        type="button"
        className={styles.save}
        data-compact={compact || undefined}
        aria-pressed={saved}
        aria-label={t(saved ? "removeLabel" : "addLabel", { title: episode.title })}
        onClick={() => setFailed(!toggleStreamingWatchlist(episode))}
      >
        {saved ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        <span className={compact ? "sr-only" : undefined}>{t(saved ? "saved" : "add")}</span>
      </button>
      {failed && <output className={styles.error}>{t("storageError")}</output>}
    </div>
  );
}
