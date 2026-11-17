"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CollectionReader, type ReaderCollectionEdition } from "@aphrody/shenron-ui/reader";
import { MangaReader } from "./MangaReader";
import { useT } from "@/components/T";
import { colorisationDemandee, hasMixedColorization } from "@/lib/manga-editions";
import { useMangaUIText } from "@/lib/manga-ui-text";
import type { MangaReaderExtent } from "./MangaPreviewNotice";

export interface ChapterItem {
  id: number;
  series: string;
  chapter_number: number;
  title: string | null;
  volume_id?: number | null;
  cover?: string | null;
  pages?: string[] | null;
  reader_extent?: MangaReaderExtent;
}

export interface VolumeData {
  id: number;
  volume_number: number;
  series: string;
  title: string | null;
  title_ja?: string | null;
  cover: string | null;
  chapters: ChapterItem[];
}

export function UnifiedVolumeReader({
  volume,
  sourceKind,
}: {
  volume: VolumeData;
  sourceKind?: "cdn" | "editorial";
}) {
  const t = useT();
  const ui = useMangaUIText();
  const searchParams = useSearchParams();
  const chapters = useMemo(() => volume.chapters ?? [], [volume.chapters]);
  const formatChapterTitle = useCallback(
    (chapter: ChapterItem) =>
      chapter.title?.trim()
        ? /^(?:tome|volume)\s*\d+$/i.test(chapter.title.trim())
          ? ui("volume", { number: chapter.chapter_number })
          : `${ui("chapter", { number: chapter.chapter_number })} — ${chapter.title}`
        : ui("chapter", { number: chapter.chapter_number }),
    [ui],
  );
  const editions = useMemo<ReaderCollectionEdition[]>(
    () => [
      {
        id: "nb",
        label: hasMixedColorization({ series: volume.series })
          ? ui("reader.mixedScans")
          : volume.series === "DB" || volume.series === "DBS"
            ? t("mangaCatalog.frenchBlackWhiteScans")
            : ui("reader.scans"),
        chapters: chapters
          .filter((chapter) => chapter.series !== "DBFC" && chapter.pages?.length)
          .toSorted((a, b) => a.chapter_number - b.chapter_number)
          .map((chapter) => ({
            id: chapter.id,
            label: formatChapterTitle(chapter),
            pageCount: chapter.pages?.length ?? 0,
          })),
      },
      {
        id: "color",
        label: t("mangaCatalog.frenchColorScans"),
        chapters: chapters
          .filter((chapter) => chapter.series === "DBFC" && chapter.pages?.length)
          .toSorted((a, b) => a.chapter_number - b.chapter_number)
          .map((chapter) => ({
            id: chapter.id,
            label: formatChapterTitle(chapter),
            pageCount: chapter.pages?.length ?? 0,
          })),
      },
    ],
    [chapters, formatChapterTitle, t, ui, volume.series],
  );
  const initialEditionRequested =
    colorisationDemandee(searchParams?.get("edition")) === "couleur" ? "color" : "nb";
  const hasColorChapters = chapters.some(
    (chapter) =>
      (chapter.series === "DBFC" || volume.series === "DBFC") && (chapter.pages?.length ?? 0) > 0,
  );
  const hasNbChapters = chapters.some(
    (chapter) => chapter.series !== "DBFC" && (chapter.pages?.length ?? 0) > 0,
  );
  const initialEdition =
    initialEditionRequested === "color" && hasColorChapters
      ? "color"
      : !hasNbChapters && hasColorChapters
        ? "color"
        : "nb";

  const targetChapters = useMemo(() => {
    if (initialEdition === "color") {
      const col = chapters.filter(
        (chapter) =>
          (chapter.series === "DBFC" || volume.series === "DBFC") &&
          (chapter.pages?.length ?? 0) > 0,
      );
      return col.length > 0 ? col : chapters;
    }
    const nb = chapters.filter(
      (chapter) => chapter.series !== "DBFC" && (chapter.pages?.length ?? 0) > 0,
    );
    return nb.length > 0 ? nb : chapters;
  }, [chapters, initialEdition, volume.series]);

  const initialChapterNumber = Number(searchParams?.get("chapter"));
  const initialChapter = useMemo(() => {
    if (Number.isFinite(initialChapterNumber) && initialChapterNumber > 0) {
      const matchByNum = targetChapters.find(
        (chapter) => chapter.chapter_number === initialChapterNumber,
      );
      if (matchByNum) return matchByNum.id;
      if (targetChapters[initialChapterNumber - 1]) {
        return targetChapters[initialChapterNumber - 1].id;
      }
    }
    return targetChapters[0]?.id;
  }, [targetChapters, initialChapterNumber]);
  const onSelectionChange = useCallback(
    (edition: ReaderCollectionEdition, selected: { id: string | number }) => {
      const chapter = chapters.find((item) => item.id === selected.id);
      if (!chapter) return;
      const url = new URL(window.location.href);
      if (
        url.searchParams.get("chapter") === String(chapter.chapter_number) &&
        url.searchParams.get("edition") === edition.id
      )
        return;
      url.searchParams.set("chapter", String(chapter.chapter_number));
      url.searchParams.set("edition", edition.id);
      window.history.replaceState(null, "", url.toString());
    },
    [chapters],
  );
  return (
    <div className="m3-reader--dragon-ball">
      <CollectionReader
        title={volume.title || ui("volume", { number: volume.volume_number })}
        editions={editions}
        initialEdition={initialEdition}
        initialChapter={initialChapter}
        emptyLabel={ui("reader.empty")}
        contentsLabel={ui("reader.contents")}
        previousLabel={ui("reader.previous")}
        nextLabel={ui("reader.next")}
        onSelectionChange={onSelectionChange}
        renderChapter={(edition, selected, index) => {
          const chapter = chapters.find((item) => item.id === selected.id);
          if (!chapter) return null;
          const list = edition.chapters;
          const previous =
            list[index - 1] && chapters.find((item) => item.id === list[index - 1].id);
          const next = list[index + 1] && chapters.find((item) => item.id === list[index + 1].id);
          return (
            <MangaReader
              key={`${chapter.id}-${edition.id}`}
              pages={chapter.pages ?? []}
              sourceKind={sourceKind}
              title={`${volume.title || ui("volume", { number: volume.volume_number })} — ${formatChapterTitle(chapter)}`}
              direction="rtl"
              chapterId={chapter.id}
              readerExtent={chapter.reader_extent}
              prevHref={
                previous ? `?chapter=${previous.chapter_number}&edition=${edition.id}` : null
              }
              nextHref={next ? `?chapter=${next.chapter_number}&edition=${edition.id}` : null}
            />
          );
        }}
      />
    </div>
  );
}
