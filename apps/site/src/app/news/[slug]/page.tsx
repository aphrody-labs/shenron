import { hasEditorialDatabase } from "@/lib/prerender";
import { db } from "@/lib/db";
import { posts as postsTable } from "@/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { dateCourte, dateLongue } from "@/lib/dates";
import type { Metadata } from "next";
import type { Article, WithContext } from "schema-dts";

import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { AdUnit } from "@/components/ads/AdUnit";
import { SITE_URL } from "@/lib/config";
import { assetUrl } from "@/lib/assets";
import { headingsFromHtml, publicPostFilter } from "@/lib/posts";
import { listComments, reactionState } from "@/lib/social";
import { CommentThread } from "@/components/social/CommentThread";
import { LikeButton } from "@/components/social/LikeButton";
import { DomainBar } from "@/components/kit";
import { PageShell } from "@shenron/ui/layout/PageShell";
import { ArticleTocDisclosure, ArticleTocRail } from "./ArticleToc";
import { ReadingProgress } from "./ReadingProgress";

/** Anneau de focus kinto, 2 px — le même sur chaque lien de la page. */
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

/**
 * Corps de l'article : les règles `.ed-prose` (mesure, filets, listes,
 * tableaux contenus) dans la famille et la taille du corps du site ; les
 * citations gardent la serif, filet écaille à gauche.
 */
const PROSE =
  "ed-prose text-base! leading-[1.55]! lg:text-[1.0625rem]! [&_blockquote]:border-s-dbz-green! [&_blockquote]:font-serif!";

/** Page d'un thème du journal (URL toujours en minuscules). */
const tagHref = (tag: string) => `/news/theme/${encodeURIComponent(tag.toLowerCase())}`;

export const revalidate = 300;

/**
 * OBLIGATOIRE pour le cache : sous Next 16, une route à segment dynamique sans
 * `generateStaticParams` est rendue dynamiquement (`no-store`) malgré
 * `revalidate` — cf. le piège documenté dans CLAUDE.md.
 */
export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  const rows = await db
    .select({ slug: postsTable.slug })
    .from(postsTable)
    .where(publicPostFilter());
  return rows.map((r) => ({ slug: r.slug }));
}

/**
 * Charge un article visible publiquement (brouillons et programmés exclus).
 *
 * Mémoïsé par `cache()` : `generateMetadata` et le composant de page demandent
 * le MÊME article dans le même rendu. Sans mémoïsation, la requête — article
 * complet + auteur + tous les commentaires — était exécutée deux fois par page
 * générée, à chaque revalidation ISR comme à chaque build.
 *
 * Les colonnes d'auteur sont restreintes à ce qui est réellement affiché : la
 * relation `true` ramenait toute la ligne `User` (dont `discordId` et
 * `roleAdmin`) pour n'en écrire que le pseudo et l'avatar.
 */
const getPost = cache(async (slug: string) => {
  return db.query.posts.findFirst({
    where: and(eq(postsTable.slug, slug), publicPostFilter()),
    with: {
      author: { columns: { username: true, avatar: true } },
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Article introuvable" };

  // `assetUrl` d'abord : une couverture téléversée à l'admin est un chemin brut
  // (`./assets/wiki/articles/…`), servi par l'hôte d'assets et non par le site.
  const absolute = (u: string | null) => {
    const url = assetUrl(u);
    return url ? (url.startsWith("http") ? url : new URL(url, SITE_URL).toString()) : undefined;
  };
  // Déclarer `openGraph` sur une page REMPLACE l'objet hérité du layout, carte de
  // marque comprise (fait mesuré, cf. `lib/og.ts`) : un article sans couverture ni
  // `ogImage` partait donc sur Discord ou X sans la moindre vignette. On pointe
  // explicitement la carte générée par `app/opengraph-image.tsx` (1200×630).
  const social = absolute(post.ogImage ?? post.cover) ?? `${SITE_URL}/opengraph-image`;
  const description = post.seoDescription ?? post.excerpt;

  return {
    title: post.seoTitle ?? post.title,
    description,
    // Une canonique externe n'est posée que si l'article est republié depuis
    // ailleurs ; sinon la page est sa propre référence.
    alternates: { canonical: post.canonicalUrl ?? `/news/${post.slug}` },
    robots: post.noindex ? { index: false, follow: true } : undefined,
    authors: post.author?.username ? [{ name: post.author.username }] : undefined,
    openGraph: {
      type: "article",
      title: post.seoTitle ?? post.title,
      description,
      url: `/news/${post.slug}`,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.author?.username ? [post.author.username] : undefined,
      tags: post.tags ?? undefined,
      images: [{ url: social, alt: post.coverAlt ?? post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.seoTitle ?? post.title,
      description,
      images: [social],
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const headings = post.contentHtml ? headingsFromHtml(post.contentHtml) : [];
  // Un sommaire d'une seule entrée n'aide personne : il n'apparaît qu'à partir de deux.
  const hasToc = headings.length > 1;
  const firstTag = post.tags?.[0] ?? null;
  const url = `${SITE_URL}/news/${post.slug}`;

  // Fil de discussion et compteur de « j'aime » rendus côté serveur : données
  // PUBLIQUES uniquement (aucune lecture de session ici, sinon la page perdrait
  // son cache CDN). L'état personnel du lecteur est résolu par les îlots clients.
  const [thread, reactions] = await Promise.all([
    listComments({ kind: "post", id: post.id }, { page: 1, sort: "recent" }).catch(() => ({
      target: `post:${post.id}`,
      sort: "recent" as const,
      page: 1,
      pages: 1,
      total: 0,
      comments: [],
    })),
    reactionState({ kind: "post", id: post.id }, null).catch(() => ({ likes: 0, liked: false })),
  ]);
  const likes = reactions.likes;

  // Colonnes explicites : la sélection par défaut rapatriait `body`,
  // `contentJson` et `contentHtml` — l'article ENTIER, trois fois — pour
  // n'afficher qu'un titre, une vignette et une date.
  const related = await db.query.posts.findMany({
    where: and(publicPostFilter(), ne(postsTable.id, post.id)),
    orderBy: [desc(postsTable.publishedAt)],
    limit: 3,
    columns: {
      id: true,
      slug: true,
      title: true,
      cover: true,
      coverAlt: true,
      publishedAt: true,
      readingMinutes: true,
    },
  });

  const coverUrl = assetUrl(post.cover);

  const articleSchema: WithContext<Article> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription ?? post.excerpt,
    // Même résolution que la couverture affichée : un chemin brut donnait
    // `https://dragonballfr.com./assets/…`.
    image: coverUrl
      ? [coverUrl.startsWith("http") ? coverUrl : `${SITE_URL}${coverUrl}`]
      : undefined,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    wordCount: post.wordCount || undefined,
    keywords: post.tags?.length ? post.tags.join(", ") : undefined,
    inLanguage: "fr-FR",
    author: post.author?.username
      ? { "@type": "Person", name: post.author.username }
      : { "@type": "Organization", name: "Dragon Ball France" },
    publisher: {
      "@type": "Organization",
      name: "Dragon Ball France",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon-96.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };

  return (
    <>
      <JsonLd data={articleSchema} />
      <ReadingProgress />

      {/* Même colonne et même rythme vertical que le reste du site
			    (`PageShell`). Mobile d'abord : une seule colonne de lecture, le
			    sommaire repliable au-dessus du corps ; à partir de `lg`, la colonne
			    de texte et le sommaire collant côte à côte (liste-détail).

			    Typographie : la famille du corps (`font-sans`) l'emporte sur la serif
			    du contexte `.editorial` ; 16 px sur mobile, 17 px sur desktop,
			    interlignage 1,55, colonne de 38rem (≤ 72 signes). La serif ne reste
			    qu'aux citations, filet écaille à gauche : le style signale la source. */}
      <PageShell rhythm="tight" className="font-sans">
        {/* Pont staff → édition de CET article, sans repasser par la sidebar. */}
        <DomainBar
          domain="news"
          className="ed-no-print mb-6"
          actions={[{ href: `/admin/posts/${post.id}`, label: "Éditer cet article" }]}
        />

        <Breadcrumbs
          className="ed-no-print mb-8"
          items={[
            { label: "Actualités", href: "/news" },
            ...(firstTag ? [{ label: firstTag, href: tagHref(firstTag) }] : []),
            { label: post.title },
          ]}
        />

        <div
          className={
            hasToc
              ? "lg:grid lg:grid-cols-[minmax(0,38rem)_15rem] lg:justify-center lg:gap-x-16"
              : ""
          }
        >
          <div className="mx-auto min-w-0 max-w-[38rem] lg:mx-0">
            {/* ---- Titraille ------------------------------------------------- */}
            <header>
              <h1 className="text-[clamp(2rem,1.3rem+3.4vw,3.5rem)] font-[850] leading-[1.05] tracking-[-0.02em] text-balance text-[color:var(--ed-ink)]">
                {post.title}
              </h1>
              {post.excerpt && (
                <p className="mt-5 text-[1.125rem] leading-[1.55] text-pretty text-[color:var(--ed-ink-soft)] lg:text-[1.25rem]">
                  {post.excerpt}
                </p>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[color:var(--ed-rule)] py-3 text-[0.875rem] tabular-nums text-[color:var(--ed-ink-muted)]">
                {firstTag && (
                  <Link
                    href={tagHref(firstTag)}
                    className={`inline-flex min-h-11 items-center rounded-full border border-white/12 px-4 text-[color:var(--ed-ink)] hover:border-dbz-orange ${FOCUS}`}
                  >
                    {firstTag}
                  </Link>
                )}
                {post.author?.username && <span>Par {post.author.username}</span>}
                {post.publishedAt && (
                  <time dateTime={post.publishedAt.toISOString()}>
                    {dateLongue(post.publishedAt)}
                  </time>
                )}
                <span>{post.readingMinutes} min de lecture</span>
              </div>
            </header>

            {/* ---- Couverture -------------------------------------------------- */}
            {coverUrl && (
              <figure className="mt-8">
                <div className="relative -mx-[var(--shell-pad,1.5rem)] aspect-[16/9] overflow-hidden bg-[color:var(--ed-paper-sunken)] sm:mx-0 sm:rounded-lg">
                  <Image
                    src={coverUrl}
                    alt={post.coverAlt ?? ""}
                    fill
                    sizes="(max-width: 640px) 100vw, 608px"
                    className="object-cover"
                    priority
                  />
                </div>
                {post.coverCaption && (
                  <figcaption className="mt-3 text-[0.8125rem] leading-normal text-[color:var(--ed-ink-muted)]">
                    {post.coverCaption}
                  </figcaption>
                )}
              </figure>
            )}

            {/* ---- Corps -------------------------------------------------------- */}
            <article className="mt-10">
              {hasToc && <ArticleTocDisclosure headings={headings} />}

              {post.contentHtml ? (
                // HTML régénéré côté serveur depuis le document Tiptap
                // (`lib/posts.ts`) — jamais du balisage venu du navigateur.
                <div className={PROSE} dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
              ) : (
                // Repli : articles antérieurs à l'éditeur riche, encore en Markdown.
                <div className={PROSE}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
                </div>
              )}

              {/* Annonce native en fin de lecture — après le corps de l'article,
							    jamais insérée au milieu du texte (règle AdSense : l'annonce ne
							    doit pas être confondue avec le contenu éditorial). */}
              <AdUnit placement="article" className="mt-12" />

              {post.tags?.length > 0 && (
                <div className="ed-no-print mt-12 border-t border-[color:var(--ed-rule)] pt-6">
                  <h2 className="text-[0.9375rem] font-semibold text-[color:var(--ed-ink)]">
                    Thèmes
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {post.tags.map((tag) => (
                      <li key={tag}>
                        <Link
                          href={tagHref(tag)}
                          className={`inline-flex min-h-11 items-center rounded-full border border-white/12 px-4 text-[0.875rem] hover:border-dbz-orange hover:text-dbz-orange ${FOCUS}`}
                        >
                          {tag}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* ---- Participer : j'aime + discussion ---------------------- */}
              {/* Le fil est rendu ici avec sa PREMIÈRE PAGE déjà remplie côté
							    serveur (`initial`) : les commentaires restent indexables et la
							    page ne saute pas à l'hydratation. Tout le reste (tri, page 2,
							    droits du lecteur) passe par `/api/social/*`, ce qui laisse la
							    page statique/ISR cacheable par le CDN. */}
              <div className="ed-no-print mt-12 flex flex-wrap items-center gap-4 border-t border-[color:var(--ed-rule)] pt-8">
                <LikeButton
                  target={`post:${post.id}`}
                  initialLikes={likes}
                  callbackURL={`/news/${post.slug}`}
                  label="J'aime cet article"
                />
                <span className="text-[0.875rem] tabular-nums text-[color:var(--ed-ink-muted)]">
                  {thread.total > 0
                    ? `${thread.total} message${thread.total > 1 ? "s" : ""} dans la discussion`
                    : "Aucun message pour l'instant : lance la discussion ci-dessous."}
                </span>
              </div>

              <CommentThread
                className="mt-10"
                target={`post:${post.id}`}
                initial={thread}
                callbackURL={`/news/${post.slug}`}
                title="Discussion"
              />
            </article>
          </div>

          {/* ---- Sommaire collant (desktop) ------------------------------------ */}
          {hasToc && <ArticleTocRail headings={headings} />}
        </div>

        {/* ---- À lire ensuite ---------------------------------------------- */}
        {related.length > 0 && (
          <section
            aria-labelledby="a-lire-ensuite"
            className="ed-no-print mt-20 border-t border-[color:var(--ed-rule-strong)] pt-8"
          >
            <h2
              id="a-lire-ensuite"
              className="text-[1.375rem] font-[850] tracking-[-0.02em] text-[color:var(--ed-ink)]"
            >
              À lire ensuite
            </h2>
            <ul className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <li key={p.id}>
                  {p.cover && (
                    // Vignette décorative : le titre porte déjà le même lien,
                    // un seul arrêt de tabulation par article.
                    <Link
                      href={`/news/${p.slug}`}
                      tabIndex={-1}
                      aria-hidden
                      className="relative mb-3 block aspect-[16/10] overflow-hidden rounded-lg border border-white/12 bg-[color:var(--ed-paper-sunken)]"
                    >
                      <Image
                        src={assetUrl(p.cover)}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 340px"
                        className="object-cover"
                      />
                    </Link>
                  )}
                  <h3 className="text-[1.0625rem] font-semibold leading-snug">
                    <Link
                      href={`/news/${p.slug}`}
                      className={`rounded-sm hover:text-dbz-orange ${FOCUS}`}
                    >
                      {p.title}
                    </Link>
                  </h3>
                  <p className="mt-2 flex flex-wrap gap-x-4 text-[0.8125rem] tabular-nums text-[color:var(--ed-ink-muted)]">
                    {p.publishedAt && (
                      <time dateTime={p.publishedAt.toISOString()}>
                        {dateCourte(p.publishedAt)}
                      </time>
                    )}
                    <span>{p.readingMinutes} min de lecture</span>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Multiplex « contenus associés » — bas de page uniquement, après le
				    contenu éditorial et les recommandations internes. */}
        <AdUnit placement="multiplex" className="mt-20" label={null} />
      </PageShell>
    </>
  );
}
