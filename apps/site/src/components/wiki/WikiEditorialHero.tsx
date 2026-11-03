// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { Orbit } from "lucide-react";
import { WikiImg } from "@/components/wiki/WikiImg";
import { WikiMeasuredArtwork } from "@/components/wiki/WikiMeasuredArtwork";
import { wikiVisualTopic } from "@/lib/wiki-visual-theme";
import { assetUrl } from "@/lib/assets";
import styles from "./wiki-editorial.module.css";

/** A catalogue's own artwork is presented beside its title, without masquerading as a frame. */
export function WikiEditorialHero({
  eyebrow,
  title,
  lead,
  image,
  imageAlt,
  category,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  image?: string;
  imageAlt?: string;
  category?: string;
}) {
  const topic = wikiVisualTopic(category);
  const measuredSubject =
    topic === "namek" || topic === "community"
      ? "senzu"
      : topic === "adventure" || topic === "energy"
        ? "sphere"
        : null;
  return (
    <header className={styles.hero} data-wiki-topic={topic}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            {measuredSubject ? (
              <WikiMeasuredArtwork subject={measuredSubject} />
            ) : (
              <Orbit aria-hidden="true" size={18} strokeWidth={1.5} />
            )}
            {eyebrow}
          </p>
          <h1 className={styles.heroTitle}>{title}</h1>
          {lead && <div className={styles.heroLead}>{lead}</div>}
        </div>
        {image && (
          <div className={styles.heroArtwork}>
            <WikiImg
              src={assetUrl(image)}
              alt={imageAlt ?? ""}
              className={styles.heroImage}
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 800px) 420px, 90vw"
            />
          </div>
        )}
      </div>
    </header>
  );
}
