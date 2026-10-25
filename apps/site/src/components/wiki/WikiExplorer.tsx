"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type KeyboardEvent } from "react";
import { BookOpen, ChevronDown, Search } from "lucide-react";
import { useWikiExplorerText as useT } from "@/lib/wiki-explorer-text";
import type { WikiCategory } from "@/lib/wiki-categories";
import styles from "./WikiExplorer.module.css";

/** A persistent way to search and leave a deep article without opening the site menu. */
export function WikiExplorer({
  categories,
}: {
  categories: readonly Pick<WikiCategory, "key" | "href">[];
}) {
  const t = useT();
  const pathname = usePathname();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && disclosure.current?.open) {
      disclosure.current.open = false;
      disclosure.current.querySelector("summary")?.focus();
    }
  };
  const current = categories.find(
    (category) => pathname === category.href || pathname.startsWith(`${category.href}/`),
  );

  return (
    <div className={styles.explorer}>
      <div className={styles.topline}>
        <Link
          href="/wiki"
          className={styles.home}
          aria-current={pathname === "/wiki" ? "page" : undefined}
        >
          <BookOpen size={20} aria-hidden="true" />
          <span>{t("wikiExplorer.home")}</span>
        </Link>
        {current && (
          <span className={styles.current}>{t(`wikiExplorer.categories.${current.key}`)}</span>
        )}
        <details className={styles.browse} ref={disclosure}>
          <summary onKeyDown={closeOnEscape}>
            {t("wikiExplorer.browse")}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <nav aria-label={t("wikiExplorer.navigation")} className={styles.directory}>
            {categories.map((category) => (
              <Link
                key={category.key}
                href={category.href}
                aria-current={current?.key === category.key ? "location" : undefined}
                onKeyDown={closeOnEscape}
                onClick={() => {
                  if (disclosure.current) disclosure.current.open = false;
                }}
              >
                {t(`wikiExplorer.categories.${category.key}`)}
              </Link>
            ))}
          </nav>
        </details>
      </div>
      <search className={styles.search} aria-label={t("wikiExplorer.searchLabel")}>
        <form action="/wiki/search" method="get">
          <label htmlFor="wiki-explorer-query">{t("wikiExplorer.searchLabel")}</label>
          <div className={styles.searchRow}>
            <div className={styles.field}>
              <Search size={20} aria-hidden="true" />
              <input
                id="wiki-explorer-query"
                type="search"
                name="q"
                placeholder={t("wikiExplorer.placeholder")}
                maxLength={200}
                required
              />
            </div>
            <button type="submit">{t("wikiExplorer.search")}</button>
          </div>
        </form>
      </search>
    </div>
  );
}
