"use client";

import Link from "next/link";
import { BookOpen, Compass, FilePenLine, GitPullRequestArrow, ArrowUpRight } from "lucide-react";
import { useLangue } from "@/lib/i18n/client";
import fr from "../../../messages/wiki-contribution-journey/fr.json";
import en from "../../../messages/wiki-contribution-journey/en.json";
import ja from "../../../messages/wiki-contribution-journey/ja.json";
import styles from "./wiki-contribution-journey.module.css";

const dictionaries = { fr, en, ja };
const icons = [Compass, BookOpen, FilePenLine, GitPullRequestArrow];

export function ContributionJourneyText({
  name,
  table,
}: {
  name?: "workshopsUnavailable" | "contributorsUnavailable";
  table?: string;
}) {
  const { locale } = useLangue();
  const text = dictionaries[locale] ?? fr;
  if (table) return text.workshops[table as keyof typeof text.workshops] ?? table;
  return name ? text[name] : null;
}

export function WikiContributionJourney() {
  const { locale } = useLangue();
  const text = dictionaries[locale] ?? fr;
  return (
    <section className={styles.journey} aria-labelledby="contribution-journey-title">
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{text.label}</span>
        <h2 id="contribution-journey-title">{text.title}</h2>
        <p>{text.description}</p>
        <div className={styles.actions}>
          <Link href="/wiki/search">
            {text.explore}
            <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
          <a href="#my-contributions">{text.track}</a>
          <Link href="/wiki/canon">{text.sources}</Link>
        </div>
      </div>
      <ol className={styles.steps}>
        {text.steps.map((step, index) => {
          const Icon = icons[index]!;
          return (
            <li key={step.title}>
              <div className={styles.stepHeading}>
                <Icon aria-hidden="true" size={22} />
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
