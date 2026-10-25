// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell, LinkPager } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogCards } from "@/components/catalog/CatalogCards";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { readCatalogPage } from "@/lib/catalog-explorer";
import { isArchiveCategory, archiveSelectionObservedAt } from "@/lib/archive-catalog";
import {
  catalogBrowseHref,
  catalogSourceFilters,
  isSourceCatalog,
} from "@/lib/catalog-source-query";
import { CatalogUIText } from "@/lib/catalog-ui-text";
export const dynamic = "force-dynamic";
export default async function CatalogCategory({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
    parent?: string;
    mediaLang?: string;
    series?: string;
    order?: string;
    focus?: string;
    kind?: string;
    domain?: string;
  }>;
}) {
  const { category } = await params;
  const query = await searchParams;
  const data = await readCatalogPage(category, query);
  if (!data) notFound();
  const source = isSourceCatalog(category) ? catalogSourceFilters(category, query) : undefined;
  const pageHref = (page: number) => {
    const href = catalogBrowseHref(category, query, page);
    const archiveQuery = new URLSearchParams({
      ...(query.mediaLang ? { mediaLang: query.mediaLang } : {}),
      ...(query.series ? { series: query.series } : {}),
    });
    return archiveQuery.size ? `${href}&${archiveQuery}` : href;
  };
  return (
    <PageShell rhythm="loose">
      <Link href="/catalog" className="text-dbz-gold">
        <T k="catalog.title" />
      </Link>
      <h1 className="mt-5 font-display text-3xl">
        <T k={`catalog.categories.${category}`} />
      </h1>
      <p className="mt-3">
        <T
          k={isArchiveCategory(category) ? "catalog.archive.count" : "catalog.count"}
          values={{ count: data.total }}
        />
      </p>
      {isArchiveCategory(category) ? (
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          <T k="catalog.archive.selection" values={{ time: archiveSelectionObservedAt }} />
        </p>
      ) : null}
      {source ? (
        <nav className="mt-5 flex flex-wrap gap-2" aria-label={category}>
          <Link
            prefetch={false}
            className="btn"
            aria-current={category === "sources" ? "page" : undefined}
            href="/catalog/sources"
          >
            <CatalogUIText name="sources" />
          </Link>
          <Link
            prefetch={false}
            className="btn"
            aria-current={category === "archive_movies" ? "page" : undefined}
            href="/catalog/archive_movies"
          >
            <CatalogUIText name="movies" />
          </Link>
          <Link
            prefetch={false}
            className="btn"
            aria-current={category === "archive_images" ? "page" : undefined}
            href="/catalog/archive_images"
          >
            <CatalogUIText name="images" />
          </Link>
        </nav>
      ) : null}
      <CatalogControls
        search={query.q ?? ""}
        parent={query.parent}
        archiveCategory={isArchiveCategory(category) ? category : undefined}
        mediaLang={query.mediaLang}
        series={query.series}
        source={source}
        category={category}
      />
      <CatalogCards items={data.items} />
      <LinkPager
        page={data.page}
        pages={Math.max(1, Math.ceil(data.total / data.pageSize))}
        href={pageHref}
      />
      <p className="mt-6 text-xs text-white/60">
        <T k="catalog.observed" values={{ time: data.observedAt }} />
      </p>
    </PageShell>
  );
}
