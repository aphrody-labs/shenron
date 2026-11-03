"use client";

// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import type { Location } from "@/lib/db-universe";
import { useLangue } from "@/lib/i18n/client";
import { wikiCatalogueMessages } from "@/lib/wiki-catalogue-messages";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiDiscoveryCard } from "./WikiDiscoveryCard";
import styles from "./wiki-editorial.module.css";

export function LocationsGrid({ locations }: { locations: Location[] }) {
  const [query, setQuery] = useState("");
  const [selectedRealm, setSelectedRealm] = useState("ALL");
  const { locale } = useLangue();
  const t = wikiCatalogueMessages(locale);
  const options = [
    { value: "ALL", label: t("all") },
    ...[...new Set(locations.map((location) => location.realm_type))].map((value) => ({
      value,
      label: value,
    })),
  ];
  const filtered = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    return locations.filter(
      (location) =>
        (selectedRealm === "ALL" || location.realm_type === selectedRealm) &&
        (!q ||
          [location.name, location.name_ja, location.description, location.planet].some((value) =>
            value?.toLocaleLowerCase().includes(q),
          )),
    );
  }, [locations, query, selectedRealm]);
  return (
    <div className="space-y-6">
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
        {filtered.map((location) => (
          <WikiDiscoveryCard
            key={location.slug}
            href={"/wiki/locations/" + location.slug}
            title={location.name}
            subtitle={location.name_ja}
            image={location.image}
            description={
              <>
                <p>{location.description}</p>
                {location.key_events && location.key_events.length > 0 && (
                  <p>
                    {t("events")} ·{" "}
                    {location.key_events
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
            headingLevel={2}
          />
        ))}
      </div>
      {filtered.length === 0 && <p className={styles.catalogueEmpty}>{t("empty")}</p>}
    </div>
  );
}
