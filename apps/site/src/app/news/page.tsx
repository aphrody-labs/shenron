import type { Metadata } from "next";
import Link from "next/link";
import { JournalIndex, journalPageCount, journalHref } from "./_journal";
import { pageHero } from "@/lib/banner-config";

// Aucun `searchParams` lu ici : la page 1 est PRÉRENDUE et cachée par le CDN.
// La pagination vit sous `/news/page/[n]` (cf. `_journal.tsx`).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "News — actualités Dragon Ball",
  description:
    "Sorties anime, chapitres du manga, films, événements et analyses. Les actualités Dragon Ball de la communauté francophone.",
  alternates: {
    canonical: "/news",
    types: { "application/rss+xml": [{ url: "/news/rss.xml", title: "News & Actualités — DBFR" }] },
  },
};

export default async function ActualitesPage() {
  // `rel="next"` en <head> : indique explicitement à un crawler que la série
  // continue, sans qu'il ait à découvrir le lien dans le corps de page.
  const [pages, banner] = await Promise.all([
    journalPageCount().catch(() => 1),
    pageHero("news").catch(() => null),
  ]);
  return (
    <>
      {pages > 1 && <link rel="next" href={journalHref(2)} />}
      <JournalIndex
        page={1}
        banner={banner}
        intro={
          <p className="flex flex-col gap-2 rounded-lg border border-dbz-orange/25 bg-dbz-orange/[0.06] px-4 py-3 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between">
            <span>Les actus officielles Dragon Ball sont importées avec leur lien canonique.</span>
            <Link
              href="/sources/dragon-ball"
              className="inline-flex min-h-11 shrink-0 items-center rounded-sm font-semibold text-dbz-orange hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
            >
              Voir les sources BXC
            </Link>
          </p>
        }
      />
    </>
  );
}
