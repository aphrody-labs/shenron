import { Breadcrumbs } from "@/components/Breadcrumbs";
import { DomainBar } from "@/components/kit/DomainBar";
import { T } from "@/components/T";
import { WikiMarkdown } from "@/components/wiki/WikiMarkdown";
import { getWikiReaderMessages, type WikiLocale } from "@/lib/wiki-character-version-messages";
import { db } from "@/lib/db";
import { isCurrentUserAdmin } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";

/** Extrait lisible du corps markdown, pour la balise description. */
function extrait(body: string, max = 160): string {
  const nu = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_`|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return nu.length > max ? `${nu.slice(0, max - 1).trimEnd()}…` : nu;
}

// Chaque page wiki éditoriale portait le titre générique du site : ni résultat
// de recherche exploitable, ni aperçu de partage distinct sur Discord.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await db.query.wikiPages.findFirst({
    where: (p, { eq }) => eq(p.slug, slug[slug.length - 1]!),
    columns: { title: true, body: true, slug: true, visible: true },
    with: { category: { with: { parent: true } } },
  });
  // Metadata resolves before the stream (`wiki/loading.tsx` flushes a 200 otherwise):
  // an unknown slug — `/wiki/bardock.mp4` included — must answer a real 404.
  if (
    !page?.visible ||
    !page.category.visible ||
    (page.category.parent && !page.category.parent.visible)
  )
    notFound();
  return {
    title: page.title,
    // Pas de champ résumé sur `WikiPage` : on dérive un extrait du corps
    // (markdown débarrassé de sa syntaxe la plus bruyante).
    description: extrait(page.body) || `${page.title} — article du wiki Dragon Ball France.`,
    // La canonique suit le SLUG, jamais le chemin demandé. La recherche ne
    // retient que le dernier segment : `/wiki/n-importe-quoi/toriyama` servait
    // donc la même page que `/wiki/toriyama` en se déclarant canonique à SA
    // propre URL — une famille infinie de doublons indexables, fabricable
    // depuis l'extérieur. Le sitemap, lui, n'a jamais publié qu'un segment.
    alternates: { canonical: `/wiki/${page.slug}` },
  };
}

export default async function WikiPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const pageSlug = slug[slug.length - 1];

  const page = await db.query.wikiPages.findFirst({
    where: (p, { eq }) => eq(p.slug, pageSlug),
    with: { category: { with: { parent: true } } },
  });

  if (
    !page?.visible ||
    !page.category.visible ||
    (page.category.parent && !page.category.parent.visible)
  )
    notFound();

  const [isAdmin, rawLocale] = await Promise.all([
    isCurrentUserAdmin(),
    getLocale().catch(() => "fr"),
  ]);
  const locale: WikiLocale = rawLocale === "en" || rawLocale === "ja" ? rawLocale : "fr";
  const r = getWikiReaderMessages(locale);
  const dateLocale = locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "fr-FR";

  return (
    <article className="wiki-container reveal-up">
      <DomainBar domain="wiki" />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <Breadcrumbs
          items={[
            { label: "Wiki", display: <T k="wiki.breadcrumb" />, href: "/wiki" },
            ...(page.category.parent ? [{ label: page.category.parent.name }] : []),
            { label: page.category.name },
          ]}
        />
        {isAdmin && (
          <Link
            href={`/admin/wiki/page/${page.id}`}
            className="shrink-0 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dbz-orange/40 bg-dbz-orange/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-dbz-orange transition-all hover:bg-dbz-orange hover:text-encre active:scale-[0.98]"
          >
            {r("editPage")}
          </Link>
        )}
      </div>
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.045] via-dbz-card/70 to-dbz-card/30 px-6 py-7 sm:px-10 sm:py-9">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dbz-orange/60 to-transparent"
        />
        <Image
          src="/dbz/kinto-un.svg"
          alt=""
          aria-hidden
          width={240}
          height={135}
          className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 opacity-[0.1] md:block"
        />
        <p className="font-scouter text-[11px] uppercase tracking-[0.18em] text-dbz-orange">
          {page.category.parent
            ? `${page.category.parent.name} · ${page.category.name}`
            : page.category.name}
        </p>
        <h1 className="mt-2 font-saiyan text-4xl sm:text-5xl md:text-6xl font-bold tracking-wider text-white drop-shadow-[0_4px_16px_rgba(255,107,0,0.35)]">
          {page.title}
        </h1>
      </header>
      <div className="wiki-content-card">
        <div className="prose prose-invert max-w-none wiki-content">
          <WikiMarkdown body={page.body} />
        </div>
      </div>
      <footer className="pt-4 border-t border-dbz-border font-mono text-xs text-white/50">
        {r("lastUpdated", { date: new Date(page.updatedAt).toLocaleDateString(dateLocale) })}
      </footer>
    </article>
  );
}

export const dynamic = "force-dynamic";
