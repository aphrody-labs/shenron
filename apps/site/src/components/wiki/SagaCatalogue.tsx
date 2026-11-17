"use client";
// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import Link from "next/link";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { useLangue } from "@/lib/i18n/client";
import { wikiNarrativeMessages } from "@/lib/wiki-narrative-messages";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiImg } from "./WikiImg";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import styles from "./wiki-editorial.module.css";

type SagaEntry = {
  id: number;
  slug: string;
  name: string;
  nameJa: string | null;
  order: number;
  image: string | null;
  description: string;
  arcs: Array<{
    id: number;
    slug: string;
    name: string;
    name_ja: string | null;
    order_idx: number;
  }>;
};
export function SagaCatalogue({
  groups,
  access,
}: {
  groups: Array<{ key: string; label: string; sagas: SagaEntry[] }>;
  access: AccessSnapshot | null;
}) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("all");
  const { locale } = useLangue();
  const t = wikiNarrativeMessages(locale);
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return groups
      .filter((group) => series === "all" || series === group.key)
      .map((group) => ({
        key: group.key,
        label: group.label,
        sagas: group.sagas.filter(
          (saga) =>
            !value ||
            [saga.name, saga.nameJa, saga.description, ...saga.arcs.map((arc) => arc.name)].some(
              (text) => text?.toLocaleLowerCase().includes(value),
            ),
        ),
      }))
      .filter((group) => group.sagas.length > 0);
  }, [groups, query, series]);
  return (
    <div className="space-y-8">
      <WikiCatalogueToolbar
        query={query}
        onQueryChange={setQuery}
        value={series}
        onValueChange={setSeries}
        options={[
          { value: "all", label: t("all") },
          ...groups.map((group) => ({ value: group.key, label: group.label })),
        ]}
        searchLabel={t("sagas")}
        filterLabel={t("series")}
        count={filtered.reduce((count, group) => count + group.sagas.length, 0)}
      />
      {filtered.map((group) => (
        <section key={group.key} className="space-y-5">
          <h2 className={styles.sectionTitle}>{group.label}</h2>
          <div className={styles.topicGrid}>
            {group.sagas.map((saga) => (
              <article key={saga.id} id={"saga-" + saga.slug} className={styles.eventCard}>
                <Link href={"/wiki/sagas/" + saga.slug} className={styles.sagaIntro}>
                  {saga.image && (
                    <div className={styles.topicMedia}>
                      <WikiImg
                        src={saga.image}
                        alt={saga.name}
                        sizes="(min-width:1024px) 420px, (min-width:640px) 50vw, 100vw"
                      />
                    </div>
                  )}
                  <div className={styles.topicContent}>
                    <p className={styles.discoveryMeta}>{t("sagaNumber", { count: saga.order })}</p>
                    <h3 className={styles.topicHeading}>{saga.name}</h3>
                    {saga.nameJa && (
                      <p className={styles.discoverySubtitle} lang="ja">
                        {saga.nameJa}
                      </p>
                    )}
                    {saga.description && (
                      <p className={styles.discoveryDescription}>{saga.description}</p>
                    )}
                  </div>
                </Link>
                {saga.arcs.length > 0 && (
                  <details className={styles.arcDisclosure}>
                    <summary>{t("arcsCount", { count: saga.arcs.length })}</summary>
                    <ul>
                      {saga.arcs.map((arc) => (
                        <li key={arc.id}>
                          <ClientGatedWrap
                            access={access}
                            href={"/wiki/arcs/" + arc.slug}
                            className={styles.arcLink}
                          >
                            <span className={styles.discoveryMeta}>
                              {String(arc.order_idx).padStart(2, "0")}
                            </span>
                            <span>
                              {arc.name}
                              {arc.name_ja && (
                                <span className={styles.discoverySubtitle} lang="ja">
                                  {" "}
                                  · {arc.name_ja}
                                </span>
                              )}
                            </span>
                          </ClientGatedWrap>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      {filtered.length === 0 && <p className={styles.catalogueEmpty}>{t("empty")}</p>}
    </div>
  );
}
