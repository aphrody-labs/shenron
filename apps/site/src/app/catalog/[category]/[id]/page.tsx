// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogControls } from "@/components/catalog/CatalogControls";
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
  const related = [...new Map(item.related.map((link) => [link.href, link])).values()];
  return (
    <PageShell rhythm="loose">
      <article className="mx-auto min-w-0 max-w-4xl">
        <Link href={catalogHref(category)} className="text-dbz-gold">
          <T k={`catalog.categories.${category}`} />
        </Link>
        <h1 className="mt-5 break-words font-display text-3xl">{item.title}</h1>
        <CatalogControls />
        {item.image ? (
          <div className="relative mb-6 aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-xl border border-white/15 bg-dbz-card/80">
            <Image
              src={item.image}
              alt={item.title}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
            />
          </div>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-white/80">{item.description}</p>
        {item.originalHref ? (
          <Link href={item.originalHref} className="dbz-button my-5 inline-flex">
            <T k="catalog.original" />
          </Link>
        ) : null}
        {item.fields.length ? (
          <section className="mt-6">
            <h2 className="mb-3 text-xl">
              <T k="catalog.metadata" />
            </h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {item.fields.map((field) => (
                <div key={field.key} className="min-w-0 rounded-xl border border-white/15 p-4">
                  <dt className="text-sm text-dbz-gold">
                    <T k={`catalog.fields.${field.key}`} />
                  </dt>
                  <dd className="break-words">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {related.length ? (
          <section className="mt-6">
            <h2 className="mb-3 text-xl">
              <T k="catalog.relations" />
            </h2>
            <ul className="space-y-2">
              {related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} prefetch={false} className="text-dbz-gold">
                    {link.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {item.children.length ? (
          <section className="mt-6">
            <h2 className="mb-3 text-xl">
              <T k="catalog.children" />
            </h2>
            <div className="flex flex-wrap gap-3">
              {item.children.map((child) => (
                <Link
                  href={child.href}
                  key={child.category}
                  prefetch={false}
                  className="dbz-button inline-flex"
                >
                  <T k={`catalog.categories.${child.category}`} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}
        {item.assets.length ? (
          <section className="mt-6">
            <h2 className="mb-3 text-xl">
              <T k="catalog.assets" />
            </h2>
            <ul>
              {item.assets.map((asset) => (
                <li key={asset} className="min-w-0 break-all">
                  <a href={asset} rel="noreferrer" target="_blank" className="text-dbz-gold">
                    <T k="catalog.file" />: {asset}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageShell>
  );
}
