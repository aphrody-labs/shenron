"use client";

// SPDX-License-Identifier: Apache-2.0
/**
 * "Continue watching": unfinished episodes and movies, merged between this device and the
 * signed-in account (`lib/watch-sync`). Renders nothing until there is real playback to resume,
 * and renders `null` on the server and on first client paint so cached HTML never diverges.
 *
 * Mounted on `/watchlist` and above the episode browser of `/wiki/episodes`; see
 * docs/products/streaming-replica-etat.md.
 */
import { useEffect, useState } from "react";
import { Croix } from "@aphrody/shenron-ui/icones";
import { resumable, type WatchEntry } from "@aphrody/shenron-api/contract";
import { WikiImg } from "@/components/wiki/WikiImg";
import { useT } from "@/components/T";
import { playbackTimeLabel, forgetPlaybackProgress } from "@/lib/playback-progress";
import { forgetWatchProgress, PLAYBACK_PROGRESS_EVENT, syncWatchProgress } from "@/lib/watch-sync";

export function ContinueWatchingRail({
  limit = 12,
  kinds,
  className = "",
}: {
  limit?: number;
  /** Restrict to some kinds (the episode catalogue only lists episodes). */
  kinds?: readonly WatchEntry["kind"][];
  className?: string;
}) {
  const t = useT();
  const kindsKey = kinds?.join(",") ?? "";
  const [items, setItems] = useState<WatchEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    const allowed = kindsKey ? kindsKey.split(",") : null;
    const load = async () => {
      const all = await syncWatchProgress();
      if (alive)
        setItems(
          resumable(all)
            .filter((e) => !allowed || allowed.includes(e.kind))
            .slice(0, limit),
        );
    };
    const onChange = () => void load();
    void load();
    // Local playback changes reload the device view; the account is reconciled once per mount.
    window.addEventListener(PLAYBACK_PROGRESS_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PLAYBACK_PROGRESS_EVENT, onChange);
    };
  }, [limit, kindsKey]);

  if (!items || items.length === 0) return null;
  const title = t("stream.continue.title");

  return (
    <section className={className} aria-label={title}>
      <h2 className="mb-3 flex items-baseline gap-2 font-display text-lg font-bold text-white sm:text-xl">
        <span className="inline-block h-4 w-1 rounded-full bg-dbz-orange" aria-hidden />
        {title}
      </h2>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((e) => (
          <li key={`${e.kind}:${e.id}`} className="relative shrink-0 snap-start">
            {/* Full page load: the player, not the catalogue quick look. */}
            <a
              href={e.href}
              className="group block w-[200px] overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange sm:w-[232px]"
            >
              <div className="relative aspect-video overflow-hidden bg-black/40">
                <WikiImg
                  src={e.image ?? null}
                  alt=""
                  sizes="232px"
                  className="absolute inset-0 h-full w-full object-cover object-top opacity-90"
                />
                <progress
                  className="absolute inset-x-0 bottom-0 h-1 w-full accent-dbz-orange"
                  value={e.seconds}
                  max={e.duration}
                  aria-label={e.title}
                />
              </div>
              <div className="p-2.5">
                <p className="truncate text-[13px] font-semibold text-white">{e.title}</p>
                {e.caption && (
                  <p className="mt-0.5 truncate text-[11px] text-white/70">{e.caption}</p>
                )}
                <p className="mt-1 text-xs tabular-nums text-white/80">
                  {playbackTimeLabel(e.seconds)} / {playbackTimeLabel(e.duration)}
                </p>
              </div>
            </a>
            <button
              type="button"
              onClick={() => {
                forgetPlaybackProgress(e.kind, e.id);
                void forgetWatchProgress(e.kind, e.id);
                setItems((current) =>
                  (current ?? []).filter((x) => !(x.kind === e.kind && x.id === e.id)),
                );
              }}
              aria-label={t("stream.continue.forget", { titre: e.title })}
              className="absolute right-0 top-0 grid size-11 place-items-center text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-dbz-orange"
            >
              <span className="grid size-7 place-items-center rounded-full bg-black/70">
                <Croix className="size-3.5" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
