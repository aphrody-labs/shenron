"use client";

// SPDX-License-Identifier: Apache-2.0
import { useId } from "react";
import { Search } from "lucide-react";
import { useLangue } from "@/lib/i18n/client";
import { wikiCatalogueMessages } from "@/lib/wiki-catalogue-messages";
import styles from "./wiki-editorial.module.css";

export function WikiCatalogueToolbar({
  query,
  onQueryChange,
  value,
  onValueChange,
  options,
  searchLabel,
  filterLabel,
  count,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  searchLabel: string;
  filterLabel: string;
  count: number;
}) {
  const inputId = useId();
  const { locale } = useLangue();
  const t = wikiCatalogueMessages(locale);
  return (
    <div className={styles.catalogueToolbar}>
      <div className={styles.catalogueSearch}>
        <label htmlFor={inputId}>{searchLabel}</label>
        <div className={styles.catalogueSearchField}>
          <Search aria-hidden="true" size={18} />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("searchHint")}
          />
          {query && (
            <button type="button" onClick={() => onQueryChange("")}>
              {t("clear")}
            </button>
          )}
        </div>
      </div>
      <fieldset className={styles.catalogueFilters}>
        <legend>{filterLabel}</legend>
        <div>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              onClick={() => onValueChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
      <output className={styles.catalogueCount} aria-live="polite">
        {t("results", { count })}
      </output>
    </div>
  );
}
