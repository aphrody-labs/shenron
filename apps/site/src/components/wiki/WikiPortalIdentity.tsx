"use client";
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useLangue } from "@/lib/i18n/client";
import { portalUiMessages, type PortalUiKey } from "@/lib/wiki-portal-messages";
import type { PortalMascot, PortalPublication } from "@/lib/wiki-portal-artwork";
import { WikiImg } from "./WikiImg";
import styles from "./wiki-portal.module.css";

export function WikiPortalUiText({
  name,
  values,
}: {
  name: PortalUiKey;
  values?: Record<string, string | number>;
}) {
  return <>{portalUiMessages(useLangue().locale)(name, values)}</>;
}

export function WikiPortalIdentity({
  mascots,
  initialKey,
}: {
  mascots: PortalMascot[];
  initialKey?: PortalMascot["key"];
}) {
  const t = portalUiMessages(useLangue().locale);
  const [selected, setSelected] = useState(initialKey);
  const active = mascots.find((entry) => entry.key === selected) ?? mascots[0];
  if (!active) return null;
  return (
    <section className={styles.identity} aria-label={t("mascots")}>
      <div className={styles.mascots}>
        {mascots.map((mascot) => (
          <button
            key={mascot.key}
            type="button"
            className={styles.mascot}
            data-mascot={mascot.key}
            aria-pressed={active.key === mascot.key}
            onClick={() => setSelected(mascot.key)}
          >
            <span className={styles.mascotImage}>
              <WikiImg src={mascot.image} alt="" sizes="72px" />
            </span>
            <span>{t(mascot.key)}</span>
          </button>
        ))}
      </div>
      <Link
        href={active.href}
        className={styles.featured}
        aria-label={`${t("explore")} · ${t(active.key)}`}
      >
        <span aria-live="polite">
          {t("featured")} · <strong>{t(active.key)}</strong>
        </span>
        <ArrowUpRight aria-hidden="true" size={17} />
      </Link>
    </section>
  );
}

export function WikiPortalPublications({ items }: { items: PortalPublication[] }) {
  const { locale } = useLangue();
  const t = portalUiMessages(locale);
  if (!items.length) return null;
  const date = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <section className={styles.publications} aria-label={t("recent")}>
      <h2>{t("recent")}</h2>
      <ul>
        {items.map((entry) => (
          <li key={entry.id}>
            <Link href={entry.href}>
              <span className={styles.releaseImage}>
                <WikiImg src={entry.image} alt="" sizes="48px" />
              </span>
              <span>
                <strong>{entry.title}</strong>
                <time dateTime={new Date(entry.date).toISOString()}>{date.format(entry.date)}</time>
              </span>
              <ArrowUpRight aria-hidden="true" size={15} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
