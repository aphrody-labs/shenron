"use client";
import { useCallback } from "react";
import { DatabookReader as BaseDatabookReader, type DatabookReaderPage } from "@shenron/ui/reader";
import { TranscriptionTexte } from "./TranscriptionTexte";
import { assetUrl } from "@/lib/assets";
import { useReglages } from "@/lib/use-capacites";
import { optimizedSrc, optimizedSrcSet } from "@/lib/images";

export type { DatabookReaderPage };
export type DatabookReaderProps = {
  pages: DatabookReaderPage[];
  title: string;
  bookId?: number | string | null;
};

export function DatabookReader({ pages, title, bookId }: DatabookReaderProps) {
  const { prechargement } = useReglages();
  const loadTranscriptions = useCallback(
    async (numbers: number[], signal: AbortSignal): Promise<Record<string, string>> => {
      if (bookId == null || numbers.length === 0) return {};
      try {
        const response = await fetch(`/api/databooks/${bookId}/texts?pages=${numbers.join(",")}`, {
          signal,
        });
        if (!response.ok) return {};
        // `texts`; the former `textes` is read from a server that predates the rename.
        const body: { texts?: Record<string, string>; textes?: Record<string, string> } =
          await response.json();
        return body.texts ?? body.textes ?? {};
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") throw err;
        return {};
      }
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
    <div className="m3-reader--dragon-ball">
      <BaseDatabookReader
        pages={pages}
        title={title}
        resolveAssetUrl={assetUrl}
        imageSrc={optimizedSrc}
        imageSrcSet={optimizedSrcSet}
        loadTranscriptions={bookId == null ? undefined : loadTranscriptions}
        renderTranscription={renderTranscription}
        preloadCount={prechargement}
      />
    </div>
  );
}
