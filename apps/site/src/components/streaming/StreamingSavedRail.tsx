"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import type { StreamingEpisode } from "@/lib/streaming-catalogue";
import { useStreamingListText } from "@/lib/streaming-list-text";
import { useMe } from "@/lib/use-me";
import { syncFavorites } from "@/lib/favorites";
import { readStreamingWatchlist, STREAMING_WATCHLIST_EVENT } from "@/lib/streaming-watchlist";
import { StreamRail } from "@/components/stream/StreamRail";
import { EmptyState } from "@/components/kit/EmptyState";
import { WikiImg } from "@/components/wiki/WikiImg";
import { useStreamingText } from "@/lib/streaming-text";
import { StreamingSaveButton } from "./StreamingSaveButton";
import styles from "./StreamingList.module.css";

export function StreamingSavedRail() {
  const t = useStreamingListText();
  const streamingText = useStreamingText();
  const me = useMe();
  const [episodes, setEpisodes] = useState<StreamingEpisode[] | null>(null);

  useEffect(() => {
    const update = () => setEpisodes(readStreamingWatchlist());
    const storage = () => update();
    update();
    window.addEventListener(STREAMING_WATCHLIST_EVENT, update);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(STREAMING_WATCHLIST_EVENT, update);
      window.removeEventListener("storage", storage);
    };
  }, []);

  useEffect(() => {
    if (me?.authenticated) void syncFavorites();
  }, [me?.authenticated]);

  return (
    <section
      id="streaming-my-list"
      aria-labelledby="streaming-my-list-title"
      className={styles.section}
    >
      <header className={styles.header}>
        <h2 id="streaming-my-list-title">{t("title")}</h2>
        <p>{t("device")}</p>
      </header>
      {episodes?.length ? (
        <StreamRail
          ariaLabel={t("title")}
          controls="always"
          previousLabel={streamingText("previousRail")}
          nextLabel={streamingText("nextRail")}
        >
          {episodes.map((episode) => (
            <article key={episode.id} className={styles.card}>
              <a
                href={`/wiki/episodes/${episode.id}`}
                aria-label={t("details", { title: episode.title })}
                className={styles.cardLink}
              >
                <div className={styles.image}>
                  {episode.image ? (
                    <WikiImg
                      src={episode.image}
                      alt=""
                      loading="lazy"
                      sizes="(min-width: 640px) 280px, 78vw"
                    />
                  ) : (
                    <Bookmark aria-hidden="true" />
                  )}
                </div>
                <h3>{episode.title}</h3>
                <p>
                  {episode.series}
                  {episode.number !== null ? ` · ${t("episode", { number: episode.number })}` : ""}
                </p>
              </a>
              <StreamingSaveButton episode={episode} />
            </article>
          ))}
        </StreamRail>
      ) : episodes !== null ? (
        <EmptyState
          title={t("empty")}
          description={t("emptyHint")}
          actions={[{ href: "#streaming-browse", label: streamingText("browse") }]}
        />
      ) : null}
    </section>
  );
}
