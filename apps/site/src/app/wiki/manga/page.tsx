import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { JAPANESE_FULL_COLOR_CATALOGUE } from "@aphrody/shenron-config/manga-catalogue";
import { MangaLibraryHeader, MangaLibraryStats } from "@/components/manga/MangaLibraryHeader";
import { MangaUIText } from "@/lib/manga-ui-text";
import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import { T } from "@/components/T";
import { ContributeRail } from "@/components/kit";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageBanner } from "@/components/media/PageBanner";
import { ContinueRail } from "@/components/history/ContinueRail";
import { dbUniverse } from "@/lib/db-universe";
import { pageHero } from "@/lib/banner-config";
import { MangaVolumeGrid } from "@/components/manga/MangaVolumeGrid";
import { MangaInfoSection } from "@/components/manga/MangaInfoSection";
import { SERIE_COULEUR } from "@/lib/manga-editions";
import { MangaDialogueSearch } from "@/components/manga/MangaDialogueSearch";
import { ogMeta } from "@/lib/og";
import { LibraryNav } from "@/components/library/LibraryNav";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import IndexLoading from "./IndexLoading";

export const revalidate = 3600;

const title = "Manga Dragon Ball — l'œuvre originale";
const description =
  "Découvre les tomes de Dragon Ball et Dragon Ball Super, et lis les chapitres planche par planche dans le lecteur de scan DBFR.";

export const metadata: Metadata = {
  title,
  description,
  ...ogMeta({
    title: "Manga Dragon Ball — tomes & chapitres",
    description,
    type: "website",
    canonical: "/wiki/manga",
  }),
};

export default function MangaIndexPage() {
  return (
    <Suspense fallback={<IndexLoading />}>
      <MangaIndexContent />
    </Suspense>
  );
}

async function MangaIndexContent() {
  const [
    dbVols,
    dbsVols,
    dbkzVols,
    soshuhenVols,
    animeZVols,
    animeMovieVols,
    dbgtAnimeVols,
    dbsAnimeVols,
    dbjpVols,
    araleVols,
    catalogVols,
    readableData,
    mediaWorksList,
  ] = await Promise.all([
    dbUniverse.mangaVolumes("DB"),
    dbUniverse.mangaVolumes("DBS"),
    dbUniverse.mangaVolumes("DBKZ"),
    dbUniverse.mangaVolumes("SOSH"),
    dbUniverse.mangaVolumes("DBZ_ANIME_COMICS"),
    dbUniverse.mangaVolumes("DB_MOVIES"),
    dbUniverse.mangaVolumes("DBGT_ANIME_COMICS"),
    dbUniverse.mangaVolumes("DBS_ANIME_COMICS"),
    dbUniverse.mangaVolumes("DBJP"),
    dbUniverse.mangaVolumes("ARALE"),
    dbUniverse.mangaCatalogVolumes(),
    dbUniverse.readableMangaChapters(),
    dbUniverse.mediaWorks({ kind: "manga" }),
  ]);

  const mediaWorks = mediaWorksList ?? [];

  const mapVolumes = (
    vols: {
      volumes?: Array<{
        id: number;
        series: string;
        volume_number: number;
        title: string | null;
        cover: string | null;
        source_url?: string | null;
        source_label?: string | null;
      }>;
    } | null,
  ) =>
    (vols?.volumes ?? [])
      .filter((v) => v.volume_number > 0)
      .map((v) => ({
        id: v.id,
        series: v.series,
        volumeNumber: v.volume_number,
        title: v.title,
        cover: v.cover,
        sourceUrl: v.source_url ?? null,
        sourceLabel: v.source_label ?? null,
      }));

  const dbVolumes = mapVolumes(dbVols);
  const dbsVolumes = mapVolumes(dbsVols);
  const kanzenbanVolumes = mapVolumes(dbkzVols);
  const soshuhenVolumes = mapVolumes(soshuhenVols);
  const animeZVolumes = mapVolumes(animeZVols);
  const animeMovieVolumes = mapVolumes(animeMovieVols);
  const dbjpVolumes = mapVolumes(dbjpVols);
  const dbgtAnimeVolumes = mapVolumes(dbgtAnimeVols);
  const dbsAnimeVolumes = mapVolumes(dbsAnimeVols);
  const araleVolumes = mapVolumes(araleVols);
  const catalogVolumes = mapVolumes(catalogVols);

  const allChapters = readableData?.chapters ?? [];

  // The catalogue sends chapter metadata once for client filtering and pagination.
  // Reader pages stay on their detail route; only three real preview URLs are warmed on intent.
  const colorChapters = allChapters.filter((ch) => ch.series === SERIE_COULEUR);
  const colorVolumeIds = [
    ...new Set(colorChapters.map((ch) => ch.volume_id).filter((v): v is number => v != null)),
  ];

  const readableChapters = allChapters.map((ch) => ({
    id: ch.id,
    chapter_number: ch.chapter_number,
    title: ch.title,
    series: ch.series,
    cover: ch.cover,
    // Cards only warm the first three images; the reader fetches the full chapter.
    pages: ch.pages?.slice(0, 3),
    volume_id: ch.volume_id,
  }));

  // L'éditeur des bannières pilote explicitement ce hero. Les couvertures restent
  // dans la grille : elles ne doivent pas masquer une valeur administrée.
  const heroImage = await pageHero("manga");
  const allVolumes = [
    ...dbVolumes,
    ...dbsVolumes,
    ...kanzenbanVolumes,
    ...soshuhenVolumes,
    ...animeZVolumes,
    ...animeMovieVolumes,
    ...dbgtAnimeVolumes,
    ...dbsAnimeVolumes,
    ...dbjpVolumes,
    ...araleVolumes,
  ];
  const displayedSeries = new Set(allVolumes.map((volume) => volume.series));
  const otherVolumes = catalogVolumes.filter((volume) => !displayedSeries.has(volume.series));
  const completeCatalog = [...allVolumes, ...otherVolumes];
  const readableVolumeIds = new Set(
    allChapters.map((chapter) => chapter.volume_id).filter((id): id is number => id != null),
  );
  for (const volumeId of colorVolumeIds) readableVolumeIds.add(volumeId);
  const readableVolumeCount = completeCatalog.filter((volume) =>
    readableVolumeIds.has(volume.id),
  ).length;
  const coveredVolumes = completeCatalog.filter((volume) => Boolean(volume.cover?.trim())).length;

  return (
    <PageShell rhythm="tight">
      <Breadcrumbs className="mb-4" items={[{ label: "Manga" }]} />
      <MangaLibraryHeader
        readable={readableVolumeCount}
        chapters={allChapters.length}
        total={completeCatalog.length}
      />
      <LibraryNav />
      <ContinueRail kinds={["chapter"]} titleKey="history.resumeReading" />
      <MangaVolumeGrid
        dbVolumes={dbVolumes}
        dbsVolumes={dbsVolumes}
        kanzenbanVolumes={kanzenbanVolumes}
        soshuhenVolumes={soshuhenVolumes}
        animeZVolumes={animeZVolumes}
        animeMovieVolumes={animeMovieVolumes}
        dbgtAnimeVolumes={dbgtAnimeVolumes}
        dbsAnimeVolumes={dbsAnimeVolumes}
        dbjpVolumes={dbjpVolumes}
        araleVolumes={araleVolumes}
        otherVolumes={otherVolumes}
        readableChapters={readableChapters}
        colorVolumeIds={colorVolumeIds}
        colorChapterCount={colorChapters.length}
      />
      <details className="mt-4 rounded-xl border border-border bg-card p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">
          <MangaUIText name="dialogue" />
        </summary>
        <MangaDialogueSearch />
      </details>
      <details className="mt-4 rounded-xl border border-border bg-card p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-foreground">
          <MangaUIText name="details" />
        </summary>
        <PageBanner src={heroImage} alt="" position="top" className="mt-3" priority={false} />
        <MangaLibraryStats
          total={completeCatalog.length}
          readable={readableVolumeCount}
          covered={coveredVolumes}
          chapters={allChapters.length}
          color={colorChapters.length}
        />
        <p className="text-sm text-[var(--muted-foreground)]">
          <MangaUIText name="sourceLead" />
          {" : "}
          <Link
            href="/sources/dragon-ball"
            className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline"
          >
            <MangaUIText name="sources" />
          </Link>
        </p>

        {mediaWorks
          .filter((work) => work.editions.length > 0)
          .map((mediaWork) => (
            <section key={mediaWork.id} className="mb-10 space-y-4">
              <SectionHeading
                level={3}
                title={<T k="mangaCatalog.editionsForWork" values={{ title: mediaWork.title }} />}
                actions={
                  // Point d’entrée JSON du même inventaire : un lien interne ordinaire, pas un
                  // nouvel onglet (sous Tauri, `target=_blank` ouvrirait une fenêtre orpheline).
                  <a
                    href={`/api/wiki/media?slug=${encodeURIComponent(mediaWork.slug)}`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:underline"
                  >
                    <T k="mangaCatalog.catalogueData" />
                  </a>
                }
              />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {mediaWork.editions.map((ed) => (
                  <li key={ed.id} className="rounded-xl border border-border bg-card p-4">
                    <p className="flex items-center justify-between gap-2 text-[12px] text-[var(--muted-foreground)]">
                      <span>{ed.edition}</span>
                      <span className="font-semibold text-dbz-orange">{ed.language}</span>
                    </p>
                    <p className="mt-1 font-display font-semibold text-foreground">{ed.label}</p>
                    <p className="mt-2 flex items-center justify-between gap-2 text-[13px] text-[var(--muted-foreground)]">
                      <span>{ed.publisher}</span>
                      {ed.edition !== "full_color" && (
                        <span className="tabular-nums text-foreground">
                          <T k="mangaCatalog.volumeCount" values={{ count: ed.volumes_count }} />
                        </span>
                      )}
                    </p>
                    <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
                      <T k={`mangaCatalog.pageColor.${ed.page_color}`} />
                    </p>
                    {ed.volumes.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm">
                        {ed.volumes.map((volume) => (
                          <li key={volume.id}>
                            {volume.href ? (
                              <Link
                                href={volume.href}
                                className="inline-flex min-h-11 items-center text-dbz-orange hover:underline"
                              >
                                {volume.title ?? `#${volume.number}`}
                              </Link>
                            ) : (
                              <span>{volume.title ?? `#${volume.number}`}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {mediaWork.slug === "dragon-ball" && ed.edition === "full_color" && (
                      <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                        <T
                          k="mangaCatalog.japaneseOriginalCatalogueStatus"
                          values={JAPANESE_FULL_COLOR_CATALOGUE}
                        />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}

        <MangaInfoSection />
      </details>
      <ContributeRail className="mt-14" quoiKey="kit.contribute.what.volume" />
    </PageShell>
  );
}
