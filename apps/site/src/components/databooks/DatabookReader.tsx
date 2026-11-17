// SPDX-License-Identifier: Apache-2.0
"use client";
/* oxlint-disable react/exhaustive-effect-dependencies, react/set-state-in-effect -- reviewed: legacy reader page sync */
import { useCallback, useEffect, useState } from "react";
import { StudioSourceLink } from "@/components/studio/StudioSourceLink";
import {
  DatabookReader as BaseDatabookReader,
  type DatabookReaderPage,
  useKoharuCanvasWarmup,
} from "@aphrody/shenron-ui/reader";
import { TranscriptionTexte } from "./TranscriptionTexte";
import { readerAssetUrl } from "@/lib/reader-assets";
import { API_ORIGIN, CDN_ORIGIN, SITE_URL } from "@/lib/config";
import { useReglages } from "@/lib/use-capacites";
import { optimizedSrc, optimizedSrcSet } from "@/lib/images";

export type { DatabookReaderPage };
export type DatabookReaderProps = {
  pages: DatabookReaderPage[];
  title: string;
  bookId?: number | string | null;
};

export function DatabookReader({ pages, title, bookId }: DatabookReaderProps) {
  const canvasWarmup = useKoharuCanvasWarmup();
  const { prechargement } = useReglages();
  const [currentPage, setCurrentPage] = useState(Number(pages[0]?.number) || 1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const requested = Number(query.get("page") ?? query.get("planche"));
    if (Number.isFinite(requested) && requested >= 1) {
      setCurrentPage(Math.trunc(requested));
    }
    setReady(true);
  }, [bookId]);

  const onPageChange = useCallback(
    (page: number) => {
      setCurrentPage(page);
      if (!ready || bookId == null) return;
      const url = new URL(window.location.href);
      if (url.searchParams.get("page") === String(page) && !url.searchParams.has("planche")) return;
      url.searchParams.delete("planche");
      url.searchParams.set("page", String(page));
      window.history.replaceState(null, "", url.toString());
    },
    [bookId, ready],
  );

  const resolveAssetUrl = useCallback(
    (url: string) => readerAssetUrl(url, [CDN_ORIGIN, API_ORIGIN, SITE_URL]),
    [],
  );
  const loadTranscriptions = useCallback(
    async (numbers: number[], signal: AbortSignal): Promise<Record<string, string>> => {
      if (bookId == null || numbers.length === 0) return {};
      // Network errors propagate: the reader releases those pages and asks again later.
      const response = await fetch(`/api/databooks/${bookId}/texts?pages=${numbers.join(",")}`, {
        signal,
      });
      if (!response.ok) throw new Error(`Transcription request failed: ${response.status}`);
      // `texts`; the former `textes` is read from a server that predates the rename.
      const body: { texts?: Record<string, string>; textes?: Record<string, string> } =
        await response.json();
      return body.texts ?? body.textes ?? {};
    },
    [bookId],
  );
  const renderTranscription = useCallback(
    ({ text, page, verified }: { text: string; page: number; verified: boolean }) => (
      <TranscriptionTexte texte={text} bookId={bookId} page={page} verifiee={verified} />
    ),
    [bookId],
  );
  return (
    <div className="m3-reader--dragon-ball" data-koharu-canvas={canvasWarmup}>
      {bookId != null && <StudioSourceLink kind="databook" id={bookId} page={currentPage} />}
      <BaseDatabookReader
        key={`${bookId ?? title}-${ready ? "ready" : "init"}`}
        pages={pages}
        title={title}
        resolveAssetUrl={resolveAssetUrl}
        imageSrc={optimizedSrc}
        imageSrcSet={optimizedSrcSet}
        loadTranscriptions={bookId == null ? undefined : loadTranscriptions}
        renderTranscription={renderTranscription}
        preloadCount={prechargement}
        onPageChange={onPageChange}
      />
    </div>
  );
}
