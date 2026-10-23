"use client";
// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { useMangaUIText } from "@/lib/manga-ui-text";

export function MangaUnavailableNotice({ pageCount }: { pageCount: number }) {
  const t = useMangaUIText();
  if (pageCount > 0) return null;
  return (
    <aside
      data-reader-unavailable
      className="space-y-2 rounded-xl border border-white/20 bg-card p-4"
    >
      <h2 className="font-display font-semibold">{t("reader.unavailableTitle")}</h2>
      <p className="text-sm text-[var(--muted-foreground)]">{t("reader.unavailableNotice")}</p>
      <Link
        href="/wiki/contribute"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
      >
        {t("reader.suggestSource")}
      </Link>
    </aside>
  );
}
