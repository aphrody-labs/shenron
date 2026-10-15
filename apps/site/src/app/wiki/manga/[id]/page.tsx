import { mangaData } from "@/lib/manga-data";
import { hasEditorialDatabase } from "@/lib/prerender";
import { assetUrl } from "@/lib/db-universe";
import { MangaReader } from "@/components/manga/MangaReader";
import { ogMeta } from "@/lib/og";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TrackHistory } from "@/components/history/TrackHistory";
import { ShareButton } from "@/components/ShareButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import Link from "next/link";
import { Livre, Palette } from "@aphrody/shenron-ui/icones";
import { estChapitreCouleur, langueDe, libelleSerie, SERIE_COULEUR } from "@/lib/manga-editions";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { idDeFiche } from "../../_id-fiche";
import { JsonLd } from "@/components/JsonLd";
import { AccesApi } from "@/components/manga/AccesApi";
import { SITE_URL } from "@/lib/config";
import { readingLabel, readingTitle } from "@/lib/manga-reader-title";
import type { ComicStory, WithContext } from "schema-dts";

import type { Metadata } from "next";

export const revalidate = 3600;

// Pré-rend les chapitres principaux au build → cache CDN (sans ça, Next 16 rend la
// route dynamiquement, no-store). dynamicParams=true : nouveaux chapitres on-demand.
export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const data = await mangaData.readableMangaChapters();
  // Les éditions volumineuses (Full Color 520 chapitres, Kanzenban, Anime Comics, etc.)
  // sont volontairement exclues du pré-rendu pour éviter l'OOM au build Next 16.
  // `dynamicParams` restant à `true`, ces chapitres sont rendus à la demande puis mis en cache par l'ISR.
  return (data?.chapters ?? [])
    .filter((c) => c.series === "DB" || c.series === "DBS")
    .map((c) => ({ id: String(c.id) }));
}

// Un titre est « générique » quand il ne fait que répéter le numéro (« Chapitre 12 »,
// « Tome 3 », « Chapter 5 ») : dans ce cas on n'affiche pas de sous-titre pour éviter
// la redondance « Chapitre N — Chapitre N » (145/147 chapitres sont dans ce cas).
const isGenericTitle = (t?: string | null) =>
  !t || /^(chapitre|tome|chapter)\s*\d+$/i.test(t.trim());

function chapterTitle(chapter: { chapter_number: number; title: string | null }): string {
  return readingTitle(chapter);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numero = idDeFiche(id);
  const chapter = numero === null ? null : await mangaData.mangaChapter(numero);
  if (!chapter) return { title: "Manga Dragon Ball" };
  const label = chapterTitle(chapter);
  // La description tenait en une phrase identique pour les 665 chapitres : même
  // texte, même longueur, aucun mot propre au chapitre → Google la classait en
  // « description dupliquée » et la réécrivait. On y met ce qui distingue
  // réellement cette page : le titre du chapitre, le tome, le nombre de
  // planches, et l'état de la transcription.
  const planches = chapter.pages?.length ?? 0;
  const morceaux = [
    isGenericTitle(chapter.title)
      ? `${readingLabel(chapter)} du manga Dragon Ball`
      : `« ${chapter.title} » — chapitre ${chapter.chapter_number} du manga Dragon Ball`,
    planches > 0 ? `${planches} planches à lire en ligne` : null,
    "navigation planche par planche, lecture japonaise (droite à gauche)",
  ].filter(Boolean);
  const description = `${morceaux.join(", ")}.`;
  return {
    title: `${label} — Manga Dragon Ball`,
    description,
    ...ogMeta({
      title: label,
      description,
      image: chapter.cover ? assetUrl(chapter.cover) : undefined,
      canonical: `/wiki/manga/${chapter.id}`,
    }),
  };
}

export default async function MangaReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = idDeFiche(id);
  const chapter = numero === null ? null : await mangaData.mangaChapter(numero);

  if (!chapter) notFound();

  const couleur = estChapitreCouleur(chapter);
  const planches = chapter.pages?.length ?? 0;

  // Un chapitre est une œuvre à part entière (`ComicStory`), rattachée à son
  // tome : sans ce balisage, les 665 pages de lecture n'étaient pour un moteur
  // que des galeries d'images sans auteur, sans série et sans position — d'où
  // l'absence totale du manga dans les résultats enrichis.
  const jsonLd: WithContext<ComicStory> = {
    "@context": "https://schema.org",
    "@type": "ComicStory",
    name: chapterTitle(chapter),
    position: chapter.chapter_number,
    inLanguage: langueDe(chapter),
    author: { "@type": "Person", name: "Akira Toriyama" },
    publisher: { "@type": "Organization", name: "Shueisha" },
    image: chapter.cover ? assetUrl(chapter.cover) : undefined,
    // `numberOfPages` n'existe pas sur `ComicStory` (schema.org le réserve aux
    // livres) : le nombre de planches passe par `pageStart`/`pageEnd`.
    ...(planches > 0 ? { pageStart: 1, pageEnd: planches } : {}),
    url: `${SITE_URL}/wiki/manga/${chapter.id}`,
    isPartOf: chapter.volume_id
      ? { "@type": "Book", url: `${SITE_URL}/wiki/manga/volume/${chapter.volume_id}` }
      : undefined,
  };

  const serie = libelleSerie(chapter.series ?? "");
  const generique = isGenericTitle(chapter.title);

  return (
    // `min-w-0` : le carrousel paginé du lecteur (Swiper) impose sinon sa largeur
    // min-content à la colonne et fait défiler la page horizontalement sur mobile.
    <PageShell rhythm="tight" className="min-w-0">
      <JsonLd data={jsonLd} />
      <TrackHistory
        kind="chapter"
        id={chapter.id}
        title={chapterTitle(chapter)}
        href={`/wiki/manga/${chapter.id}`}
        caption={`${chapter.series ?? "Manga"} · ${readingLabel(chapter)}`}
      />
      <Breadcrumbs
        className="mb-4"
        items={[{ label: "Manga", href: "/wiki/manga" }, { label: readingLabel(chapter) }]}
      />
      <PageHeader
        size="md"
        className="mb-6"
        eyebrow={serie}
        title={
          generique ? (
            <>
              <span className="tabular-nums">{readingLabel(chapter)}</span>
            </>
          ) : (
            chapter.title
          )
        }
        subtitle={
          planches > 0 ? `${planches} planches, lecture japonaise (de droite à gauche).` : undefined
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FavoriteButton
          kind="chapter"
          id={chapter.id}
          title={chapterTitle(chapter)}
          href={`/wiki/manga/${chapter.id}`}
          caption={`${chapter.series ?? "Manga"} · ${readingLabel(chapter)}`}
        />
        <ShareButton
          title={chapterTitle(chapter)}
          text={`${chapter.series ?? "Manga"} — ${readingLabel(chapter)}`}
          path={`/wiki/manga/${chapter.id}`}
        />
        {/* Passerelle entre éditions. Elle vise la fiche du TOME et non un chapitre
            précis : la correspondance exacte n’existe pas dans un sens (un tome noir et
            blanc = une douzaine de chapitres couleur), et proposer un chapitre au hasard
            vaudrait moins que de laisser choisir. */}
        {chapter.volume_id !== null &&
          (chapter.series === "DB" || chapter.series === SERIE_COULEUR) && (
            <Link
              href={`/wiki/manga/volume/${chapter.volume_id}?edition=${couleur ? "nb" : "color"}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 font-display text-sm font-semibold text-white/85 transition-colors hover:border-dbz-orange/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60"
            >
              {couleur ? (
                <Livre className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Palette className="h-4 w-4" aria-hidden="true" />
              )}
              {couleur ? "Lire en noir et blanc" : "Lire en couleur"}
            </Link>
          )}
      </div>

      <MangaReader
        pages={chapter.pages}
        sourceKind={chapter.sourceKind}
        title={chapterTitle(chapter)}
        prevHref={chapter.prev ? `/wiki/manga/${chapter.prev}` : null}
        nextHref={chapter.next ? `/wiki/manga/${chapter.next}` : null}
        prevPages={chapter.prevPages}
        nextPages={chapter.nextPages}
        chapterId={chapter.id}
        readerExtent={chapter.reader_extent}
      />

      <AccesApi
        className="mt-8"
        chemin={`/api/manga/chapter/${chapter.id}`}
        legende={`${planches} planches adressables une à une`}
        variantes={[
          { label: "Texte", chemin: `/api/manga/chapter/${chapter.id}?format=text` },
          { label: "Planche 1", chemin: `/api/manga/chapter/${chapter.id}/pages/1` },
          {
            label: "Image",
            chemin: `/api/manga/chapter/${chapter.id}/pages/1?format=image`,
          },
        ]}
      />
    </PageShell>
  );
}
