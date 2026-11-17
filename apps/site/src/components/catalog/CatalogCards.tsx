// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import type { ComponentProps } from "react";
import { MangaCard } from "@aphrody/shenron-ui/public/MangaCard";
import { EmptyState } from "@/components/kit/EmptyState";
import { T } from "@/components/T";
import type { CatalogCard, CatalogSummary } from "@/lib/catalog-explorer-contract";
import { CatalogUIText } from "@/lib/catalog-ui-text";
import { CATALOG_SOURCE_KINDS } from "@/lib/catalog-source-query";

import { ArchivePreview } from "./ArchivePreview";

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
            excerpt={item.archive ? undefined : item.description}
            image={item.image}
            renderImage={
              item.archive
                ? (props) => <ArchivePreview src={props.src} alt={item.title} />
                : undefined
            }
            ratio={item.category === "archive_images" ? "square" : "wide"}
            meta={
              item.archive || item.source ? (
                <>
                  {item.archive ? (
                    <>
                      <T k={"catalog.archive.series." + item.archive.series} />
                      <span aria-hidden> · </span>
                      <T k={"catalog.archive.languages." + item.archive.language} />
                    </>
                  ) : null}
                  {item.source ? (
                    <>
                      {item.archive ? <span aria-hidden> · </span> : null}
                      <span>{item.source.host}</span>
                      {CATALOG_SOURCE_KINDS.includes(
                        item.source.kind as (typeof CATALOG_SOURCE_KINDS)[number],
                      ) ? (
                        <CatalogUIText
                          name={`kinds.${item.source.kind as (typeof CATALOG_SOURCE_KINDS)[number]}`}
                        />
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : undefined
            }
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
