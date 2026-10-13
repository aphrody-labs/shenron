// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { ComponentProps } from "react";
import { MangaCard } from "@aphrody/shenron-ui/public/MangaCard";
import { EmptyState } from "@/components/kit/EmptyState";
import { T } from "@/components/T";
import type { CatalogCard, CatalogSummary } from "@/lib/catalog-explorer-contract";

function CatalogCardLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} />;
}

export function CatalogCards({ items }: { items: CatalogCard[] }) {
  if (!items.length)
    return (
      <EmptyState
        title={<T k="catalog.empty" />}
        actions={[{ href: "/catalog", label: <T k="catalog.title" /> }]}
      />
    );
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <MangaCard
            href={item.href}
            title={item.title}
            excerpt={item.description}
            image={item.image}
            className="h-full break-words"
            linkComponent={CatalogCardLink}
          />
        </li>
      ))}
    </ul>
  );
}

export function CatalogCategoryCards({ categories }: Pick<CatalogSummary, "categories">) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((item) => (
        <li key={item.category} className="min-w-0">
          <MangaCard
            href={item.href}
            title={<T k={`catalog.categories.${item.category}`} />}
            meta={<T k="catalog.count" values={{ count: item.total }} />}
            className="h-full"
            linkComponent={CatalogCardLink}
          />
        </li>
      ))}
    </ul>
  );
}
