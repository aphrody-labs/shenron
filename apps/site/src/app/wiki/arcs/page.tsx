// SPDX-License-Identifier: Apache-2.0
import { GatedLink } from "@/components/GatedLink";
import { dbUniverse } from "@/lib/db-universe";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { pageHero } from "@/lib/banner-config";
import { WikiDiscoveryCard } from "@/components/wiki/WikiDiscoveryCard";
import { WikiNarrativeText } from "@/components/wiki/WikiNarrativeText";
import { T } from "@/components/T";
import { markdownToPlainText } from "@/lib/markdown-plain";
import messages from "../../../../messages/wiki-narrative/fr.json";
import styles from "@/components/wiki/wiki-editorial.module.css";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Arcs narratifs Dragon Ball",
  description:
    "Tous les arcs narratifs de Dragon Ball, regroupés par saga : de la quête des Dragon Balls aux combats contre Freezer, Cell, Majin Boo et au-delà.",
  alternates: { canonical: "/wiki/arcs" },
};

export default async function ArcsPage() {
  const data = await dbUniverse.arcs();
  const arcs = data?.arcs ?? [];
  const heroImage = await pageHero("arcs");

  // Regroupe par saga en conservant l'ordre (les arcs arrivent déjà triés
  // saga.orderIdx → arc.orderIdx).
  const sagas: {
    slug: string | null;
    name: string;
    series: string | null;
    arcs: typeof arcs;
  }[] = [];
  for (const a of arcs) {
    let g = sagas[sagas.length - 1];
    if (!g || g.slug !== a.saga_slug) {
      g = {
        slug: a.saga_slug,
        name: a.saga_name ?? messages.otherArcs,
        series: a.saga_series,
        arcs: [],
      };
      sagas.push(g);
    }
    g.arcs.push(a);
  }

  return (
    <WikiIndexPage
      eyebrow={<T k="wikiExplorer.home" />}
      title={<WikiNarrativeText name="arcsTitle" />}
      lead={<WikiNarrativeText name="arcsLead" values={{ count: arcs.length }} />}
      image={heroImage}
      imageAlt=""
      crumbs={[{ label: messages.arcsTitle, display: <WikiNarrativeText name="arcsTitle" /> }]}
      category="arcs"
      contributeKey="kit.contribute.what.arc"
    >
      {sagas.length === 0 ? (
        <p className={styles.catalogueEmpty}>
          <WikiNarrativeText name="noArcs" />
        </p>
      ) : (
        <div className="space-y-10">
          {sagas.map((saga) => (
            <section key={saga.slug ?? saga.name} className="space-y-5">
              <h2 className={styles.sectionTitle}>
                {saga.slug ? (
                  <GatedLink href={"/wiki/sagas/" + saga.slug}>{saga.name}</GatedLink>
                ) : (
                  <WikiNarrativeText name="otherArcs" />
                )}
              </h2>
              {saga.series && <p className={styles.discoveryMeta}>{saga.series}</p>}
              <div className={styles.topicGrid}>
                {saga.arcs.map((arc) => (
                  <WikiDiscoveryCard
                    key={arc.id}
                    href={"/wiki/arcs/" + arc.slug}
                    title={arc.name}
                    subtitle={arc.name_ja}
                    description={markdownToPlainText(arc.description ?? "")}
                    meta={String(arc.order_idx).padStart(2, "0")}
                    category="arcs"
                    layout="grid"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </WikiIndexPage>
  );
}
