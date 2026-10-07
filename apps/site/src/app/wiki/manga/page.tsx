import { PageShell } from "@shenron/ui/layout/PageShell";
import { JAPANESE_FULL_COLOR_CATALOGUE } from "@shenron/config/manga-catalogue";
import { PageHeader } from "@shenron/ui/layout/PageHeader";
import { SectionHeading } from "@shenron/ui/layout/SectionHeading";
import { T } from "@/components/T";
import { ContributeRail, StatTiles } from "@/components/kit";
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

export default async function MangaIndexPage() {
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
    dbUniverse.mediaWorks({ slug: "dragon-ball" }),
  ]);

  const mediaWork = (mediaWorksList ?? [])[0] ?? null;

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

  // L'édition couleur compte 520 chapitres. Les sérialiser un par un dans la
  // grille ajoutait ~470 Ko à cette page (charge RSC + DOM dupliqués) pour un
  // contenu qu'on navigue de toute façon par tome. On ne transmet donc
  // que les TOMES concernés et le total ; le détail vit sur la fiche du tome.
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
    pages: ch.pages,
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

  const lead =
    readableVolumeCount > 0
      ? `${readableVolumeCount.toLocaleString("fr-FR")} tomes à lire et ${allChapters.length.toLocaleString("fr-FR")} chapitres disponibles, parmi ${completeCatalog.length.toLocaleString("fr-FR")} tomes répertoriés.`
      : `${completeCatalog.length.toLocaleString("fr-FR")} tomes répertoriés — les lectures disponibles apparaîtront ici au fur et à mesure de leur publication.`;

  return (
    <PageShell rhythm="tight">
      <Breadcrumbs className="mb-4" items={[{ label: "Manga" }]} />
      <PageHeader eyebrow="Manga" title="Lecteur de scan" subtitle={lead} className="mb-6" />
      <LibraryNav />
      <PageBanner src={heroImage} alt="Couverture du manga Dragon Ball" position="top" />
      <ContinueRail kinds={["chapter"]} titleKey="history.resumeReading" />
      <MangaDialogueSearch />
      <section aria-label="Couverture du catalogue manga" className="my-8 space-y-3">
        <StatTiles
          items={[
            {
              label: "Tomes répertoriés",
              value: completeCatalog.length,
              hint: `${coveredVolumes} avec couverture`,
            },
            { label: "Tomes lisibles", value: readableVolumeCount, hint: "planches servies ici" },
            { label: "Chapitres indexés", value: allChapters.length },
            { label: "Chapitres en couleur", value: colorChapters.length },
          ]}
        />
        <p className="text-sm text-white/60">
          Éditeurs, archives et corpus attribués :{" "}
          <Link
            href="/sources/dragon-ball"
            className="inline-flex min-h-11 items-center font-semibold text-dbz-orange hover:text-white"
          >
            provenance des sources
          </Link>
        </p>
      </section>

      {mediaWork?.editions && mediaWork.editions.length > 0 && (
        <section aria-label="Éditions du manga" className="mb-10 space-y-4">
          <SectionHeading
            level={3}
            title={`Éditions référencées — ${mediaWork.title}`}
            actions={
              // Point d’entrée JSON du même inventaire : un lien interne ordinaire, pas un
              // nouvel onglet (sous Tauri, `target=_blank` ouvrirait une fenêtre orpheline).
              <a
                href="/api/wiki/media?series=DB"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-dbz-orange hover:text-white"
              >
                Données JSON (/api/wiki/media)
              </a>
            }
          />
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mediaWork.editions.map((ed) => (
              <li key={ed.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="flex items-center justify-between gap-2 text-[12px] text-white/55">
                  <span>{ed.edition}</span>
                  <span className="font-semibold text-dbz-orange">{ed.language}</span>
                </p>
                <p className="mt-1 font-display font-semibold text-white">{ed.label}</p>
                <p className="mt-2 flex items-center justify-between gap-2 text-[13px] text-white/60">
                  <span>{ed.publisher ?? "Éditeur officiel"}</span>
                  {ed.edition !== "full_color" && (
                    <span className="tabular-nums text-white/80">
                      {ed.volumes_count > 0 ? `${ed.volumes_count} tomes` : "Indexé"}
                    </span>
                  )}
                </p>
                {ed.edition === "full_color" && (
                  <p className="mt-2 text-[12px] leading-relaxed text-white/60">
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
      )}

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

      <MangaInfoSection />
      <ContributeRail className="mt-14" quoiKey="kit.contribute.what.volume" />
    </PageShell>
  );
}
