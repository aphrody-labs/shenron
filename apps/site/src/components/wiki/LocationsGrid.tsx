"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import type { Location } from "@/lib/db-universe";
import { useLangue } from "@/lib/i18n/client";
import { useT } from "@/components/T";
import { onTablistKeyDown } from "@/lib/tablist-keys";
import { wikiCatalogueMessages } from "@/lib/wiki-catalogue-messages";
import { mergeArticleAndColumnEvents } from "@/lib/wiki-internal-sources";
import { isCosmologyLocation } from "./CosmologyAtlas";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiDiscoveryCard } from "./WikiDiscoveryCard";
import styles from "./wiki-editorial.module.css";

type MacroScope = "ALL" | "COSMOLOGY" | "PLANETS" | "EARTH";

function classifyLocationScope(loc: Location): Exclude<MacroScope, "ALL"> {
  if (isCosmologyLocation(loc)) return "COSMOLOGY";
  if (/^terre$/i.test(loc.realm_type) || /^terre$/i.test(loc.planet ?? "")) {
    return "EARTH";
  }
  return "PLANETS";
}

const SCOPE_ORDER: Record<Exclude<MacroScope, "ALL">, number> = {
  COSMOLOGY: 1,
  PLANETS: 2,
  EARTH: 3,
};

export function LocationsGrid({ locations }: { locations: Location[] }) {
  const [scope, setScope] = useState<MacroScope>("ALL");
  const [query, setQuery] = useState("");
  const [selectedRealm, setSelectedRealm] = useState("ALL");
  const { locale } = useLangue();
  const t = wikiCatalogueMessages(locale);
  const tr = useT();

  const orderedLocations = useMemo(
    () =>
      [...locations].toSorted((a, b) => {
        const sa = SCOPE_ORDER[classifyLocationScope(a)];
        const sb = SCOPE_ORDER[classifyLocationScope(b)];
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, "fr");
      }),
    [locations],
  );

  const scopeCounts = useMemo(() => {
    const counts = { ALL: orderedLocations.length, COSMOLOGY: 0, PLANETS: 0, EARTH: 0 };
    for (const loc of orderedLocations) {
      counts[classifyLocationScope(loc)]++;
    }
    return counts;
  }, [orderedLocations]);

  const scopedPool = useMemo(
    () =>
      scope === "ALL"
        ? orderedLocations
        : orderedLocations.filter((loc) => classifyLocationScope(loc) === scope),
    [orderedLocations, scope],
  );

  const options = useMemo(
    () => [
      { value: "ALL", label: t("all") },
      ...[...new Set(scopedPool.map((location) => location.realm_type))].map((value) => ({
        value,
        label: value,
      })),
    ],
    [scopedPool, t],
  );

  const filtered = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    return scopedPool.filter(
      (location) =>
        (selectedRealm === "ALL" || location.realm_type === selectedRealm) &&
        (!q ||
          [
            location.name,
            location.name_ja,
            location.name_romaji,
            location.description,
            location.planet,
            location.realm_type,
          ].some((value) => value?.toLocaleLowerCase().includes(q))),
    );
  }, [scopedPool, query, selectedRealm]);

  const scopeTabs: Array<{ key: MacroScope; labelKey: string; count: number }> = [
    { key: "ALL", labelKey: "wiki.locationsHub.scopeAll", count: scopeCounts.ALL },
    {
      key: "COSMOLOGY",
      labelKey: "wiki.locationsHub.scopeCosmology",
      count: scopeCounts.COSMOLOGY,
    },
    { key: "PLANETS", labelKey: "wiki.locationsHub.scopePlanets", count: scopeCounts.PLANETS },
    { key: "EARTH", labelKey: "wiki.locationsHub.scopeEarth", count: scopeCounts.EARTH },
  ];

  return (
    <section id="catalogue-lieux" className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-saiyan text-2xl uppercase tracking-wider text-white sm:text-3xl">
          {tr("wiki.locationsHub.catalogueHeading")}
        </h2>
        <div
          role="tablist"
          aria-label={tr("wiki.locationsHub.catalogueHeading")}
          onKeyDown={onTablistKeyDown}
          className="flex flex-wrap gap-2"
        >
          {scopeTabs.map((tab) => {
            const active = scope === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => {
                  setScope(tab.key);
                  setSelectedRealm("ALL");
                }}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                  active
                    ? "border-dbz-orange bg-dbz-orange text-black shadow-[0_0_16px_rgba(231,130,32,0.3)]"
                    : "border-white/12 bg-white/[0.03] text-white/75 hover:border-dbz-orange/60 hover:text-white"
                }`}
              >
                <span>{tr(tab.labelKey)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] tabular-nums ${
                    active ? "bg-black/20 text-black" : "bg-white/10 text-white/65"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <WikiCatalogueToolbar
        query={query}
        onQueryChange={setQuery}
        value={selectedRealm}
        onValueChange={setSelectedRealm}
        options={options}
        searchLabel={t("searchLocations")}
        filterLabel={t("realms")}
        count={filtered.length}
      />
      <div className={styles.topicGrid}>
        {filtered.map((location) => {
          const events = mergeArticleAndColumnEvents(location.article, location.key_events);
          return (
            <WikiDiscoveryCard
              key={location.slug}
              href={"/wiki/locations/" + location.slug}
              title={location.name}
              subtitle={location.name_ja}
              image={location.image}
              description={
                <>
                  <p>{location.description}</p>
                  {events.length > 0 && (
                    <p>
                      {t("events")} ·{" "}
                      {events
                        .slice(0, 2)
                        .map((event) => event.title)
                        .join(" · ")}
                    </p>
                  )}
                </>
              }
              meta={[location.realm_type, location.planet].filter(Boolean).join(" · ")}
              detail={
                location.debut_chapter ? t("debut") + " · " + location.debut_chapter : t("explore")
              }
              category="locations"
              layout="grid"
              headingLevel={3}
            />
          );
        })}
      </div>
      {filtered.length === 0 && <p className={styles.catalogueEmpty}>{t("empty")}</p>}
    </section>
  );
}
