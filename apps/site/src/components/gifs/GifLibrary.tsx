"use client";
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { gifTime, type GifPage, type PublicGif } from "@/lib/gif-catalog-contract";

function GifCard({
  item,
  first,
  revision,
}: {
  item: PublicGif;
  first: boolean;
  revision: string | null;
}) {
  const t = useTranslations("gifLibrary");
  const [playing, setPlaying] = useState(false);
  const label = t("clipAt", { time: gifTime(item.startSeconds) });
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-dbz-border bg-dbz-card">
      {/* A static poster is the default, including reduced motion; animation requires a gesture. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={playing ? item.gifUrl : item.posterUrl}
        alt={label}
        width={item.width}
        height={item.height}
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : undefined}
        className="mx-auto aspect-video h-auto w-auto max-w-full object-contain"
      />
      <div className="space-y-3 p-4">
        <h2 className="font-display text-lg text-os">{label}</h2>
        <p className="text-sm text-os/70">{t("duration", { seconds: item.durationSeconds })}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="dbz-button min-h-11"
            aria-pressed={playing}
            onClick={() => setPlaying(!playing)}
          >
            {t(playing ? "pause" : "animate")}
          </button>
          <a
            href={`/api/gifs/${item.key}/download${revision ? `?revision=${revision}` : ""}`}
            className="inline-flex min-h-11 items-center text-dbz-gold hover:underline"
            download={`${item.id}.gif`}
          >
            {t("download")}
          </a>
          <Link
            href={`/wiki/episodes/${item.episodeId}`}
            className="inline-flex min-h-11 items-center text-os/80 hover:underline"
          >
            {t("episode")}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function GifLibrary({ data, error = false }: { data: GifPage; error?: boolean }) {
  const t = useTranslations("gifLibrary");
  const locale = useLocale();
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (data.query) params.set("q", data.query);
    if (data.revision) params.set("revision", data.revision);
    return `/wiki/gifs?${params}`;
  };
  return (
    <div className="space-y-6">
      <search>
        <form method="get" action="/wiki/gifs" className="flex flex-wrap gap-3">
          <label htmlFor="gif-search" className="sr-only">
            {t("search")}
          </label>
          <input
            id="gif-search"
            type="search"
            name="q"
            maxLength={96}
            defaultValue={data.query}
            className="input min-w-0 flex-1"
            placeholder={t("search")}
          />
          <button className="dbz-button min-h-11" type="submit">
            {t("submit")}
          </button>
        </form>
      </search>
      {error ? (
        <output className="block">{t("unavailable")}</output>
      ) : !data.available ? (
        <output className="block">{t("empty")}</output>
      ) : data.items.length === 0 ? (
        <output className="block">{t("noResults")}</output>
      ) : (
        <>
          <p className="text-sm text-os/70">{t("count", { count: data.total })}</p>
          <div className="grid min-w-0 gap-6 md:grid-cols-2">
            {data.items.map((item, index) => (
              <GifCard
                key={`${data.revision}:${item.key}:${locale}`}
                item={item}
                revision={data.revision}
                first={index === 0}
              />
            ))}
          </div>
          <nav aria-label={t("pagination")} className="flex flex-wrap items-center gap-4">
            {data.page > 1 && (
              <Link href={pageHref(data.page - 1)} className="dbz-button">
                {t("previous")}
              </Link>
            )}
            <span>{t("page", { page: data.page, pages: data.pages })}</span>
            {data.page < data.pages && (
              <Link href={pageHref(data.page + 1)} className="dbz-button">
                {t("next")}
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
