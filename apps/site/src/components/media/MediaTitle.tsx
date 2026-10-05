import type { ReactNode } from "react";

/**
 * Titre d'une œuvre et son titre japonais, rendus ensemble dans le `<h1>` de `PageHeader`.
 *
 * Le titre japonais est un vrai second titre (ドラゴンボール超 1), pas une légende grise posée
 * plus bas : il garde la graisse du titre, une taille en dessous, en Noto Sans JP — la seule
 * famille chargée qui en possède les glyphes.
 */
export function MediaTitle({ title, titleJa }: { title: ReactNode; titleJa?: string | null }) {
  return (
    <>
      {title}
      {titleJa ? (
        <span lang="ja" className="mt-2 block font-jp text-[0.55em] leading-tight text-white/90">
          {titleJa}
        </span>
      ) : null}
    </>
  );
}
