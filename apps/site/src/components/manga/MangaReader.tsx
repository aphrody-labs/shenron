"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  MangaReader as BaseMangaReader,
  type MangaReaderProps as ReaderProps,
} from "@shenron/ui/reader";
import { assetMirrorUrl } from "@shenron/config/public-urls";
import { assetUrl } from "@/lib/assets";
import { API_ORIGIN, CDN_ORIGIN } from "@/lib/config";

export type MangaReaderProps = Pick<
  ReaderProps,
  "pages" | "title" | "direction" | "prevHref" | "nextHref" | "prevPages" | "nextPages"
> & {
  chapterId?: number;
};

const renderChapterLink: NonNullable<ReaderProps["renderChapterLink"]> = ({
  href,
  children,
  className,
  ariaLabel,
}) => (
  <Link href={href} className={className} aria-label={ariaLabel} title={ariaLabel}>
    {children}
  </Link>
);

export function MangaReader({ chapterId, ...props }: MangaReaderProps) {
  const [initialPage, setInitialPage] = useState(1);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // `?page=` ; l'ancien `?planche=` (liens déjà partagés) reste lu.
    const query = new URLSearchParams(window.location.search);
    const requested = Number(query.get("page") ?? query.get("planche"));
    if (Number.isFinite(requested) && requested >= 1) setInitialPage(Math.trunc(requested));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!chapterId) return;
    try {
      const read = JSON.parse(localStorage.getItem("dbfr_read_chapters") ?? "[]");
      const ids: number[] = Array.isArray(read) ? read.map(Number) : [];
      if (!ids.includes(chapterId)) ids.push(chapterId);
      // Progression chapitre par chapitre (succès, coches du sommaire). Le « reprendre la
      // lecture » passe par l’historique transverse (`TrackHistory` → `ContinueRail`).
      localStorage.setItem("dbfr_read_chapters", JSON.stringify(ids));
    } catch (error) {
      console.error("Failed to save read chapter", error);
    }
  }, [chapterId]);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => setCurrentPage(initialPage), [initialPage]);
  const onPageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (!chapterId || !ready) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("page") === String(page) && !url.searchParams.has("planche")) return;
      url.searchParams.delete("planche");
      url.searchParams.set("page", String(page));
      window.history.replaceState(null, "", url.toString());
    },
    [chapterId, ready],
  );
  const apiPageHref = useCallback(
    (page: number) => (chapterId ? `/api/manga/chapter/${chapterId}/pages/${page}` : null),
    [chapterId],
  );
  const resolveMirrorUrl = useCallback(
    (url: string) => assetMirrorUrl(url, CDN_ORIGIN, API_ORIGIN),
    [],
  );
  return (
    <div className="m3-reader--dragon-ball">
      <BaseMangaReader
        key={initialPage}
        {...props}
        initialPage={initialPage}
        onPageChange={onPageChange}
        apiPageHref={apiPageHref}
        resolveAssetUrl={assetUrl}
        resolveMirrorUrl={resolveMirrorUrl}
        renderChapterLink={renderChapterLink}
      />
      {chapterId ? <TraductionFr chapterId={chapterId} page={currentPage} /> : null}
    </div>
  );
}

type TexteTraduit = {
  id: number | string;
  readingOrder: number;
  sourceText: string;
  translatedText: string;
};

/** Bascule « Traduction FR » : bulles traduites publiées de la planche courante. */
function TraductionFr({ chapterId, page }: { chapterId: number; page: number }) {
  const [active, setActive] = useState(false);
  const [state, setState] = useState<{ key: string; texts: TexteTraduit[] | null } | null>(null);
  const key = `${chapterId}/${page}`;
  useEffect(() => {
    if (!active || state?.key === key) return;
    const ctrl = new AbortController();
    fetch(`/api/manga/chapter/${chapterId}/pages/${page}/translation`, { signal: ctrl.signal })
      .then(async (res) =>
        res.ok ? (((await res.json()) as { texts?: TexteTraduit[] }).texts ?? []) : [],
      )
      .then((texts) => setState({ key, texts }))
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setState({ key, texts: [] });
      });
    return () => ctrl.abort();
  }, [active, chapterId, page, key, state?.key]);
  const texts = state?.key === key ? state.texts : null;
  return (
    <section className="m3-reader__translation" aria-label="Traduction française">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setActive((v) => !v)}
        className="m3-reader__translation-toggle"
      >
        Traduction FR
      </button>
      {active ? (
        texts === null ? (
          <p className="m3-reader__translation-status">Chargement…</p>
        ) : texts.length === 0 ? (
          <p className="m3-reader__translation-status">
            Aucune traduction publiée pour cette planche.
          </p>
        ) : (
          <ol className="m3-reader__translation-list">
            {texts.map((t) => (
              <li key={String(t.id)} lang="fr">
                {t.translatedText}
              </li>
            ))}
          </ol>
        )
      ) : null}
    </section>
  );
}
