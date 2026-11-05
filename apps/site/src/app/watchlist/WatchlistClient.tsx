"use client";

// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Bookmark, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ContinueWatchingRail } from "@/components/continue-watching/ContinueWatchingRail";
import { EmptyState } from "@/components/kit/EmptyState";
import { assetUrl } from "@/lib/assets";
import {
  FAVORITES_EVENT,
  isFavorited,
  readFavorites,
  syncFavorites,
  toggleFavorite,
} from "@/lib/favorites";
import {
  PLAYBACK_PROGRESS_EVENT,
  playbackTimeLabel,
  readPlaybackProgress,
} from "@/lib/playback-progress";
import { useMe } from "@/lib/use-me";
import {
  applyView,
  filterFromQuery,
  readWatchlistPayload,
  rowKey,
  rowsFromLocal,
  rowsFromRemote,
  type WatchlistFilter,
  type WatchlistRow,
  type WatchlistSort,
} from "@/lib/watchlist-rows";
import type { WatchlistItem } from "@/lib/watchlist-view";

const FILTERS: readonly WatchlistFilter[] = ["all", "watching", "planned", "completed"];
const FILTER_KEY = {
  all: "filterAll",
  watching: "filterResume",
  planned: "filterTodo",
  completed: "filterDone",
} as const;

const noSubscription = () => () => undefined;
const locationSearch = () => window.location.search;
const serverSearch = () => null;

const CHIP =
  "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";

/**
 * Watchlist : pour un compte connecté, la liste vient de `/api/watchlist` (favoris du compte
 * joints à la progression synchronisée, statut dérivé) ; hors connexion, ou si le compte est
 * injoignable, elle vient de l’appareil (favoris et progression locaux). Le filtre suit
 * `?status=planned|watching|completed`.
 */
export function WatchlistClient() {
  const t = useTranslations("watchlistPage");
  const tr = useTranslations();
  const me = useMe();
  const authenticated = me?.authenticated === true;
  const [local, setLocal] = useState<WatchlistRow[] | null>(null);
  const [remote, setRemote] = useState<WatchlistItem[] | null>(null);
  const [remoteFailed, setRemoteFailed] = useState(false);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  // `?status=` is read after hydration; an explicit choice then takes precedence.
  const search = useSyncExternalStore(noSubscription, locationSearch, serverSearch);
  const [chosenFilter, setFilter] = useState<WatchlistFilter | null>(null);
  const filter =
    chosenFilter ??
    (search === null ? "all" : filterFromQuery(new URLSearchParams(search).get("status")));
  const [sort, setSort] = useState<WatchlistSort>("recent");
  const requested = useRef(false);

  const chooseFilter = (next: WatchlistFilter) => {
    setFilter(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", next);
    window.history.replaceState(window.history.state, "", url);
  };

  useEffect(() => {
    const refresh = () => setLocal(rowsFromLocal(readFavorites(), readPlaybackProgress()));
    refresh();
    window.addEventListener(FAVORITES_EVENT, refresh);
    window.addEventListener(PLAYBACK_PROGRESS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FAVORITES_EVENT, refresh);
      window.removeEventListener(PLAYBACK_PROGRESS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const loadRemote = useCallback(async () => {
    try {
      const response = await fetch("/api/watchlist", {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      const items = response.ok ? readWatchlistPayload(await response.json()) : null;
      if (items) {
        setRemote(items);
        setRemoteFailed(false);
      } else setRemoteFailed(true);
    } catch {
      setRemoteFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void syncFavorites();
    if (!requested.current) {
      requested.current = true;
      void loadRemote();
    }
    // Playback elsewhere on the page moves statuses: reload the account view.
    const onPlayback = () => void loadRemote();
    window.addEventListener(PLAYBACK_PROGRESS_EVENT, onPlayback);
    return () => window.removeEventListener(PLAYBACK_PROGRESS_EVENT, onPlayback);
  }, [authenticated, loadRemote]);

  const accountView = authenticated && remote !== null && !remoteFailed;
  const pending = me === undefined || (authenticated && remote === null && !remoteFailed);
  const rows = useMemo(() => {
    if (pending) return null;
    if (accountView) return rowsFromRemote(remote, hidden);
    return local;
  }, [pending, accountView, remote, hidden, local]);

  const visible = useMemo(() => applyView(rows ?? [], filter, sort), [rows, filter, sort]);

  const remove = (row: WatchlistRow) => {
    setHidden((current) => new Set(current).add(rowKey(row)));
    // The account view can list items this device has not merged yet: never toggle blindly.
    void (async () => {
      await syncFavorites();
      if (isFavorited(row.favorite.kind, row.favorite.id)) toggleFavorite(row.favorite);
    })();
  };

  if (rows === null) {
    return (
      <output aria-label={t("loading")} className="flex flex-col gap-6">
        <div className="h-11 animate-pulse motion-reduce:animate-none rounded-full bg-dbz-card" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-[16/11] animate-pulse motion-reduce:animate-none rounded-xl bg-dbz-card"
            />
          ))}
        </div>
      </output>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <ContinueWatchingRail />
        <EmptyState
          illustration="senzu"
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          actions={[
            { href: "/wiki/episodes", label: t("browseEpisodes") },
            { href: "/wiki/movies", label: t("browseMovies") },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ContinueWatchingRail />
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-white/75">
        <p>
          {me === undefined ? null : accountView ? (
            t("statusSynced")
          ) : authenticated ? (
            t("statusUnavailable")
          ) : (
            <>
              {t("statusDevice")}{" "}
              <Link
                href="/signin?callbackURL=/watchlist"
                className="inline-flex min-h-11 items-center font-bold text-dbz-gold underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
              >
                {t("signIn")}
              </Link>
            </>
          )}
        </p>
        <p className="font-mono tabular-nums">{t("count", { count: rows.length })}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset aria-label={t("filterLabel")} className="flex min-w-0 flex-wrap gap-2">
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => chooseFilter(id)}
              className={`${CHIP} ${
                filter === id
                  ? "bg-dbz-orange text-black"
                  : "border border-white/20 text-white/80 hover:border-dbz-gold hover:text-white"
              }`}
            >
              {t(FILTER_KEY[id])}
            </button>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-white/75">
          <span>{t("sortLabel")}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value === "title" ? "title" : "recent")}
            className="min-h-11 rounded-xl border border-white/20 bg-dbz-card px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
          >
            <option value="recent">{t("sortRecent")}</option>
            <option value="title">{t("sortTitle")}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          illustration="ki"
          title={t("emptyFilter")}
          actions={[{ href: "/watchlist", label: t("resetFilter") }]}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => {
            const { favorite: f, percent, status, seconds } = row;
            const cta =
              status === "watching" ? "resume" : status === "completed" ? "rewatch" : "watch";
            return (
              <li
                key={rowKey(row)}
                className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-dbz-card transition-colors hover:border-dbz-gold focus-within:border-dbz-gold"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                  {f.image ? (
                    <img
                      src={assetUrl(f.image)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-white/50">
                      <Bookmark aria-hidden className="h-8 w-8" />
                    </div>
                  )}
                  <span className="absolute left-2.5 top-2.5 rounded bg-black/75 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-dbz-gold ring-1 ring-white/10">
                    {f.kind === "movie" ? t("kindMovie") : t("kindEpisode")}
                  </span>
                  {percent > 0 && (
                    <progress
                      aria-label={t("progress", { percent })}
                      max={100}
                      value={percent}
                      className="absolute inset-x-0 bottom-0 block h-1.5 w-full appearance-none bg-black/70 [&::-moz-progress-bar]:bg-dbz-orange [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-dbz-orange"
                    />
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h2 className="line-clamp-2 font-display text-base font-bold leading-snug text-white">
                    {f.title}
                  </h2>
                  {f.caption && <p className="line-clamp-1 text-sm text-white/75">{f.caption}</p>}
                  <p className="font-mono text-xs tabular-nums text-white/75">
                    <span className="font-bold uppercase tracking-wider text-dbz-gold">
                      {tr(`stream.status.${status}`)}
                    </span>
                    {status === "watching" && (
                      <>
                        {" · "}
                        {t("progress", { percent })}
                        {seconds > 0 && (
                          <>
                            {" · "}
                            {tr("stream.watchlist.resumeAt", { time: playbackTimeLabel(seconds) })}
                          </>
                        )}
                      </>
                    )}
                  </p>
                  <Link
                    href={f.href}
                    aria-label={`${t(cta)} · ${f.title}`}
                    className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-dbz-orange px-5 text-sm font-bold text-black transition-colors hover:bg-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange after:absolute after:inset-0 after:content-['']"
                  >
                    <Play aria-hidden className="h-4 w-4" fill="currentColor" />
                    {t(cta)}
                  </Link>
                </div>

                <button
                  type="button"
                  aria-label={t("remove", { title: f.title })}
                  onClick={() => remove(row)}
                  className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white/85 transition-colors hover:bg-black/85 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
