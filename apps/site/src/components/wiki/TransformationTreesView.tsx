"use client";

// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { useLangue } from "@/lib/i18n/client";
import { wikiNarrativeMessages } from "@/lib/wiki-narrative-messages";
import lineages from "@/data/transformation-lineages.json";
import styles from "./wiki-editorial.module.css";

/** Existing editorial lineage data is kept separate from presentation and theme values. */
export function TransformationTreesView() {
  const [activeTreeId, setActiveTreeId] = useState(lineages[0]?.id ?? "");
  const { locale } = useLangue();
  const t = wikiNarrativeMessages(locale);
  const activeTree = lineages.find((tree) => tree.id === activeTreeId) ?? lineages[0];
  if (!activeTree) return null;
  return (
    <section className="space-y-5">
      <div>
        <h2 className={styles.sectionTitle}>{t("lineages")}</h2>
        <p className={styles.topicBlurb}>{t("lineagesLead")}</p>
      </div>
      <div className={styles.eventFilters}>
        <label>
          {t("lineages")}
          <select value={activeTreeId} onChange={(event) => setActiveTreeId(event.target.value)}>
            {lineages.map((tree) => (
              <option key={tree.id} value={tree.id}>
                {tree.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.note}>
        <h3 className={styles.topicHeading} lang="fr">
          {activeTree.title}
        </h3>
        <p className={styles.topicBlurb}>
          {t("lineageSource")} · <span lang="fr">{activeTree.lineage}</span>
        </p>
        <p className={styles.discoveryMeta}>{t("stages", { count: activeTree.nodes.length })}</p>
      </div>
      <ol className={styles.lineageNodes}>
        {activeTree.nodes.map((node, index) => (
          <li key={node.name} className={styles.eventCard}>
            <div className={styles.topicContent}>
              <p className={styles.discoveryMeta}>
                {t("stage", { count: index + 1 })} ·{" "}
                {t(
                  node.canonRank === "canon"
                    ? "canonManga"
                    : node.canonRank === "supervised"
                      ? "canonSupervised"
                      : "canonDerived",
                )}
              </p>
              <h4 className={styles.topicHeading} lang="fr">
                {node.name}
              </h4>
              <p className={styles.discoveryMeta} lang="fr">
                {node.stage}
              </p>
              <p className={styles.topicBlurb} lang="fr">
                {node.description}
              </p>
              <p className={styles.discoveryMeta}>
                {t("keyUsers")} · {node.users.join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
