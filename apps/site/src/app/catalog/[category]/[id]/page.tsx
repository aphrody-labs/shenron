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
        {item.archive ? (
          <section className="my-5 space-y-3 rounded-xl border border-white/15 p-4">
            <p className="text-sm">
              <T k="catalog.archive.status" />
            </p>
            <p>
              <T k={"catalog.archive.series." + item.archive.series} /> ·{" "}
              <T k={"catalog.archive.languages." + item.archive.language} />
            </p>
            <p className="text-sm text-white/60">
              <T k="catalog.archive.checked" values={{ time: item.archive.checkedAt }} />
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={item.archive.url} target="_blank" rel="noreferrer" className="btn">
                <T k="catalog.archive.source" />
              </a>
              <a href={item.archive.mediaUrl} target="_blank" rel="noreferrer" className="btn">
                <T k="catalog.archive.file" />
              </a>
            </div>
            <details>
              <summary className="cursor-pointer">
                <T k="catalog.archive.provenance" />
              </summary>
              <p className="mt-3 break-all text-sm">
                {item.archive.mediaFile} · {item.archive.mediaMime} ·{" "}
                <T k="catalog.bytes" values={{ size: item.archive.mediaBytes }} />
              </p>
              <p className="mt-2 break-all text-xs">
                <T k="catalog.archive.metadataChecksum" />: {item.archive.metadataSha256}
              </p>
            </details>
          </section>
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
