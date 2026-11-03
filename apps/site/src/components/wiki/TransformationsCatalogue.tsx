"use client";
// SPDX-License-Identifier: Apache-2.0
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLangue } from "@/lib/i18n/client";
import { wikiNarrativeMessages } from "@/lib/wiki-narrative-messages";
import { WikiCatalogueToolbar } from "./WikiCatalogueToolbar";
import { WikiImg } from "./WikiImg";
import { WikiCatalogueText } from "./WikiCatalogueText";
import styles from "./wiki-editorial.module.css";

export type TransformationCatalogueGroup = {
  name: string;
  image: string | null;
  ki: string | null;
  members: Array<{ id: number; slug: string; name: string; image: string | null }>;
  ficheId: number | null;
  ficheSlug: string | null;
};

export function TransformationsCatalogue({ groups }: { groups: TransformationCatalogueGroup[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const { locale } = useLangue();
  const t = wikiNarrativeMessages(locale);
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return groups.filter(
      (group) =>
        (filter !== "article" || Boolean(group.ficheId)) &&
        (filter !== "image" || Boolean(group.image)) &&
        (!value ||
          group.name.toLocaleLowerCase().includes(value) ||
          group.members.some((member) => member.name.toLocaleLowerCase().includes(value))),
    );
  }, [groups, query, filter]);
  return (
    <section className="space-y-6">
      <h2 className={styles.sectionTitle}>{t("allForms")}</h2>
      <WikiCatalogueToolbar
        query={query}
        onQueryChange={setQuery}
        value={filter}
        onValueChange={setFilter}
        options={[
          { value: "all", label: t("all") },
          { value: "article", label: t("withArticle") },
          { value: "image", label: t("withImage") },
        ]}
        searchLabel={t("formsSearch")}
        filterLabel={t("formsFilter")}
        count={filtered.length}
      />
      <div className={styles.topicGrid}>
        {filtered.map((group) => {
          const href = group.ficheSlug
            ? "/wiki/transformations/" + group.ficheSlug
            : group.ficheId
              ? "/wiki/transformations/" + group.ficheId
              : group.members[0]
                ? "/wiki/characters/" + group.members[0].slug
                : "/wiki/search?q=" + encodeURIComponent(group.name);
          return (
            <Link
              key={group.name}
              href={href}
              className={styles.topicCard}
              style={{ "--wiki-accent": "var(--wiki-energy)" } as React.CSSProperties}
            >
              <article className={styles.discoveryArticle}>
                <div className={styles.topicMedia}>
                  <WikiImg
                    src={group.image}
                    alt={group.name}
                    className={styles.raceImage}
                    sizes="(min-width:1024px) 420px, (min-width:640px) 50vw, 100vw"
                  />
                </div>
                <div className={styles.topicContent}>
                  <h3 className={styles.topicHeading}>
                    {group.name}
                    <ArrowUpRight aria-hidden="true" size={18} />
                  </h3>
                  {group.ki && (
                    <p className={styles.discoveryMeta}>{t("ki", { value: group.ki })}</p>
                  )}
                  <p className={styles.discoveryMeta}>
                    <WikiCatalogueText
                      name="memberCount"
                      values={{ count: group.members.length }}
                    />
                  </p>
                  <div className={styles.raceMembers}>
                    {group.members
                      .filter((member) => member.image)
                      .slice(0, 4)
                      .map((member) => (
                        <span key={member.id} className={styles.raceAvatar} title={member.name}>
                          <WikiImg
                            src={member.image}
                            alt={member.name}
                            sizes="32px"
                            className={styles.raceImage}
                          />
                        </span>
                      ))}
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>
      {filtered.length === 0 && <p className={styles.catalogueEmpty}>{t("empty")}</p>}
    </section>
  );
}
