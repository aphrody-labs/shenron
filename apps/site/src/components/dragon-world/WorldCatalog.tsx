// SPDX-License-Identifier: Apache-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Search } from "lucide-react";
import type { CatalogPage, CatalogSummary, CatalogDetail } from "@/lib/catalog-explorer-contract";
import { CatalogRecordContent } from "@/components/catalog/CatalogRecordContent";
import { worldCatalogUrl, worldImageUrl, worldPublicHref } from "./world-catalog";
import type fr from "../../../messages/dragon-world/fr.json";
import styles from "./dragon-world.module.css";

export function usePublicCatalog<T>(url: string | null, revision: number) {
  const [result, setResult] = useState<{
    url: string;
    revision: number;
    data?: T;
    error?: boolean;
  }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void fetch(url, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      credentials: "same-origin",
    })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<T>;
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ url, revision, data });
        return data;
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ url, revision, error: true });
      });
    return () => controller.abort();
  }, [url, revision]);
  return result?.url === url && result?.revision === revision ? result : undefined;
}

/** Shows a new view from its top and moves focus to its heading. */
function revealView(contents: HTMLDivElement | null, heading: HTMLHeadingElement | null) {
  contents?.scrollTo({ top: 0 });
  heading?.focus();
}

export default function WorldCatalog({ text, locale }: { text: typeof fr; locale: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const contents = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [record, setRecord] = useState<{ category: string; id: string } | null>(null);
  const summary = usePublicCatalog<CatalogSummary>(worldCatalogUrl(), revision);
  const listing = usePublicCatalog<CatalogPage>(
    category ? worldCatalogUrl({ category, page, q: query }) : null,
    revision,
  );
  const detail = usePublicCatalog<CatalogDetail>(record ? worldCatalogUrl(record) : null, revision);
  useEffect(() => revealView(contents.current, heading.current), []);
  /** Commits a view change, then reveals it once the heading shows the new view. */
  const changeView = (update: () => void) => {
    flushSync(update);
    revealView(contents.current, heading.current);
  };
  const categoryLabel = (key: string) =>
    Object.hasOwn(text.categories, key)
      ? text.categories[key as keyof typeof text.categories]
      : key;
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);
  const error = record ? detail?.error : category ? listing?.error : summary?.error;
  const loading = record ? !detail : category ? !listing : !summary;
  return (
    <div className={styles.catalog}>
      <header>
        <h2 ref={heading} tabIndex={-1}>
          {record
            ? (detail?.data?.title ?? text.loading)
            : category
              ? categoryLabel(category)
              : text.allCollections}
        </h2>
        {category && (
          <button
            type="button"
            aria-label={record ? text.backToResults : text.back}
            onClick={() => {
              if (record) {
                changeView(() => setRecord(null));
                return;
              }
              changeView(() => {
                setCategory(null);
                setSearch("");
                setQuery("");
              });
            }}
          >
            <ArrowLeft size={18} />
          </button>
        )}
      </header>
      {category && !record && (
        <label className={styles.search}>
          <Search size={17} />
          <input
            value={search}
            placeholder={text.search}
            aria-label={text.search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
      )}
      <div ref={contents} className={styles.catalogItems} aria-live="polite" aria-busy={loading}>
        {loading && <p>{text.loading}</p>}
        {error && (
          <div>
            <p>{text.error}</p>
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              {text.retry}
            </button>
          </div>
        )}
        {record && detail?.data && <CatalogRecordContent item={detail.data} />}
        {!record &&
          !category &&
          summary?.data?.categories.map((item) => (
            <button
              className={styles.collection}
              type="button"
              key={item.category}
              onClick={() =>
                changeView(() => {
                  setCategory(item.category);
                  setPage(1);
                })
              }
            >
              <span>{categoryLabel(item.category)}</span>
              <small>{item.total.toLocaleString(locale)}</small>
              <ChevronRight size={16} />
            </button>
          ))}
        {!record && category && listing?.data?.items.length === 0 && <p>{text.empty}</p>}
        {!record &&
          category &&
          listing?.data?.items.map((item) => {
            const href = worldPublicHref(item.href),
              image = worldImageUrl(item.image);
            return (
              href && (
                <a
                  key={`${item.category}:${item.id}`}
                  href={href}
                  className={styles.catalogItem}
                  aria-label={item.title}
                  onClick={(event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    changeView(() => setRecord({ category: item.category, id: item.id }));
                  }}
                >
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <BookOpen size={22} />
                  )}
                  <div>
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                  </div>
                  <ChevronRight size={16} />
                </a>
              )
            );
          })}
      </div>
      {!record && category && listing?.data && (
        <nav
          className={styles.pagination}
          aria-label={text.results.replace("{count}", String(listing.data.total))}
        >
          <button
            type="button"
            disabled={page <= 1}
            aria-label={text.previous}
            onClick={() => setPage((value) => value - 1)}
          >
            <ArrowLeft size={17} />
          </button>
          <output>
            {page} / {Math.max(1, Math.ceil(listing.data.total / listing.data.pageSize))}
          </output>
          <button
            type="button"
            disabled={page * listing.data.pageSize >= listing.data.total}
            aria-label={text.next}
            onClick={() => setPage((value) => value + 1)}
          >
            <ArrowRight size={17} />
          </button>
        </nav>
      )}
    </div>
  );
}
