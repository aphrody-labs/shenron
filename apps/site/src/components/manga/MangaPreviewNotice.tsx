"use client";

import { ExternalLink } from "@aphrody/shenron-ui/external";
import type { MangaChapter } from "@/lib/db-universe";
import { useMangaUIText } from "@/lib/manga-ui-text";

export type MangaReaderExtent = MangaChapter["reader_extent"];

export function MangaPreviewBadge({ count }: { count: number }) {
  const t = useMangaUIText();
  return (
    <span data-reader-preview className="block text-xs font-semibold text-primary">
      {t("reader.preview", { count })}
    </span>
  );
}

export function MangaPreviewNotice({
  extent,
  count,
}: {
  extent: MangaReaderExtent;
  count: number;
}) {
  const t = useMangaUIText();
  if (extent?.kind !== "preview") return null;
  let sourceHref: string | null = null;
  try {
    const url = new URL(extent.sourceUrl ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) sourceHref = url.href;
  } catch {
    // Preview identification remains visible without a usable source URL.
  }
  return (
    <aside className="mb-4 space-y-2 rounded-xl border border-primary/40 bg-card p-4">
      <MangaPreviewBadge count={count} />
      <p className="text-sm text-[var(--muted-foreground)]">
        {t("reader.previewNotice", { count })}
      </p>
      {sourceHref && (
        <ExternalLink
          href={sourceHref}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        >
          {t("reader.previewSource")}
        </ExternalLink>
      )}
    </aside>
  );
}
