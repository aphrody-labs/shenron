"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/T";
import { useLangue } from "@/lib/i18n/client";
import styles from "./CanonExplorer.module.css";

import { CANON_EXAMPLES } from "@/lib/canon-examples";

export function CanonExplorer({ initialQuery }: { initialQuery: string }) {
  const t = useT();
  const router = useRouter();
  const { locale, changerLangue } = useLangue();
  const [query, setQuery] = useState(initialQuery);
  const [work, setWork] = useState("all");
  const [pending, startTransition] = useTransition();
  const examples = CANON_EXAMPLES.filter((item) => work === "all" || item.work === work);
  return (
    <div className={styles.explorer}>
      <header className={styles.heading}>
        <h1>{t("canonExplorer.title")}</h1>
        <p>{t("canonExplorer.subtitle")}</p>
      </header>
      <search>
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            const value = query.trim();
            if (value)
              startTransition(() =>
                router.push(`/wiki/canon?q=${encodeURIComponent(value)}`, { scroll: false }),
              );
          }}
        >
          <label className="sr-only" htmlFor="canon-question">
            {t("canonExplorer.question")}
          </label>
          <span aria-hidden="true" className={styles.searchIcon}>
            ⌕
          </span>
          <input
            id="canon-question"
            name="q"
            type="search"
            value={query}
            maxLength={300}
            required
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("canonExplorer.placeholder")}
          />
          <button type="submit" disabled={pending || !query.trim()}>
            {t(pending ? "canonExplorer.searching" : "canonExplorer.search")}
          </button>
        </form>
      </search>
      <div className={styles.filters}>
        <label>
          {t("canonExplorer.work")}
          <select value={work} onChange={(event) => setWork(event.target.value)}>
            <option value="all">{t("canonExplorer.allWorks")}</option>
            {["DBZ", "GT", "DBS", "DAIMA"].map((value) => (
              <option value={value} key={value}>
                {t(`canonExplorer.work${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("canonExplorer.language")}
          <select
            value={locale}
            onChange={(event) => changerLangue(event.target.value as "fr" | "en" | "ja")}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
      </div>
      <nav className={styles.rail} aria-label={t("canonExplorer.examples")}>
        {examples.map((item) => (
          <Link
            key={item.id}
            href={`/wiki/canon?q=${encodeURIComponent(item.query)}`}
            scroll={false}
            aria-current={
              initialQuery.toLowerCase() === item.query.toLowerCase() ? "page" : undefined
            }
            className={styles.example}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              setQuery(item.query);
              startTransition(() =>
                router.push(`/wiki/canon?q=${encodeURIComponent(item.query)}`, { scroll: false }),
              );
            }}
          >
            <span className={styles.image}>
              <Image
                src={item.image}
                alt=""
                fill
                loading={item.id === "broly" ? "eager" : "lazy"}
                sizes="(max-width: 640px) 140px, 190px"
              />
            </span>
            <span className={styles.exampleLabel}>
              {t(`canonExplorer.${item.label}`)}
              <span aria-hidden="true">↗</span>
            </span>
            <span className={styles.workLabel}>{t(`canonExplorer.work${item.work}`)}</span>
          </Link>
        ))}
      </nav>
      <output className={styles.hint}>
        {t(pending ? "canonExplorer.searching" : "canonExplorer.hint")}
      </output>
    </div>
  );
}

export function CanonSourcesTrigger() {
  const t = useT();
  return (
    <button
      type="button"
      className="mt-5 inline-block rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold"
      onClick={() => {
        const panel = document.getElementById("canon-evidence");
        if (panel instanceof HTMLDetailsElement) {
          panel.open = true;
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
          panel.querySelector("summary")?.focus();
        }
      }}
    >
      {t("canonExplorer.sources")} ↓
    </button>
  );
}

export function CanonResultArrival() {
  useEffect(() => {
    const heading = document.getElementById("canon-verdict-rang");
    if (heading) {
      document
        .getElementById("canon-result")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
      heading.focus({ preventScroll: true });
    }
  }, []);
  return null;
}
