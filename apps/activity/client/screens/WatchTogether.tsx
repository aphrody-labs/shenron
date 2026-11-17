// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@aphrody/shenron-activity/protocol";
import { formatNumber, translator } from "../i18n";
import {
  MEDIA_CATALOG,
  WATCH_STORAGE_KEY_PREFIX,
  type MediaItem,
  type MediaType,
  type WatchState,
} from "../media";
import type { GameState } from "../state";
import { Header } from "../ui";

interface WatchTogetherProps {
  state: GameState;
  locale: Locale;
  instanceId: string;
  channelId: string | null;
  onExit: () => void;
}

export function WatchTogetherScreen({
  state,
  locale,
  instanceId,
  channelId,
  onExit,
}: WatchTogetherProps) {
  const t = translator(locale);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [activeType, setActiveType] = useState<MediaType>("episode");
  const filteredMedia = MEDIA_CATALOG.filter((item) => item.type === activeType);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem>(
    filteredMedia[0] ?? MEDIA_CATALOG[0]!,
  );

  const storageKey = `${WATCH_STORAGE_KEY_PREFIX}${instanceId || channelId || "default"}`;

  const [watchState, setWatchState] = useState<WatchState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore storage errors
    }
    return {
      mediaId: selectedMedia.id,
      isPlaying: false,
      currentTime: 0,
      pageIndex: 0,
      updatedAt: Date.now(),
      updatedBy: state.you?.userId ?? "unknown",
    };
  });

  const broadcastState = (patch: Partial<WatchState>) => {
    const updated: WatchState = {
      ...watchState,
      ...patch,
      updatedAt: Date.now(),
      updatedBy: state.you?.userId ?? "unknown",
    };
    setWatchState(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {
      // Storage unavailable or full
    }
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey && e.newValue) {
        try {
          const next: WatchState = JSON.parse(e.newValue);
          setWatchState(next);
          if (next.mediaId !== selectedMedia.id) {
            const found = MEDIA_CATALOG.find((m) => m.id === next.mediaId);
            if (found) {
              setSelectedMedia(found);
              setActiveType(found.type);
            }
          }
          if (
            videoRef.current &&
            (next.mediaId.startsWith("ep-") || next.mediaId.startsWith("movie-"))
          ) {
            if (Math.abs(videoRef.current.currentTime - next.currentTime) > 1.5) {
              videoRef.current.currentTime = next.currentTime;
            }
            if (next.isPlaying && videoRef.current.paused) {
              void videoRef.current.play().catch(() => {});
            } else if (!next.isPlaying && !videoRef.current.paused) {
              videoRef.current.pause();
            }
          }
        } catch {
          // Ignore malformed payloads
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, selectedMedia.id]);

  const selectMedia = (media: MediaItem) => {
    setSelectedMedia(media);
    broadcastState({ mediaId: media.id, currentTime: 0, pageIndex: 0, isPlaying: false });
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
      broadcastState({ isPlaying: true, currentTime: video.currentTime });
    } else {
      video.pause();
      broadcastState({ isPlaying: false, currentTime: video.currentTime });
    }
  };

  const _onSeek = (time: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = time;
    broadcastState({ currentTime: time });
  };

  const setPage = (index: number) => {
    const total = selectedMedia.totalPages ?? 1;
    const clamped = Math.max(0, Math.min(total - 1, index));
    broadcastState({ pageIndex: clamped });
  };

  const isVideo = selectedMedia.type === "episode" || selectedMedia.type === "movie";
  const isReader = selectedMedia.type === "manga" || selectedMedia.type === "databook";

  return (
    <main className="screen watch-together" tabIndex={-1}>
      <Header
        locale={locale}
        aside={
          <button type="button" className="btn btn--ghost" onClick={onExit}>
            {t("watch.modeQuiz")}
          </button>
        }
      />
      <div className="watch-together__container">
        <header className="watch-together__topbar">
          <h2 className="panel__title">{t("watch.title")}</h2>
          <span className="chip chip--gold">{t("watch.syncNotice")}</span>
        </header>

        <section className="watch-together__type-selector">
          <button
            type="button"
            className={`toggle ${activeType === "episode" ? "is-on" : ""}`}
            onClick={() => {
              setActiveType("episode");
              const first = MEDIA_CATALOG.find((m) => m.type === "episode");
              if (first) selectMedia(first);
            }}
          >
            {t("watch.typeEpisode")}
          </button>
          <button
            type="button"
            className={`toggle ${activeType === "movie" ? "is-on" : ""}`}
            onClick={() => {
              setActiveType("movie");
              const first = MEDIA_CATALOG.find((m) => m.type === "movie");
              if (first) selectMedia(first);
            }}
          >
            {t("watch.typeMovie")}
          </button>
          <button
            type="button"
            className={`toggle ${activeType === "manga" ? "is-on" : ""}`}
            onClick={() => {
              setActiveType("manga");
              const first = MEDIA_CATALOG.find((m) => m.type === "manga");
              if (first) selectMedia(first);
            }}
          >
            {t("watch.typeManga")}
          </button>
          <button
            type="button"
            className={`toggle ${activeType === "databook" ? "is-on" : ""}`}
            onClick={() => {
              setActiveType("databook");
              const first = MEDIA_CATALOG.find((m) => m.type === "databook");
              if (first) selectMedia(first);
            }}
          >
            {t("watch.typeDatabook")}
          </button>
        </section>

        <div className="watch-together__media-list">
          <span className="field__label">{t("watch.mediaSelect")}</span>
          <div className="chips">
            {filteredMedia.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`toggle ${selectedMedia.id === m.id ? "is-on" : ""}`}
                onClick={() => selectMedia(m)}
              >
                {m.title[locale] ?? m.title.fr ?? m.title.en}
              </button>
            ))}
          </div>
        </div>

        <section className="watch-together__viewer panel">
          {isVideo && (
            <div className="watch-together__player-wrap">
              <video
                ref={videoRef}
                className="watch-together__video"
                src={selectedMedia.url}
                poster={selectedMedia.poster}
                controls
                playsInline
                onPlay={() =>
                  broadcastState({
                    isPlaying: true,
                    currentTime: videoRef.current?.currentTime ?? 0,
                  })
                }
                onPause={() =>
                  broadcastState({
                    isPlaying: false,
                    currentTime: videoRef.current?.currentTime ?? 0,
                  })
                }
                onSeeked={() => broadcastState({ currentTime: videoRef.current?.currentTime ?? 0 })}
              >
                <track kind="captions" srcLang="fr" label="Français (auto)" />
              </video>
              <div className="watch-together__controls">
                <button type="button" className="btn btn--primary" onClick={togglePlay}>
                  {watchState.isPlaying ? t("watch.pause") : t("watch.play")}
                </button>
              </div>
            </div>
          )}

          {isReader && (
            <div className="watch-together__reader-wrap">
              <div className="watch-together__page-nav">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={watchState.pageIndex <= 0}
                  onClick={() => setPage(watchState.pageIndex - 1)}
                >
                  {t("watch.prevPage")}
                </button>
                <span className="watch-together__page-counter">
                  {t("watch.pageCounter", {
                    current: formatNumber(locale, watchState.pageIndex + 1),
                    total: formatNumber(locale, selectedMedia.totalPages ?? 1),
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={watchState.pageIndex >= (selectedMedia.totalPages ?? 1) - 1}
                  onClick={() => setPage(watchState.pageIndex + 1)}
                >
                  {t("watch.nextPage")}
                </button>
              </div>
              <div className="watch-together__reader-page">
                {selectedMedia.pages?.[watchState.pageIndex] ? (
                  <img
                    src={selectedMedia.pages[watchState.pageIndex]}
                    alt={`Page ${watchState.pageIndex + 1}`}
                    className="watch-together__reader-img"
                  />
                ) : (
                  <img
                    src={selectedMedia.poster}
                    alt={selectedMedia.title[locale] ?? ""}
                    className="watch-together__reader-img"
                  />
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
