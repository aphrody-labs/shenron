// SPDX-License-Identifier: Apache-2.0
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/kit";
import { T } from "@/components/T";
import { CatalogControls } from "@/components/catalog/CatalogControls";
import { ogMeta } from "@/lib/og";
import { DEFAULT_PUBLIC_ORIGINS } from "@aphrody/shenron-config/public-urls";
import {
  readSourcePublication,
  readPublicationBody,
  publicationDocumentHref,
} from "@/lib/public-source-publication";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const publication = await readSourcePublication(slug);
  const doc = publication?.documents.find((entry) => entry.sourceUrl === publication.sourceUrl);
  if (!publication || !doc) return { robots: { index: false } };
  return {
    title: doc.title,
    ...ogMeta({ title: doc.title, type: "article", canonical: `/publications/${slug}` }),
  };
}

export default async function PublicSourcePublication({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { slug } = await params;
  const publication = await readSourcePublication(slug);
  if (!publication) notFound();
  const { source } = await searchParams;
  const doc =
    source === undefined
      ? publication.documents.find((entry) => entry.sourceUrl === publication.sourceUrl)
      : publication.documents.find(
          (entry) => Buffer.from(entry.sourceUrl).toString("base64url") === source,
        );
  if (!doc) notFound();
  const body = await readPublicationBody(doc);
  return (
    <PageShell rhythm="loose">
      <article className="mx-auto min-w-0 max-w-4xl">
        <Link href="/catalog" className="text-dbz-gold">
          <T k="catalog.title" />
        </Link>
        <h1 className="my-5 break-words font-display text-3xl sm:text-5xl">{doc.title}</h1>
        <a
          href={doc.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="dbz-button inline-flex break-all"
        >
          <T k="catalog.original" />
        </a>
        <p className="my-5 text-sm text-white/60">
          <time dateTime={publication.publishedAt}>{publication.publishedAt}</time>
        </p>
        <CatalogControls />
        <div className="my-6 whitespace-pre-wrap break-words text-base leading-relaxed text-white/85">
          {body}
        </div>
        {doc.media.length ? (
          <section className="my-6 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {doc.media.map((media) => (
              <a
                key={media.path}
                href={new URL(media.path, DEFAULT_PUBLIC_ORIGINS.cdn).href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 overflow-hidden rounded-xl border border-white/15 p-3"
              >
                {media.mime?.startsWith("image/") ? (
                  <Image
                    src={new URL(media.path, DEFAULT_PUBLIC_ORIGINS.cdn).href}
                    alt={doc.title}
                    width={800}
                    height={600}
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="h-auto w-full object-contain"
                  />
                ) : (
                  <span className="break-all">{media.mime}</span>
                )}
              </a>
            ))}
          </section>
        ) : null}
        <nav className="mt-8" aria-label={publication.title}>
          <h2 className="mb-4 text-xl">
            <T k="catalog.relations" />
          </h2>
          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {publication.documents.map((entry) => (
              <li key={entry.sourceUrl} className="min-w-0">
                <Link
                  href={publicationDocumentHref(slug, entry.sourceUrl)}
                  prefetch={false}
                  aria-current={entry.sourceUrl === doc.sourceUrl ? "page" : undefined}
                  className="block break-words rounded-xl border border-white/15 p-4 text-dbz-gold"
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </PageShell>
  );
}
