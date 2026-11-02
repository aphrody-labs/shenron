"use client";

// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, Play, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/kit/EmptyState";
import { assetUrl } from "@/lib/assets";
import { FAVORITES_EVENT, readFavorites, syncFavorites, toggleFavorite } from "@/lib/favorites";
import type { Favorite } from "@/lib/favorites";
import {
  PLAYBACK_PROGRESS_EVENT,
  readPlaybackProgress,
  type PlaybackProgress,
} from "@/lib/playback-progress";
import { useMe } from "@/lib/use-me";

type Filter = "all" | "resume" | "todo" | "done";
type Sort = "recent" | "title";
type Status = "todo" | "resume" | "done";

interface Row {
  favorite: Favorite;
  percent: number;
  status: Status;
}

const FILTERS: readonly Filter[] = ["all", "resume", "todo", "done"];
const FILTER_KEY = {
  all: "filterAll",
  resume: "filterResume",
  todo: "filterTodo",
  done: "filterDone",
} as const;

const CHIP =
  "inline-flex min-h-11 items-center rounded-full px-4 text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";

function toRow(favorite: Favorite, progress: PlaybackProgress[]): Row {
  const entry = progress.find((p) => p.kind === favorite.kind && p.id === favorite.id);
  if (!entry) return { favorite, percent: 0, status: "todo" };
  const percent = Math.min(100, Math.round((entry.seconds / entry.duration) * 100));
  if (entry.completed) return { favorite, percent: 100, status: "done" };
  return { favorite, percent, status: percent > 0 ? "resume" : "todo" };
}

/**
 * Watchlist : les épisodes et films mis de côté (favoris, locaux d'abord et
 * synchronisés pour un compte connecté) croisés avec la progression de lecture
 * réellement enregistrée sur cet appareil.
 */
export function WatchlistClient() {
  const t = useTranslations("watchlistPage");
  const me = useMe();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    const refresh = () => {
      const progress = readPlaybackProgress();
      setRows(
        readFavorites()
          .filter((f) => f.kind === "episode" || f.kind === "movie")
          .map((f) => toRow(f, progress)),
      );
    };
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

  useEffect(() => {
    if (me?.authenticated) void syncFavorites();
  }, [me?.authenticated]);

  const visible = useMemo(() => {
    const kept = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
    return sort === "title"
      ? kept.toSorted((a, b) => a.favorite.title.localeCompare(b.favorite.title))
      : kept;
  }, [rows, filter, sort]);

  if (rows === null) {
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-6">
        <div className="h-11 animate-pulse rounded-full bg-dbz-card" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[16/11] animate-pulse rounded-xl bg-dbz-card" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration="senzu"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        actions={[
          { href: "/wiki/episodes", label: t("browseEpisodes") },
          { href: "/wiki/movies", label: t("browseMovies") },
        ]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-white/75">
        <p>
          {me === undefined ? null : me.authenticated ? (
            t("statusSynced")
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
        <div role="group" aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`${CHIP} ${
                filter === id
                  ? "bg-dbz-orange text-black"
                  : "border border-white/20 text-white/80 hover:border-dbz-gold hover:text-white"
              }`}
            >
              {t(FILTER_KEY[id])}
            </button>
          ))}
        </div>
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
          {visible.map(({ favorite: f, percent, status }) => {
            const cta = status === "resume" ? "resume" : status === "done" ? "rewatch" : "watch";
            return (
              <li
                key={`${f.kind}:${f.id}`}
                className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-dbz-card transition-colors hover:border-dbz-gold focus-within:border-dbz-gold"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                  {f.image ? (
                    <img
                      src={assetUrl(f.image)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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
                    <div
                      role="progressbar"
                      aria-label={t("progress", { percent })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      className="absolute inset-x-0 bottom-0 h-1.5 bg-black/70"
                    >
                      <div className="h-full bg-dbz-orange" style={{ width: `${percent}%` }} />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h2 className="line-clamp-2 font-display text-base font-bold leading-snug text-white">
                    {f.title}
                  </h2>
                  {f.caption && <p className="line-clamp-1 text-sm text-white/75">{f.caption}</p>}
                  {status !== "todo" && (
                    <p className="font-mono text-xs tabular-nums text-white/75">
                      {status === "done" ? t("done") : t("progress", { percent })}
                    </p>
                  )}
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
                  onClick={() => toggleFavorite(f)}
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
