// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { CatalogRecordContent } from "@/components/catalog/CatalogRecordContent";
import { readCatalogDetail } from "@/lib/catalog-explorer";
import { catalogHref } from "@/lib/catalog-explorer-contract";
export const dynamic = "force-dynamic";
export default async function CatalogRecord({
  params,
}: {
  params: Promise<{ category: string; id: string }>;
}) {
  const { category, id } = await params;
  const item = await readCatalogDetail(category, id);
  if (!item) notFound();
  return (
    <PageShell rhythm="loose">
      <article className="mx-auto min-w-0 max-w-4xl">
        <Link href={catalogHref(category)} className="text-dbz-gold">
          <T k={`catalog.categories.${category}`} />
        </Link>
        <h1 className="mt-5 break-words font-display text-3xl">{item.title}</h1>
        <CatalogControls />
        <CatalogRecordContent item={item} />
      </article>
    </PageShell>
  );
}
