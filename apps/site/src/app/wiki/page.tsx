// SPDX-License-Identifier: Apache-2.0
import { Suspense } from "react";
import type { Metadata } from "next";
import { isPathPublic } from "@aphrody/shenron-config/wiki-launch";
import { DomainBar } from "@/components/kit/DomainBar";
import {
  WikiEditorialPortal,
  WikiPortalLoading,
} from "@/components/wiki/scene/WikiEditorialPortal";
import { WIKI_PORTAL_SECTIONS } from "@/components/wiki/scene/portal-catalogue";
import { dbUniverse } from "@/lib/db-universe";
import { getLaunchConfig } from "@/lib/wiki-launch-config";
import { getPublishedCardCount } from "@/lib/card-catalog";
import { getPublicCorpusStats } from "@/lib/public-corpus-stats";
import { recentPortalPublications } from "@/lib/wiki-publications";
import { assetUrl } from "@/lib/assets";
import { mangaLibraryImageUrl } from "@/lib/manga-library-image";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "L'univers Dragon Ball",
  description:
    "Explorez l’univers Dragon Ball : personnages, sagas, mondes, techniques, films, épisodes, manga et databooks.",
  alternates: { canonical: "/wiki" },
};

export default function WikiIndex() {
  return (
    <Suspense fallback={<WikiPortalLoading />}>
      <WikiIndexContent />
    </Suspense>
  );
}

async function WikiIndexContent() {
  // Navigation counts and genuine publications keep their existing server owners.
  // Collections are read on their destination pages, rather than all fetched for hidden rails.
  const [counts, access, cardCatalogCards, corpus, manga, databooks, games] = await Promise.all([
    dbUniverse.counts(),
    getLaunchConfig(),
    getPublishedCardCount().catch(() => undefined),
    getPublicCorpusStats(),
    dbUniverse.mangaCatalogVolumes(),
    dbUniverse.databooks(),
    dbUniverse.games(),
  ]);
  // oxlint-disable-next-line react/purity -- server-only ISR samples time after data I/O; client hydration never samples this clock.
  const now = Date.now();
  const publishedAt = (value: number | null | undefined) =>
    value ? (value < 1e12 ? value * 1000 : value) : 0;
  const publications = recentPortalPublications(
    [
      ...(manga?.volumes ?? []).map((entry) => ({
        id: `manga-${entry.id}`,
        title: entry.title ?? "",
        href: `/wiki/manga/volume/${entry.id}`,
        date: publishedAt(entry.published_at),
        image: entry.cover ? mangaLibraryImageUrl(entry.cover) : undefined,
      })),
      ...(databooks?.items ?? []).map((entry) => ({
        id: `databook-${entry.id}`,
        title: entry.title,
        href: `/wiki/databooks/${entry.id}`,
        date: publishedAt(entry.published_at),
        image: entry.cover ? assetUrl(entry.cover) : undefined,
      })),
      ...(games?.games ?? []).map((entry) => ({
        id: `game-${entry.id}`,
        title: entry.title,
        href: `/wiki/games/${entry.slug}`,
        date: publishedAt(entry.release_date),
        image: entry.cover ? assetUrl(entry.cover) : undefined,
      })),
    ].filter((entry) => entry.title.trim().length > 0 && isPathPublic(entry.href, access)),
    now,
  );
  return (
    <>
      <DomainBar domain="wiki" />
      <WikiEditorialPortal
        counts={{
          ...((counts ?? {}) as Record<string, number>),
          ...(cardCatalogCards === undefined ? {} : { cardCatalogCards }),
        }}
        enabledSections={WIKI_PORTAL_SECTIONS.filter((entry) =>
          isPathPublic(entry.href.split(/[?#]/, 1)[0]!, access),
        ).map((entry) => entry.id)}
        publications={publications}
        corpus={{ canonReferences: corpus.canonReferences, ragChunks: corpus.ragChunks }}
      />
    </>
  );
}
