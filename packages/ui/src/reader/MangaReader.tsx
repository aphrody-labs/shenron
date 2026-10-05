// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Lecteur manga de Shenron : le lecteur canonique de `@aphrody/m3-reader` (Swiper : balayage,
 * pincement, double tap, clavier, double page `lg`), enveloppé pour la fenêtre de bureau.
 *
 * L'enveloppe ne recopie rien du lecteur M3 : elle ne fait que suivre son plein écran DOM avec la
 * fenêtre Tauri (`useTauriFullscreen`), pour que « Plein écran » couvre tout l'écran et non la
 * seule WebView. `display: contents` : aucune boîte en plus dans la mise en page de l'hôte.
 */
import { type ReactElement, useRef } from "react";
import {
  MangaReader as CanonicalMangaReader,
  type MangaReaderProps,
} from "@aphrody/m3-reader/source";
import { useTauriFullscreen } from "./use-tauri-fullscreen";

export type { MangaReaderProps };

export function MangaReader(props: MangaReaderProps): ReactElement {
  const scope = useRef<HTMLDivElement>(null);
  useTauriFullscreen(scope);
  return (
    <div ref={scope} className="contents" data-shenron-reader="manga">
      <CanonicalMangaReader {...props} />
    </div>
  );
}

/** Le lecteur M3 d'origine, pour les hôtes qui gèrent eux-mêmes la fenêtre. */
export { CanonicalMangaReader };
