// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { PageShell } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { CatalogCategoryCards } from "@/components/catalog/CatalogCards";
import { readCatalogSummary } from "@/lib/catalog-explorer";
import { getDictionary } from "@/lib/i18n";
export const dynamic = "force-dynamic";
export const metadata = {
  title: getDictionary("fr").catalog.title,
  alternates: { canonical: "/catalog" },
  description: getDictionary("fr").catalog.description,
};
export default async function CatalogIndex() {
  const summary = await readCatalogSummary();
  return (
    <PageShell rhythm="loose">
      <h1 className="font-display text-3xl text-dbz-gold">
        <T k="catalog.title" />
      </h1>
      <p className="mt-3">
        <T k="catalog.description" />
      </p>
      <CatalogControls />
      <Link href="/catalog/assets" className="dbz-button mb-6 inline-flex">
        <T k="catalog.assets" />
      </Link>
      <CatalogCategoryCards categories={summary.categories} />
      <p className="mt-6 text-xs text-white/60">
        <T k="catalog.observed" values={{ time: summary.observedAt }} />
      </p>
    </PageShell>
  );
}
