"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { assetMirrorUrl, DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import { ArrowRight, Check, Gamepad2, ImageOff, Search, Star, X } from "lucide-react";
import { useLangue } from "@/lib/i18n/client";
import { assetUrl } from "@/lib/assets";
import { API_ORIGIN, ASSET_ORIGIN } from "@/lib/config";
import { isEditableAsset } from "@/lib/images";
import type { Game } from "@/lib/db-universe";
import {
  cleanExcerpt,
  selectGames,
  type PlatformGroup,
  type SortOption,
} from "@/lib/games-catalogue";
import fr from "../../../messages/games-catalogue/fr.json";
import en from "../../../messages/games-catalogue/en.json";
import ja from "../../../messages/games-catalogue/ja.json";
import styles from "./games-catalogue.module.css";
const dictionaries = { fr, en, ja };
const platforms: PlatformGroup[] = [
  "all",
  "playstation",
  "nintendo",
  "xbox",
  "pc",
  "mobile",
  "arcade",
];
const sorts: SortOption[] = ["date-desc", "date-asc", "rating-desc", "title-asc"];
const platformSet = new Set(platforms);
const sortSet = new Set(sorts);
const PAGE_SIZE = 24;
type Filters = { query: string; platform: PlatformGroup; sort: SortOption; page: number };
const initial: Filters = { query: "", platform: "all", sort: "date-desc", page: 1 };
function readFilters(): Filters {
  const p = new URLSearchParams(window.location.search);
  const platform = p.get("platform") as PlatformGroup;
  const sort = p.get("sort") as SortOption;
  const page = Number(p.get("page"));
  return {
    query: p.get("q") ?? "",
    platform: platformSet.has(platform) ? platform : "all",
    sort: sortSet.has(sort) ? sort : "date-desc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function GamesExplorer({
  games,
  ratings,
  heroImage,
  unavailable = false,
  navigation,
}: {
  games: Game[];
  ratings: Record<string, { average: number; count: number }>;
  heroImage?: string;
  unavailable?: boolean;
  navigation?: ReactNode;
}) {
  const { locale } = useLangue();
  const messages = dictionaries[locale];
  const t = (key: keyof typeof fr, values?: Record<string, string | number>) =>
    messages[key].replace(/\{(\w+)\}/g, (match, name: string) => String(values?.[name] ?? match));
  const [filters, setFilters] = useState<Filters>(initial);
  const [failedCovers, setFailedCovers] = useState<Set<string>>(() => new Set());
  const [fallbackCovers, setFallbackCovers] = useState<Set<string>>(() => new Set());
  const [heroFailed, setHeroFailed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restore = () => setFilters(readFilters());
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const update = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const url = new URL(window.location.href);
    for (const [key, value, defaultValue] of [
      ["q", next.query, ""],
      ["platform", next.platform, "all"],
      ["sort", next.sort, "date-desc"],
      ["page", String(next.page), "1"],
    ]) {
      if (value === defaultValue) url.searchParams.delete(key!);
      else url.searchParams.set(key!, value!);
    }
    window.history.replaceState(null, "", url);
  };
  const filtered = useMemo(
    () => selectGames(games, ratings, { ...filters, locale }),
    [games, ratings, filters, locale],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const featuredGames = games.filter((game) => game.cover).slice(0, 3);
  const cdnOrigin = ASSET_ORIGIN === API_ORIGIN ? DEFAULT_PUBLIC_ORIGINS.cdn : ASSET_ORIGIN;
  const coverSource = (cover: string) => {
    const primary = assetUrl(cover);
    return fallbackCovers.has(cover)
      ? (assetMirrorUrl(primary, cdnOrigin, API_ORIGIN) ?? primary)
      : primary;
  };
  const handleCoverFailure = (cover: string) => {
    if (!fallbackCovers.has(cover) && assetMirrorUrl(assetUrl(cover), cdnOrigin, API_ORIGIN)) {
      setFallbackCovers((previous) => new Set(previous).add(cover));
      return;
    }
    setFailedCovers((previous) => new Set(previous).add(cover));
  };
  const reset = () => update({ ...initial, sort: filters.sort });
  const changePage = (next: number) => {
    update({ page: next });
    resultsRef.current?.focus();
    resultsRef.current?.scrollIntoView({ block: "start" });
  };
  if (unavailable)
    return (
      <div className={`${styles.catalogue} ${styles.content}`}>
        <h1>{t("eyebrow")}</h1>
        <p>{t("unavailable")}</p>
        <button className={styles.primary} type="button" onClick={() => window.location.reload()}>
          {t("retry")}
        </button>
      </div>
    );
  return (
    <div className={styles.catalogue}>
      <header className={styles.hero}>
        {heroImage && !heroFailed && (
          <Image
            src={assetUrl(heroImage)}
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.heroImage}
            onError={() => setHeroFailed(true)}
          />
        )}
        <div className={styles.heroLayout}>
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}>{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p>{t("intro", { count: games.length })}</p>
            <div className={styles.heroLinks}>
              <a href="#games-catalogue" className={styles.primary}>
                {t("browse")}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
              <Link href="/games" className={styles.secondary}>
                {t("miniGames")}
              </Link>
            </div>
          </div>
          {featuredGames.length > 0 && (
            <div className={styles.featuredCovers} aria-hidden="true">
              {featuredGames.map((game, index) => (
                <div className={styles.featuredCover} data-position={index} key={game.id}>
                  {!failedCovers.has(game.cover!) && (
                    <Image
                      src={coverSource(game.cover!)}
                      alt=""
                      fill
                      unoptimized={isEditableAsset(game.cover)}
                      sizes="(max-width: 640px) 28vw, 160px"
                      onError={() => handleCoverFailure(game.cover!)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className={styles.content}>
        {navigation && <div className={styles.navigation}>{navigation}</div>}
        <section className={styles.toolbar} id="games-catalogue" aria-label={t("catalogue")}>
          <div className={styles.controls}>
            <div className={styles.search}>
              <label htmlFor="game-search">{t("search")}</label>
              <div>
                <Search size={20} aria-hidden="true" />
                <input
                  id="game-search"
                  ref={searchRef}
                  type="search"
                  value={filters.query}
                  onChange={(e) => update({ query: e.target.value, page: 1 })}
                  placeholder={t("placeholder")}
                />
                {filters.query && (
                  <button
                    type="button"
                    aria-label={t("clear")}
                    onClick={() => {
                      update({ query: "", page: 1 });
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
            <div className={styles.sort}>
              <label htmlFor="games-sort">{t("sort")}</label>
              <select
                id="games-sort"
                value={filters.sort}
                onChange={(e) => update({ sort: e.target.value as SortOption, page: 1 })}
              >
                <option value="date-desc">{t("recent")}</option>
                <option value="date-asc">{t("oldest")}</option>
                <option value="rating-desc">{t("rating")}</option>
                <option value="title-asc">{t("alphabetical")}</option>
              </select>
            </div>
          </div>
          <fieldset className={styles.platforms}>
            <legend>{t("platform")}</legend>
            {platforms.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={filters.platform === group}
                onClick={() => update({ platform: group, page: 1 })}
              >
                {filters.platform === group && <Check size={15} aria-hidden="true" />}
                {t(group)}
              </button>
            ))}
          </fieldset>
        </section>
        <div className={styles.results}>
          <h2 ref={resultsRef} tabIndex={-1}>
            {t("catalogue")}
          </h2>
          <output aria-live="polite" aria-atomic="true">
            {t(filtered.length === 1 ? "resultsOne" : "results", {
              count: filtered.length,
              total: games.length,
            })}
          </output>
          {(filters.query || filters.platform !== "all") && (
            <button type="button" onClick={reset}>
              {t("reset")}
            </button>
          )}
        </div>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            <Gamepad2 size={40} aria-hidden="true" />
            <h3>{t("emptyTitle")}</h3>
            <p>{t("emptyDescription")}</p>
            <button type="button" className={styles.primary} onClick={reset}>
              {t("showAll")}
            </button>
          </div>
        ) : (
          <ul className={styles.grid}>
            {visible.map((game) => {
              const rating = ratings[String(game.id)];
              const names = [
                ...new Set(
                  (game.platforms ?? "")
                    .split(/[,;]/)
                    .map((p) => p.trim())
                    .filter(Boolean),
                ),
              ];
              return (
                <li key={game.id}>
                  <article className={styles.card}>
                    <Link
                      href={`/wiki/games/${game.slug}`}
                      aria-label={t("open", { title: game.title })}
                    >
                      <div className={styles.cover}>
                        {game.cover && !failedCovers.has(game.cover) ? (
                          <Image
                            src={coverSource(game.cover)}
                            unoptimized={isEditableAsset(game.cover)}
                            alt=""
                            fill
                            loading="lazy"
                            sizes="(max-width: 640px) 85vw, (max-width: 1024px) 45vw, 25vw"
                            className={styles.coverImage}
                            ref={(image) => {
                              if (image?.complete && image.currentSrc && image.naturalWidth === 0)
                                handleCoverFailure(game.cover!);
                            }}
                            onError={() => handleCoverFailure(game.cover!)}
                          />
                        ) : (
                          <div className={styles.noCover}>
                            <ImageOff size={40} aria-hidden="true" />
                            <span>{t("noCover")}</span>
                          </div>
                        )}
                      </div>
                      <div className={styles.cardBody}>
                        <div className={styles.meta}>
                          <span>
                            {game.release_date !== null && Number.isFinite(game.release_date)
                              ? new Date(game.release_date * 1000).getUTCFullYear()
                              : t("noDate")}
                          </span>
                          {rating && rating.count > 0 ? (
                            <span>
                              <Star size={14} aria-hidden="true" />
                              {new Intl.NumberFormat(locale, {
                                maximumFractionDigits: 1,
                                minimumFractionDigits: 1,
                              }).format(rating.average)}{" "}
                              / 5 · {t("votes", { count: rating.count })}
                            </span>
                          ) : (
                            <span>{t("noRating")}</span>
                          )}
                        </div>
                        <h3>{game.title}</h3>
                        {game.title_ja && (
                          <p className={styles.japanese} lang="ja">
                            {game.title_ja}
                          </p>
                        )}
                        {game.description && (
                          <p className={styles.description}>{cleanExcerpt(game.description)}</p>
                        )}
                        {names.length > 0 && (
                          <ul className={styles.badges} aria-label={t("platform")}>
                            {names.map((name) => (
                              <li key={name}>{name}</li>
                            ))}
                          </ul>
                        )}
                        <dl className={styles.details}>
                          {game.developer && (
                            <div>
                              <dt>{t("studio")}</dt>
                              <dd>{game.developer}</dd>
                            </div>
                          )}
                          {game.publisher && (
                            <div>
                              <dt>{t("publisher")}</dt>
                              <dd>{game.publisher}</dd>
                            </div>
                          )}
                        </dl>
                        <span className={styles.cardAction}>
                          {t("details")}
                          <ArrowRight size={18} aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        {totalPages > 1 && (
          <nav className={styles.pagination} aria-label={t("pagination")}>
            <button type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>
              {t("previous")}
            </button>
            <span>{t("page", { page, total: totalPages })}</span>
            <button
              type="button"
              disabled={page === totalPages}
              onClick={() => changePage(page + 1)}
            >
              {t("next")}
            </button>
          </nav>
        )}
        <details className={styles.canon}>
          <summary>{t("canonTitle")}</summary>
          <p>{t("canonDescription")}</p>
          <Link href="/wiki/canon">
            {t("canonLink")}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </details>
      </div>
    </div>
  );
}
