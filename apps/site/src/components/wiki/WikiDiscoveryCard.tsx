// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { WikiImg } from "@/components/wiki/WikiImg";
import { wikiVisualTopic } from "@/lib/wiki-visual-theme";
import { assetUrl } from "@/lib/assets";
import styles from "./wiki-editorial.module.css";

/** One real catalogue record, one destination, one reusable discovery card. */
export function WikiDiscoveryCard({
  href,
  title,
  subtitle,
  description,
  image,
  meta,
  detail,
  category,
  layout = "rail",
  headingLevel = 3,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  description?: ReactNode;
  image?: string | null;
  meta?: ReactNode;
  detail?: ReactNode;
  category: string;
  layout?: "rail" | "grid";
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link
      href={href}
      className={`${styles.topicCard}${layout === "rail" ? ` ${styles.discoveryCard}` : ""}`}
      style={{ "--wiki-accent": `var(--wiki-${wikiVisualTopic(category)})` } as CSSProperties}
    >
      <article className={styles.discoveryArticle}>
        {image && (
          <div className={styles.topicMedia}>
            <WikiImg src={assetUrl(image)} alt={title} sizes="(min-width: 640px) 280px, 75vw" />
          </div>
        )}
        <div className={styles.topicContent}>
          {meta && <div className={styles.discoveryMeta}>{meta}</div>}
          <Heading className={styles.topicHeading}>{title}</Heading>
          {subtitle && (
            <p className={styles.discoverySubtitle} lang="ja">
              {subtitle}
            </p>
          )}
          {description && <div className={styles.discoveryDescription}>{description}</div>}
          <div className={styles.discoveryFooter}>
            <span>{detail}</span>
            <ArrowUpRight aria-hidden="true" size={18} />
          </div>
        </div>
      </article>
    </Link>
  );
}
