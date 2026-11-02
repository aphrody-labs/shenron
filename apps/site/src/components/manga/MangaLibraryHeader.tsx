"use client";
import { useMangaUIText } from "@/lib/manga-ui-text";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { StatTiles } from "@/components/kit";

export function MangaLibraryHeader({
  readable,
  chapters,
  total,
}: {
  readable: number;
  chapters: number;
  total: number;
}) {
  const t = useMangaUIText();
  return (
    <PageHeader
      eyebrow="Manga"
      title={t("title")}
      size="md"
      art="kinto"
      subtitle={t("lead", { readable, chapters, total })}
      className="mb-4"
    />
  );
}

export function MangaLibraryStats({
  total,
  readable,
  covered,
  chapters,
  color,
}: {
  total: number;
  readable: number;
  covered: number;
  chapters: number;
  color: number;
}) {
  const t = useMangaUIText();
  return (
    <section aria-label={t("coverage")} className="my-4 space-y-3">
      <StatTiles
        items={[
          { label: t("catalogued"), value: total, hint: t("covers", { count: covered }) },
          { label: t("readable"), value: readable },
          { label: t("indexed"), value: chapters },
          { label: t("colorChapters"), value: color },
        ]}
      />
    </section>
  );
}
