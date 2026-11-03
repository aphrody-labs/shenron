"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import type { Item } from "@/lib/db-universe";
import { useLangue } from "@/lib/i18n/client";
import { wikiCatalogueMessages, type WikiCatalogueMessage } from "@/lib/wiki-catalogue-messages";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiDiscoveryCard } from "./WikiDiscoveryCard";
import styles from "./wiki-editorial.module.css";

const CATEGORIES = ["technologie", "relique_magique", "vehicule", "armement", "medical"] as const;

export function ItemsGrid({ items }: { items: Item[]; fallbackImage?: string }) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const { locale } = useLangue();
  const t = wikiCatalogueMessages(locale);
  const categoryLabel = (category: string) =>
    CATEGORIES.includes(category as (typeof CATEGORIES)[number])
      ? t(category as WikiCatalogueMessage)
      : category;
  const options = [
    { value: "ALL", label: t("all") },
    ...[...new Set([...CATEGORIES, ...items.map((item) => item.category)])].map((value) => ({
      value,
      label: categoryLabel(value),
    })),
  ];
  const filtered = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    return items.filter(
      (item) =>
        (selectedCategory === "ALL" || item.category === selectedCategory) &&
        (!q ||
          [item.name, item.name_ja, item.creator, item.description].some((value) =>
            value?.toLocaleLowerCase().includes(q),
          )),
    );
  }, [items, query, selectedCategory]);
  return (
    <div className="space-y-6">
      <WikiCatalogueToolbar
        query={query}
        onQueryChange={setQuery}
        value={selectedCategory}
        onValueChange={setSelectedCategory}
        options={options}
        searchLabel={t("searchItems")}
        filterLabel={t("categories")}
        count={filtered.length}
      />
      <div className={styles.topicGrid}>
        {filtered.map((item) => (
          <WikiDiscoveryCard
            key={item.slug}
            href={"/wiki/items/" + item.slug}
            title={item.name}
            subtitle={item.name_ja}
            image={item.image}
            description={item.description}
            meta={[categoryLabel(item.category), item.creator].filter(Boolean).join(" · ")}
            detail={item.debut_chapter ? t("debut") + " · " + item.debut_chapter : t("explore")}
            category="items"
            layout="grid"
            headingLevel={2}
          />
        ))}
      </div>
      {filtered.length === 0 && <p className={styles.catalogueEmpty}>{t("empty")}</p>}
    </div>
  );
}
