// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { Orbit } from "lucide-react";
import { WikiImg } from "@/components/wiki/WikiImg";
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
  return (
    <header className={styles.hero} data-wiki-topic={wikiVisualTopic(category)}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <Orbit aria-hidden="true" size={18} strokeWidth={1.5} />
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
