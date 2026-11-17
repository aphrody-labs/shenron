import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { dbUniverse } from "@/lib/db-universe";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { searchExternalSources } from "@/lib/external-source-catalog";
import { buildWikiSearchSections, isPublicWikiSearchHref } from "@/lib/wiki-search-catalogue";
import { wikiSourceUrl } from "@/lib/wiki-ai-draft";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
import { WikiDiscoveryCard } from "@/components/wiki/WikiDiscoveryCard";
import { WikiResearchForm, WikiResearchText } from "@/components/wiki/WikiResearchText";
import styles from "@/components/wiki/wiki-research.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recherche Dragon Ball",
  description:
    "Retrouvez les récits, les mondes, les œuvres et les sources de l’encyclopédie Dragon Ball.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/wiki/search" },
};

async function WhisScouterPanel({
  query,
  access,
}: {
  query: string;
  access: AccessSnapshot | null;
}) {
  if (!access) return null;
  let answer: Awaited<ReturnType<typeof dbUniverse.ragChat>> = null;
  let unavailable = false;
  try {
    answer = await dbUniverse.ragChat(query, "whis");
  } catch {
    unavailable = true;
  }
  if (unavailable)
    return (
      <p className={styles.note}>
        <WikiResearchText name="assistantUnavailable" />
      </p>
    );
  if (!answer?.answer) return null;
  // The generated answer must not expose passages from a closed internal destination.
  if (
    !answer.hits?.length ||
    answer.hits.some((hit) => !wikiSourceUrl(hit.url) || !isPublicWikiSearchHref(hit.url, access))
  )
    return null;
  const references = Array.from(
    new Map(
      (
        answer.hits?.flatMap((hit) => {
          const url = wikiSourceUrl(hit.url);
          return url ? [{ title: hit.title, url }] : [];
        }) ?? []
      ).map((source) => [source.url, source]),
    ).values(),
  );
  return (
    <aside className={styles.note}>
      <h2>
        <WikiResearchText name="assistant" />
      </h2>
      <p>{answer.answer}</p>
      {references.length > 0 && (
        <div className={styles.sourceList}>
          {references.map((source) => (
            <a key={source.url} href={source.url}>
              {source.title}
            </a>
          ))}
        </div>
      )}
    </aside>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = (typeof params.q === "string" ? params.q : (params.q?.[0] ?? ""))
    .trim()
    .slice(0, 200);
  const [results, rag, access, external] = await Promise.all([
    query.length >= 2 ? dbUniverse.search(query).catch(() => null) : null,
    query.length >= 2 ? dbUniverse.rag(query, 8).catch(() => null) : null,
    getLaunchConfig().catch(() => null),
    query.length >= 2 ? searchExternalSources({ q: query, limit: 9 }).catch(() => null) : null,
  ]);
  const sections = results ? buildWikiSearchSections(results, access) : [];
  const total = sections.reduce((count, section) => count + section.entries.length, 0);
  const passages = (rag?.results ?? []).flatMap((hit) => {
    const url = wikiSourceUrl(hit.url);
    return url && access && isPublicWikiSearchHref(url, access) ? [{ ...hit, url }] : [];
  });
  return (
    <WikiIndexPage
      eyebrow={<WikiResearchText name="eyebrow" />}
      title={<WikiResearchText name="searchTitle" />}
      lead={<WikiResearchText name="searchLead" />}
      category="search"
      crumbs={[{ label: "Recherche", display: <WikiResearchText name="searchTitle" /> }]}
    >
      <WikiResearchForm query={query} />
      {query.length < 2 && (
        <p className={styles.note}>
          <WikiResearchText name="welcome" />
        </p>
      )}
      {query.length >= 2 && !results && (
        <output className={styles.note}>
          <WikiResearchText name="unavailable" />
        </output>
      )}
      {results && (
        <>
          <p>
            <WikiResearchText name="results" values={{ count: total }} />
          </p>
          {sections.length > 0 && (
            <nav className={styles.jumpLinks} aria-label="Wiki">
              {sections.map((section) => (
                <a key={section.key} href={`#${section.key}`}>
                  <WikiResearchText group={section.key} />
                  <span>{section.entries.length}</span>
                </a>
              ))}
            </nav>
          )}
          {total === 0 && (
            <p className={styles.note}>
              <WikiResearchText name="empty" values={{ query }} />
            </p>
          )}
          {sections.map((section) => (
            <section
              className={styles.group}
              id={section.key}
              key={section.key}
              aria-labelledby={`${section.key}-title`}
            >
              <h2 id={`${section.key}-title`}>
                <WikiResearchText group={section.key} />
                <span className={styles.count}>{section.entries.length}</span>
              </h2>
              <div className={styles.grid}>
                {section.entries.map((entry) => (
                  <WikiDiscoveryCard
                    key={entry.id}
                    {...entry}
                    category={section.category}
                    detail={<WikiResearchText name="open" />}
                    layout="grid"
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {passages.length > 0 && (
        <section className={styles.group} aria-labelledby="wiki-search-passages">
          <h2 id="wiki-search-passages">
            <WikiResearchText name="passages" />
          </h2>
          <div className={styles.grid}>
            {passages.map((passage) => (
              <WikiDiscoveryCard
                key={`${passage.url}:${passage.snippet}`}
                href={passage.url}
                title={passage.title}
                description={passage.snippet}
                category="canon"
                layout="grid"
              />
            ))}
          </div>
        </section>
      )}
      {!!external?.records.length && (
        <section className={styles.group} aria-labelledby="wiki-search-external">
          <h2 id="wiki-search-external">
            <WikiResearchText name="external" />
            <span className={styles.count}>{external.total}</span>
          </h2>
          <div className={styles.grid}>
            {external.records.map((source) => (
              <WikiDiscoveryCard
                key={source.url}
                href={`/sources/dragon-ball?${new URLSearchParams({ q: query })}`}
                title={source.title}
                description={source.excerpt}
                category="canon"
                meta={source.kind}
                layout="grid"
              />
            ))}
          </div>
          <Link
            className="dbz-button-ghost mt-5 inline-flex min-h-11 items-center"
            href={`/sources/dragon-ball?${new URLSearchParams({ q: query })}`}
          >
            <WikiResearchText name="externalMore" values={{ count: external.total }} />
          </Link>
        </section>
      )}
      {query.length >= 2 && (
        <Suspense
          fallback={
            <p className={styles.note}>
              <WikiResearchText name="assistantLoading" />
            </p>
          }
        >
          <WhisScouterPanel query={query} access={access} />
        </Suspense>
      )}
    </WikiIndexPage>
  );
}
