import { Suspense } from "react";
import Link from "next/link";
import { GatedLink } from "@/components/GatedLink";
import { dbUniverse } from "@/lib/db-universe";
import { NarrativeEventsExplorer } from "@/components/wiki/NarrativeEventsExplorer";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { ogMeta } from "@/lib/og";
import { WikiNarrativeText } from "@/components/wiki/WikiNarrativeText";
import messages from "../../../../messages/wiki-narrative/fr.json";
import styles from "@/components/wiki/wiki-editorial.module.css";
import { pageHero } from "@/lib/banner-config";

import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Événements, Combats & Chronologie de Dragon Ball",
  description:
    "La base de données unifiée des événements, combats d'anthologie, championnats martiaux et repères chronologiques de Dragon Ball, Z, Super, GT et de la Patrouille du Temps (Xenoverse).",
  ...ogMeta({
    title: "Événements & Chronologie — Dragon Ball FR",
    description:
      "Explorez tous les affrontements, tournois martiaux et tournants narratifs de l'histoire Dragon Ball, rattachés à leurs sagas, arcs et continuités.",
    canonical: "/wiki/events",
    type: "website",
  }),
};

export default async function EventsPage() {
  const [battles, tournaments, timelineEvents, sagas, arcs] = await Promise.all([
    dbUniverse.battles().then((value) => value ?? []),
    dbUniverse.tournaments().then((value) => value ?? []),
    dbUniverse.timelineEvents().then((value) => value ?? []),
    dbUniverse.sagas().then((value) => value?.sagas ?? []),
    dbUniverse.arcs().then((value) => value?.arcs ?? []),
  ]);
  const heroImage = await pageHero("sagas");
  const total = battles.length + tournaments.length + timelineEvents.length;
  return (
    <WikiIndexPage
      eyebrow={<WikiNarrativeText name="continuity" />}
      title={<WikiNarrativeText name="eventsTitle" />}
      lead={<WikiNarrativeText name="eventsLead" values={{ count: total }} />}
      image={heroImage}
      imageAlt=""
      crumbs={[{ label: messages.eventsTitle, display: <WikiNarrativeText name="eventsTitle" /> }]}
      category="events"
      contributeKey="kit.contribute.what.battle"
    >
      <details className={styles.note}>
        <summary className="cursor-pointer font-semibold">
          <WikiNarrativeText name="continuity" />
        </summary>
        <div className={styles.topicGrid}>
          {(
            [
              { title: "manga", text: "mangaIntro" },
              { title: "anime", text: "animeIntro" },
              { title: "movies", text: "moviesIntro" },
              { title: "xenoverse", text: "xenoverseIntro" },
            ] as const
          ).map((entry) => (
            <section key={entry.title} className={styles.topicContent}>
              <h2 className={styles.topicHeading}>
                <WikiNarrativeText name={entry.title} />
              </h2>
              <p className={styles.topicBlurb}>
                <WikiNarrativeText name={entry.text} />
              </p>
            </section>
          ))}
        </div>
      </details>
      <Suspense
        fallback={
          <div className={styles.note} aria-busy="true">
            <WikiNarrativeText name="eventsList" />
          </div>
        }
      >
        <NarrativeEventsExplorer
          battles={battles}
          tournaments={tournaments}
          timelineEvents={timelineEvents}
          sagas={sagas}
          arcs={arcs}
        />
      </Suspense>
      <nav className={styles.quickNav} aria-label={messages.sagas}>
        <GatedLink href="/wiki/sagas" className={styles.quickLink}>
          <WikiNarrativeText name="sagasLink" />
        </GatedLink>
        <GatedLink href="/wiki/arcs" className={styles.quickLink}>
          <WikiNarrativeText name="arcsLink" />
        </GatedLink>
        <Link href="/wiki/timeline" className={styles.quickLink}>
          <WikiNarrativeText name="timelineLink" />
        </Link>
      </nav>
    </WikiIndexPage>
  );
}
