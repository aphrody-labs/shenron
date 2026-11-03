// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WikiImg } from "./WikiImg";
import styles from "./wiki-media-catalogue.module.css";

const EMPTY_META: readonly { key: string; label: ReactNode }[] = [];

/** Measured coverage belongs beside the catalogue, with its own accessible heading. */
export function WikiMediaMetrics({
  label,
  items,
}: {
  label: ReactNode;
  items: { key: string; label: ReactNode; value: ReactNode; hint?: ReactNode }[];
}) {
  return (
    <section className={styles.metrics} aria-labelledby="media-coverage-heading">
      <h2 id="media-coverage-heading" className="sr-only">
        {label}
      </h2>
      <dl className={styles.metricsGrid}>
        {items.map((item) => (
          <div key={item.key} className={styles.metric}>
            <dt>{item.label}</dt>
            <dd>
              {item.value}
              {item.hint && <small>{item.hint}</small>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A real published work, with independent navigation actions and preserved image proportions. */
export function WikiMediaSpotlight({
  title,
  subtitle,
  description,
  artwork,
  eyebrow,
  meta = EMPTY_META,
  primary,
  secondary,
  children,
}: {
  title: string;
  subtitle?: string | null;
  description?: string | null;
  artwork?: string | null;
  eyebrow: ReactNode;
  meta?: readonly { key: string; label: ReactNode }[];
  primary: { href: string; label: ReactNode; hardNav?: boolean };
  secondary?: { href: string; label: ReactNode };
  children?: ReactNode;
}) {
  return (
    <section
      className={styles.spotlight}
      aria-labelledby="featured-media-title"
      data-media-artwork={artwork ? "present" : undefined}
    >
      {artwork && (
        <div className={styles.artwork}>
          <WikiImg
            src={artwork}
            alt={title}
            className={styles.cover}
            sizes="(min-width: 800px) 250px, 160px"
            loading="lazy"
          />
        </div>
      )}
      <div className={styles.spotlightContent}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 id="featured-media-title" className={styles.title}>
          {title}
        </h2>
        {subtitle && (
          <p className={styles.subtitle} lang="ja">
            {subtitle}
          </p>
        )}
        {meta.length > 0 && (
          <ul className={styles.metadata}>
            {meta.map((item) => (
              <li key={item.key}>{item.label}</li>
            ))}
          </ul>
        )}
        {description && <p className={styles.description}>{description}</p>}
        {children}
        <div className={styles.actions}>
          {primary.hardNav ? (
            <a href={primary.href} className="dbz-button">
              {primary.label}
              <ArrowRight aria-hidden="true" size={18} />
            </a>
          ) : (
            <Link href={primary.href} className="dbz-button">
              {primary.label}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className={styles.secondary}>
              {secondary.label}
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export function WikiMediaJumpLinks({
  label,
  items,
}: {
  label: string;
  items: { key: string; href: string; label: ReactNode; count: number }[];
}) {
  return (
    <nav aria-label={label} className={styles.jumpLinks}>
      {items.map((item) => (
        <a key={item.key} href={item.href}>
          {item.label}
          <span>{item.count}</span>
        </a>
      ))}
    </nav>
  );
}
