// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell, LinkPager } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogCards } from "@/components/catalog/CatalogCards";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { readCatalogPage } from "@/lib/catalog-explorer";
import { catalogHref } from "@/lib/catalog-explorer-contract";
import { isArchiveCategory, archiveSelectionObservedAt } from "@/lib/archive-catalog";
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
  }>;
}) {
  const { category } = await params;
  const query = await searchParams;
  const data = await readCatalogPage(category, query);
  if (!data) notFound();
  const pageHref = (page: number) =>
    `${catalogHref(category)}?${new URLSearchParams({ ...(query.q ? { q: query.q } : {}), ...(query.parent ? { parent: query.parent } : {}), ...(query.mediaLang ? { mediaLang: query.mediaLang } : {}), ...(query.series ? { series: query.series } : {}), page: String(page) })}`;
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
      <CatalogControls
        search={query.q ?? ""}
        parent={query.parent}
        archiveCategory={isArchiveCategory(category) ? category : undefined}
        mediaLang={query.mediaLang}
        series={query.series}
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
