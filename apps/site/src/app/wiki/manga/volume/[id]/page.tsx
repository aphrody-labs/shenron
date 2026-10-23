import { mangaData } from "@/lib/manga-data";
import { mangaVolumeNeighbors } from "@/lib/manga-volume-neighbors";
import { hasEditorialDatabase } from "@/lib/prerender";
import { JAPANESE_FULL_COLOR_CATALOGUE } from "@aphrody/shenron-config/manga-catalogue";
import Image from "next/image";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { ExternalLink } from "@aphrody/shenron-ui/navigation/external";
import { MediaFacts } from "@/components/media/MediaFacts";
import { MediaPager } from "@/components/media/MediaPager";
import { MediaTitle } from "@/components/media/MediaTitle";
import { isEditableAsset } from "@/lib/images";
import { assetUrl } from "@/lib/db-universe";
import { ogMeta } from "@/lib/og";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Book as BookSchema, WithContext } from "schema-dts";
import { JsonLd } from "@/components/JsonLd";
import { VolumeChaptersList } from "@/components/manga/VolumeChaptersList";
import { UnifiedVolumeReader } from "@/components/manga/UnifiedVolumeReader";
import { MangaUnavailableNotice } from "@/components/manga/MangaUnavailableNotice";
import { CadreCase, PastilleTome } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";
import { idDeFiche } from "../../../_id-fiche";
import { AccesApi } from "@/components/manga/AccesApi";
import { SITE_URL } from "@/lib/config";
import { LienExterne } from "@aphrody/shenron-ui/icones";
import { T } from "@/components/T";

import { langueDe, LIBELLE_SERIE } from "@/lib/manga-editions";

export const revalidate = 3600;

// Pré-rend les tomes principaux au build → cache CDN (évite l'OOM de Next 16 sur 200+ tomes).
// dynamicParams=true permet aux autres éditions (Kanzenban, Anime Comics, etc.) d'être servies on-demand puis cachées par l'ISR.
export async function generateStaticParams() {
  if (!hasEditorialDatabase()) return [];
  if (process.env.SHENRON_BUILD_LOW_MEMORY === "1") return [];
  const readable = await mangaData.readableMangaChapters();
  const volIds = new Set(
    (readable?.chapters ?? [])
      .filter((c) => c.series === "DB" || c.series === "DBS")
      .map((c) => c.volume_id)
      .filter((v): v is number => v != null),
  );
  return [...volIds].map((id) => ({ id: String(id) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const numero = idDeFiche(id);
  const volume = numero === null ? null : await mangaData.mangaVolume(numero);
  if (!volume) return { title: "Volume Manga" };
  // Description écrite sur ce que la fiche contient RÉELLEMENT (titre du tome,
  // chapitres lisibles, planches, date) plutôt que le seul titre — qui, pour 41
  // tomes sur 42, ne dit que « Dragon Ball Vol. N » et ne distingue rien.
  const chapitres = (volume.chapters ?? []).filter(
    (c) => Array.isArray(c.pages) && c.pages.length > 0,
  );
  const planches = chapitres.reduce((n, c) => n + (c.pages?.length ?? 0), 0);
  const annee = volume.published_at ? new Date(volume.published_at * 1000).getFullYear() : null;
  const serieLisible = LIBELLE_SERIE[volume.series] ?? volume.series;
  const description = [
    `Tome ${volume.volume_number} de ${serieLisible}`,
    volume.title && !/^Dragon Ball( Super)? Vol\. \d+$/.test(volume.title)
      ? `« ${volume.title} »`
      : null,
    annee ? `paru en ${annee}` : null,
    chapitres.length > 0 ? `${chapitres.length} chapitres et ${planches} planches à lire` : null,
  ]
    .filter(Boolean)
    .join(", ")
    .concat(".");
  // Tome sans aucun chapitre lisible = contenu mince (« en cours d'ajout ») :
  // on le dé-indexe (mais reste crawlable) pour ne pas polluer l'index Google.
  return {
    title: `${serieLisible} Tome ${volume.volume_number}${
      volume.title && !/^Dragon Ball( Super)? Vol\. \d+$/.test(volume.title)
        ? ` : ${volume.title}`
        : ""
    } — Manga`,
    description,
    ...ogMeta({
      title: `${volume.series} — Volume ${volume.volume_number}`,
      description,
      image: volume.cover ? assetUrl(volume.cover) : undefined,
      canonical: `/wiki/manga/volume/${volume.id}`,
    }),
  };
}

export default async function MangaVolumePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numero = idDeFiche(id);
  const volume = numero === null ? null : await mangaData.mangaVolume(numero);
  if (!volume) notFound();

  const siblingVols = (await mangaData.mangaVolumes(volume.series))?.volumes ?? [];
  const { prev: prevVolume, next: nextVolume } = mangaVolumeNeighbors(volume, siblingVols);

  // Balisage `Book` du tome. Les épisodes, films, jeux, personnages, lieux et
  // techniques étaient déjà décrits en JSON-LD ; le manga — la moitié du
  // catalogue — ne l'était pas du tout, donc invisible comme entité pour les
  // moteurs. `isbn` et `datePublished` viennent de la base quand ils y sont.
  const titre = volume.title?.trim() || `Tome ${volume.volume_number}`;
  const chapitresLisibles = (volume.chapters ?? []).filter(
    (c) => Array.isArray(c.pages) && c.pages.length > 0,
  );
  const planchesTotal = chapitresLisibles.reduce((n, c) => n + (c.pages?.length ?? 0), 0);
  const jsonLd: WithContext<BookSchema> = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: titre,
    alternateName: volume.title_ja ?? undefined,
    bookFormat: "https://schema.org/Paperback",
    inLanguage: langueDe(volume),
    image: volume.cover ? assetUrl(volume.cover) : undefined,
    isbn: volume.isbn ?? undefined,
    datePublished: volume.published_at
      ? new Date(volume.published_at * 1000).toISOString().split("T")[0]
      : undefined,
    numberOfPages: undefined,
    position: volume.volume_number || undefined,
    isPartOf: {
      "@type": "BookSeries",
      name: LIBELLE_SERIE[volume.series] ?? volume.series,
    },
    author: { "@type": "Person", name: "Akira Toriyama" },
    publisher: { "@type": "Organization", name: "Shueisha" },
    url: `${SITE_URL}/wiki/manga/volume/${volume.id}`,
    // Les chapitres LISIBLES sont déclarés comme parties du tome : c'est ce qui
    // relie, pour un moteur comme pour un agent, la fiche du tome aux pages de
    // lecture — jusqu'ici deux ensembles d'URL sans lien sémantique entre eux.
    hasPart: chapitresLisibles.map((c) => ({
      "@type": "ComicStory" as const,
      name: c.title?.trim() || `Chapitre ${c.chapter_number}`,
      position: c.chapter_number,
      url: `${SITE_URL}/wiki/manga/${c.id}`,
      ...(c.pages?.length ? { pageStart: 1, pageEnd: c.pages.length } : {}),
    })),
  };

  const serie = LIBELLE_SERIE[volume.series] ?? volume.series;
  const pager = (v: typeof prevVolume, label: string) =>
    v
      ? {
          href: `/wiki/manga/volume/${v.id}`,
          label,
          title: v.title?.trim() || `Tome ${v.volume_number}`,
          meta: `Tome ${v.volume_number}`,
          image: v.cover,
        }
      : null;

  return (
    <>
      <JsonLd data={jsonLd} />
      {/* `min-w-0` : le carrousel du lecteur ne doit pas élargir la colonne (mobile). */}
      <PageShell rhythm="tight" className="min-w-0">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Manga", href: "/wiki/manga" },
            { label: `Tome ${volume.volume_number}` },
          ]}
        />
        <PageHeader
          size="md"
          className="mb-8"
          eyebrow={serie}
          title={<MediaTitle title={titre} titleJa={volume.title_ja} />}
        />

        <div className="grid min-w-0 gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12">
          <aside className="min-w-0 space-y-6">
            {/* Cadre de case mesuré sur le support : encre, liseré jaune, encre, coins
                vifs — et la pastille de numéro à sa place de tankōbon. */}
            <CadreCase largeur={300} className="mx-auto max-w-[220px] bg-dbz-card lg:max-w-none">
              <div className="relative overflow-hidden">
                {volume.cover ? (
                  <Image
                    src={assetUrl(volume.cover)}
                    alt={`Couverture du tome ${volume.volume_number}`}
                    width={300}
                    height={450}
                    sizes="(min-width: 1024px) 260px, 220px"
                    priority
                    unoptimized={isEditableAsset(volume.cover)}
                    className="h-auto w-full object-contain"
                  />
                ) : (
                  <div className="flex aspect-[2/3] items-center justify-center bg-zinc-900">
                    <span className="font-saiyan text-6xl text-zinc-700">
                      {volume.volume_number}
                    </span>
                  </div>
                )}
              </div>
              <PastilleTome
                numero={volume.volume_number}
                taille={56}
                className="absolute right-3 bottom-3 z-30"
              />
            </CadreCase>

            <MediaFacts
              facts={[
                { label: "Série", value: serie },
                volume.published_at && {
                  label: "Publication",
                  value: new Date(volume.published_at * 1000).toLocaleDateString("fr-FR", {
                    year: "numeric",
                    month: "long",
                  }),
                },
                volume.isbn && {
                  label: "ISBN",
                  value: <span className="font-mono break-all">{volume.isbn}</span>,
                },
                volume.source_url && {
                  label: "Source",
                  value: (
                    <ExternalLink
                      href={volume.source_url}
                      className="inline-flex min-h-11 items-center gap-1 text-dbz-orange hover:text-white"
                    >
                      Catalogue Shueisha{" "}
                      <LienExterne className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </ExternalLink>
                  ),
                },
              ]}
            />

            {volume.series === "DB" && (
              <div className="space-y-2">
                <p className="text-[13px] text-white/55">Éditions répertoriées :</p>
                <ul className="flex flex-wrap gap-1.5 text-[12px] font-semibold">
                  <li className="rounded-md border border-dbz-orange/30 bg-dbz-orange/10 px-2 py-1 text-dbz-orange">
                    Glénat FR (42)
                  </li>
                  <li className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-1 text-fuchsia-200">
                    <T
                      k="mangaCatalog.japaneseOriginalCatalogueStatus"
                      values={JAPANESE_FULL_COLOR_CATALOGUE}
                    />
                  </li>
                  <li className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                    Tankōbon JA
                  </li>
                  <li className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-white/70">
                    Kanzenban
                  </li>
                </ul>
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-10">
            <MangaUnavailableNotice pageCount={planchesTotal} />
            {/* `UnifiedVolumeReader` lit `useSearchParams()` (chapitre et édition demandés).
                Sans frontière `Suspense` à lui, Next abandonnait le rendu serveur de TOUTE
                la route (`BAILOUT_TO_CLIENT_SIDE_RENDERING`) : le HTML servi ne contenait que
                le squelette — ni `<h1>`, ni sommaire. La frontière limite le rendu client
                au lecteur. */}
            {planchesTotal > 0 && (
              <section aria-label="Lecteur du tome" className="min-w-0">
                <Suspense
                  fallback={
                    <div className="aspect-[2/3] w-full max-w-md animate-pulse rounded-xl bg-white/[0.04]" />
                  }
                >
                  <UnifiedVolumeReader volume={volume} sourceKind={volume.sourceKind} />
                </Suspense>
              </section>
            )}

            <section aria-label="Sommaire des chapitres" className="space-y-5">
              <SectionHeading level={3} title="Sommaire des chapitres" />
              <VolumeChaptersList chapters={volume.chapters} />
            </section>

            <AccesApi
              chemin={`/api/manga/volume/${volume.id}`}
              legende={
                planchesTotal > 0
                  ? `${chapitresLisibles.length} chapitres, ${planchesTotal} planches`
                  : "métadonnées du tome"
              }
              variantes={
                chapitresLisibles[0]
                  ? [
                      {
                        label: "Chapitre",
                        chemin: `/api/manga/chapter/${chapitresLisibles[0].id}`,
                      },
                      {
                        label: "Planche 1",
                        chemin: `/api/manga/chapter/${chapitresLisibles[0].id}/pages/1`,
                      },
                    ]
                  : []
              }
            />

            <MediaPager
              ariaLabel="Navigation entre tomes"
              ratio="poster"
              prev={pager(prevVolume, "Tome précédent")}
              next={pager(nextVolume, "Tome suivant")}
            />
          </div>
        </div>
      </PageShell>
    </>
  );
}
