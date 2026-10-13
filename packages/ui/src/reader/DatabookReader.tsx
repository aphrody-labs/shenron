"use client";
// SPDX-License-Identifier: Apache-2.0
// Copied from @aphrody/m3-reader@3.3.4 (src/DatabookReader.tsx); owned by @aphrody/shenron-ui since the Shenron extraction.
/**
 * Lecteur de databook / interview — format manga + légende.
 *
 * Deux modes :
 *  - Vertical (défaut) : défilement webtoon, image puis texte en dessous.
 *  - Paginé : une planche à la fois (Swiper). Sur grand écran, layout
 *    planche | texte côte à côte pour que les légendes longues ne mangent
 *    plus l'image, ou double page (touche D) pour feuilleter les scans.
 *    Clic sur la planche → lightbox plein écran : pincement, double tap,
 *    glisser une planche agrandie, balayage pour tourner la page.
 *
 * Plein écran (touche F) : sous Tauri, la fenêtre native suit ; une WebView sans
 * plein écran d'élément épingle le lecteur sur toute la fenêtre.
 *
 * Les pages sans image ni texte sont filtrées côté public (slots admin vides).
 * LTR par défaut. Affiche le `number` éditorial (pas seulement l'index).
 */

import type React from "react";
import type { ReactNode } from "react";
import { type ReactElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useFocusTrap } from "./use-focus-trap";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Maximize2,
  Minimize2,
  RotateCcw,
  ScrollText,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Mousewheel, Virtual, Zoom } from "swiper/modules";

// eslint-disable-next-line import/no-unassigned-import -- Swiper layout and interactions require this stylesheet.
import "swiper/css";
// eslint-disable-next-line import/no-unassigned-import -- Swiper layout and interactions require this stylesheet.
import "swiper/css/zoom";
// eslint-disable-next-line import/no-unassigned-import -- Swiper layout and interactions require this stylesheet.
import "swiper/css/virtual";

import {
  LARGE_SCREEN_QUERY,
  SHOW_STRIP_MAX,
  type ViewMode,
  useFullscreen,
  useMediaQuery,
  useSwiperSync,
  useVerticalScrollSync,
  virtualRowStyle,
} from "./use-reader-core";
import { ZOOM_MAX, usePinchZoom } from "./use-pinch-zoom";
import { isTauri } from "../studio/tauri-bridge";

export type DatabookReaderPage = {
  /** Numéro affiché (auto 1…N, modifiable côté admin). */
  number?: number | null;
  image?: string | null;
  /**
   * Transcription — présente pour les premières planches seulement.
   * Au-delà, la fiche envoie `text: null` et `aDuTexte: true`, et le lecteur
   * demande le texte au fournisseur de transcriptions au fil du défilement :
   * embarquer les 313 transcriptions d'un Daizenshuu pesait 412 Ko de charge
   * RSC pour une planche lue.
   */
  text?: string | null;
  /** La planche PORTE une transcription, même si elle n'est pas encore chargée. */
  aDuTexte?: boolean;
  /** Transcription relue à l'image : pas d'avertissement de lecture douteuse. */
  verifiee?: boolean;
};

export type ReaderTranscription = { text: string; page: number; verified: boolean };

export type DatabookReaderProps = {
  pages: DatabookReaderPage[];
  title: string;
  resolveAssetUrl?: (path: string) => string;
  imageSrc?: (url: string, width: number) => string;
  imageSrcSet?: (url: string, widths: number[]) => string | null;
  loadTranscriptions?: (pages: number[], signal: AbortSignal) => Promise<Record<string, string>>;
  renderTranscription?: (transcription: ReaderTranscription) => ReactNode;
  preloadCount?: number;
};

type ResolvedPage = {
  /** Numéro affiché (édition admin) — pas forcément = position dans le lecteur. */
  number: number;
  imageUrl: string | null;
  text: string | null;
  /** Une transcription existe côté serveur, chargée ou non. */
  aDuTexte: boolean;
  /** Transcription acquittée à la main (drapeau porté par la fiche). */
  verifiee: boolean;
};

function pageNumber(p: DatabookReaderPage, fallback: number): number {
  const raw = p.number as unknown;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === "string" && String(raw).trim() && Number.isFinite(Number(raw))) {
    return Math.trunc(Number(raw));
  }
  return fallback;
}

function resolvePages(
  pages: DatabookReaderPage[],
  resolveAssetUrl: (path: string) => string,
): ResolvedPage[] {
  const out: ResolvedPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const img = typeof p.image === "string" && p.image.trim() ? p.image.trim() : null;
    const text = typeof p.text === "string" && p.text.trim() ? p.text.trim() : null;
    const aDuTexte = p.aDuTexte === true || text !== null;
    // Une planche sans image ET sans transcription est un emplacement vide
    // réservé côté studio : elle ne se montre pas au public.
    if (!img && !aDuTexte) continue;
    out.push({
      number: pageNumber(p, i + 1),
      imageUrl: img ? resolveAssetUrl(img) : null,
      text,
      aDuTexte,
      verifiee: p.verifiee === true,
    });
  }
  return out;
}

/** Combien de planches autour de la courante on charge d'avance. */
const FENETRE_TEXTE = 6;

/**
 * Transcriptions chargées à la demande.
 *
 * La fiche n'embarque que les premières ; celles qu'on approche sont demandées
 * par fenêtres au fournisseur transmis par l'hôte. Une planche déjà connue n'est
 * jamais redemandée, et un échec réseau laisse simplement la planche sans
 * texte — jamais d'erreur jetée à la figure d'un lecteur qui feuillette.
 */
function useTextesPlanches(
  loadTranscriptions: DatabookReaderProps["loadTranscriptions"],
  items: ResolvedPage[],
  current: number,
): Map<number, string> {
  const [charges, setCharges] = useState<Map<number, string>>(() => new Map());
  // Les numéros déjà demandés (succès ou échec) : sans cette mémoire, une
  // planche sans transcription serait redemandée à chaque défilement.
  const demandes = useRef<Set<number>>(new Set());

  const manquants = useMemo(() => {
    if (!loadTranscriptions) return [];
    const de = Math.max(0, current - FENETRE_TEXTE);
    const a = Math.min(items.length, current + FENETRE_TEXTE + 1);
    const out: number[] = [];
    for (let i = de; i < a; i++) {
      const it = items[i];
      if (!it || !it.aDuTexte || it.text !== null) continue;
      if (charges.has(it.number)) continue;
      out.push(it.number);
    }
    return out;
  }, [loadTranscriptions, items, current, charges]);

  useEffect(() => {
    const aDemander = manquants.filter((n) => !demandes.current.has(n));
    if (aDemander.length === 0) return;
    for (const n of aDemander) demandes.current.add(n);
    const stop = new AbortController();
    let abouti = false;
    loadTranscriptions!(aDemander, stop.signal)
      .then((textes) => ({ textes }))
      .then((d: { textes?: Record<string, string> }) => {
        abouti = true;
        const recus = Object.entries(d.textes ?? {});
        if (recus.length === 0) return undefined;
        setCharges((prec) => {
          const suiv = new Map(prec);
          for (const [n, t] of recus) suiv.set(Number(n), t);
          return suiv;
        });
        return undefined;
      })
      .catch(() => {
        // Hors ligne : ces planches seront redemandées au prochain défilement
        // (une annulation est déjà traitée par le nettoyage de l'effet).
        if (!stop.signal.aborted) for (const n of aDemander) demandes.current.delete(n);
      });
    return () => {
      stop.abort();
      // Requête annulée avant sa réponse : libérer ses numéros avant le prochain passage de l'effet.
      if (!abouti) for (const n of aDemander) demandes.current.delete(n);
    };
  }, [manquants, loadTranscriptions]);

  return charges;
}

export function DatabookReader({
  pages,
  title,
  resolveAssetUrl = (path) => path,
  imageSrc = (url) => url,
  imageSrcSet = () => null,
  loadTranscriptions,
  renderTranscription,
  preloadCount = 4,
}: DatabookReaderProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const items = useMemo(() => resolvePages(pages, resolveAssetUrl), [pages, resolveAssetUrl]);
  const total = items.length;

  const [mode, setMode] = useState<ViewMode>("vertical");
  const [current, setCurrent] = useState(0);
  const { isFullscreen, pseudoFullscreen, toggleFullscreen } = useFullscreen(containerRef);
  /** Double page : seulement en paginé et à partir de `lg` (lisibilité mobile). */
  const isLarge = useMediaQuery(LARGE_SCREEN_QUERY);
  const [spread, setSpread] = useState(false);
  const useSpread = spread && isLarge && mode === "paged";
  const step = useSpread ? 2 : 1;
  const { swiperRef, handleSwiper, handleSlideChange } = useSwiperSync(setCurrent);
  /** Lightbox plein écran sur la planche courante (indépendant du mode). */
  const [lightbox, setLightbox] = useState(false);

  const textesCharges = useTextesPlanches(loadTranscriptions, items, current);
  /** Le texte d'une planche : celui de la fiche, sinon celui chargé après coup. */
  const texteDe = useCallback(
    (p: ResolvedPage | undefined): string | null =>
      p ? (p.text ?? textesCharges.get(p.number) ?? null) : null,
    [textesCharges],
  );
  useFocusTrap(lightboxRef, lightbox, () => setLightbox(false));

  // Clamp l'index si le nombre de pages change (édition live / revalidation).
  useEffect(() => {
    if (current >= total && total > 0) setCurrent(total - 1);
    if (total === 0) setCurrent(0);
  }, [total, current]);

  // Précharge planche courante ± voisines.
  useEffect(() => {
    if (total === 0) return;
    for (const idx of [current - 1, current, current + 1, current + 2]) {
      const url = items[idx]?.imageUrl;
      if (!url) continue;
      const img = new Image();
      img.src = url;
    }
  }, [current, items, total]);

  // Détection côté client uniquement (`document` absent au rendu serveur). Sous Tauri, le
  // plein écran est toujours offert : la fenêtre native prend le relais de la WebView.
  const [fullscreenDispo, setFullscreenDispo] = useState(false);
  useEffect(() => {
    setFullscreenDispo(
      isTauri() ||
        (typeof document !== "undefined" &&
          document.fullscreenEnabled &&
          typeof containerRef.current?.requestFullscreen === "function"),
    );
  }, []);

  /* ------------------------------ Vertical ------------------------------ */

  const scrollParentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () =>
      typeof window === "undefined" ? 1100 : Math.round(window.innerHeight * 0.95),
    // Marge de préchargement réglée sur les capacités : 4 planches rendent le
    // défilement continu sur un scan de 1 à 2 Mo, mais les précharger sur un
    // mobile en 2G dépense des données pour des pages qu'on ne verra
    // peut-être jamais. `prechargement` vaut 1 sur réseau lent, 6 sur une
    // machine confortable.
    overscan: Math.max(2, preloadCount),
  });

  const goTo = useCallback(
    (idx: number) => {
      const i = Math.min(Math.max(idx, 0), Math.max(0, total - 1));
      setCurrent(i);
      if (mode === "paged") swiperRef.current?.slideTo(i);
      else virtualizer.scrollToIndex(i, { align: "start" });
    },
    [mode, total, virtualizer, swiperRef],
  );

  useVerticalScrollSync(mode, scrollParentRef, virtualizer, setCurrent);

  // Navigation clavier des planches.
  //
  // Une SEULE source de vérité : ce handler, qui passe par `goTo` (donc
  // `slideTo` en mode paginé). Le module `Keyboard` de Swiper est
  // volontairement absent : il écoute lui aussi `keydown`, sur `document`,
  // et faisait AVANCER DEUX FOIS — Swiper glissait d'une planche et émettait
  // `slideChange` (`setCurrent(index)`), puis ce handler ajoutait +1 par-dessus.
  // `current` se décalait durablement de la planche affichée, si bien que la
  // transcription montrée à côté du scan était celle d'une AUTRE page (mesuré
  // sur /wiki/databooks/305 : compteur « n°3 · 3/20 » sur la planche 2).
  useEffect(() => {
    const actif = lightbox || mode === "paged";
    if (!actif) return;
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      const tag = cible?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || cible?.isContentEditable)
        return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const root = containerRef.current;
      if (!lightbox && !isFullscreen && !(root && cible && root.contains(cible))) return;
      switch (e.key) {
        case "Escape":
          if (lightbox) {
            e.preventDefault();
            setLightbox(false);
          }
          return;
        case "ArrowLeft":
          e.preventDefault();
          goTo(current - step);
          return;
        case "ArrowRight":
          e.preventDefault();
          goTo(current + step);
          return;
        case "Home":
          e.preventDefault();
          goTo(0);
          return;
        case "End":
          e.preventDefault();
          goTo(total - 1);
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, isFullscreen, mode, total, current, goTo, step]);

  // Raccourcis du lecteur (F : plein écran, D : double page), seulement quand le focus est
  // dans le lecteur ou qu'il occupe l'écran : la lettre ne doit pas fuir vers la page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const cible = e.target as HTMLElement | null;
      const tag = cible?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || cible?.isContentEditable)
        return;
      // La cible de l'événement, pas l'élément actif : une touche frappée ailleurs dans
      // la page ne bascule pas le lecteur, même s'il a gardé le focus auparavant.
      const root = containerRef.current;
      if (!isFullscreen && !(root && cible && root.contains(cible))) return;
      const key = e.key.toLowerCase();
      if (key === "f" && fullscreenDispo) {
        e.preventDefault();
        void toggleFullscreen();
      } else if (key === "d" && isLarge && mode === "paged") {
        e.preventDefault();
        setSpread((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenDispo, isFullscreen, isLarge, mode, toggleFullscreen]);

  const goPrevPage = useCallback(() => {
    goTo(current - step);
  }, [current, goTo, step]);

  const goNextPage = useCallback(() => {
    goTo(current + step);
  }, [current, goTo, step]);

  const openLightbox = useCallback(
    (idx?: number) => {
      if (typeof idx === "number") setCurrent(idx);
      const item = items[typeof idx === "number" ? idx : current];
      if (item?.imageUrl) setLightbox(true);
    },
    [items, current],
  );

  // Visionneuse : pincement, double tap, glisser une planche agrandie, et balayage horizontal
  // pour tourner la page (planche non agrandie). `goTo` et non `setCurrent` : il fait suivre
  // le Swiper sous-jacent, sans quoi refermer la visionneuse laisserait la planche paginée sur
  // l'ancienne page. Le zoom repart de 1× à chaque page.
  const visionneuse = usePinchZoom({
    onSwipe: (direction) => goTo(current + direction),
    resetKey: lightbox ? current : -1,
  });
  const { zoomIn, zoomOut, reset: resetZoom } = visionneuse;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-" || e.key === "_") zoomOut();
      else if (e.key === "0") resetZoom();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, zoomIn, zoomOut, resetZoom]);

  const currentItem = items[current];
  const currentNum = currentItem?.number ?? current + 1;
  /** Position dans le lecteur, distincte du numéro éditorial de la planche. */
  const position = total ? `${Math.min(current + 1, total)} / ${total}` : "0 / 0";
  const currentText = texteDe(currentItem);
  const currentImage = currentItem?.imageUrl ?? null;

  if (total === 0) {
    return (
      <div className="m3-reader-frame flex min-h-[200px] items-center justify-center rounded-xl p-8 text-[18px] text-[var(--reader-on-surface)]/50">
        Aucune page à afficher pour le moment.
      </div>
    );
  }

  const legendBlock = (
    <div className="flex h-full min-h-0 flex-col p-4 bg-[var(--reader-surface)] border-t lg:border-t-0 lg:border-l border-[var(--reader-outline)]">
      <div className="mb-2 shrink-0 flex items-center justify-between">
        <span className="m3-reader-badge bg-[var(--reader-accent)] text-[var(--reader-on-accent)] px-3 py-0.5 text-[18px] font-bold tabular-nums">
          <span>Planche {currentNum}</span>
        </span>
        <span className="text-[18px] font-bold tabular-nums text-[var(--reader-on-surface)]/60">
          {current + 1} / {total}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 m3-reader-scroll">
        {currentText ? (
          (renderTranscription?.({
            text: currentText,
            page: currentNum,
            verified: currentItem?.verifiee ?? false,
          }) ?? currentText)
        ) : currentItem?.aDuTexte ? (
          // La planche PORTE une transcription : dire « aucune description »
          // pendant qu'elle arrive ferait croire à une lacune du corpus.
          <p className="text-[18px] italic text-[var(--reader-on-surface)]/50">
            Chargement de la transcription…
          </p>
        ) : (
          <p className="text-[18px] italic text-[var(--reader-on-surface)]/50">
            Aucune description pour cette page.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="m3-reader m3-reader-container m3-reader-scroll flex h-[84svh] min-h-[460px] w-full min-w-0 flex-col overflow-hidden rounded-xl bg-[var(--reader-surface)] [contain:inline-size] [&:fullscreen]:h-screen [&:fullscreen]:min-h-screen [&:fullscreen]:rounded-none data-[pinned-fullscreen]:fixed data-[pinned-fullscreen]:inset-0 data-[pinned-fullscreen]:z-[90] data-[pinned-fullscreen]:h-dvh data-[pinned-fullscreen]:min-h-0 data-[pinned-fullscreen]:rounded-none"
      data-pinned-fullscreen={pseudoFullscreen ? "" : undefined}
      data-spread={useSpread ? "" : undefined}
      data-databook-reader
      data-m3-component="DatabookReader"
      data-testid="databook-reader"
      role="region"
      aria-label={title}
    >
      {/* Barre de contrôles Toriyama HUD */}
      <div className="m3-reader-hud z-10 flex flex-nowrap items-center gap-2 px-3 py-2.5 sm:flex-wrap">
        <span className="mr-1 hidden min-w-0 max-w-[40ch] truncate text-[18px] font-semibold text-[var(--reader-on-surface)] sm:block">
          {title}
        </span>
        <span className="m3-reader-badge bg-[var(--reader-accent)] text-[var(--reader-on-accent)] px-3 py-0.5 text-[18px] font-bold tabular-nums sm:ml-auto">
          <span>n° {currentNum}</span>
        </span>
        <span
          className="text-[18px] tabular-nums text-[var(--reader-on-surface)]/70"
          aria-label={`Planche ${Math.min(current + 1, total)} sur ${total}`}
        >
          {position}
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0 sm:gap-2">
          <button
            type="button"
            className={mode === "vertical" ? "m3-reader-btn-active" : "m3-reader-btn"}
            onClick={() => setMode("vertical")}
            aria-pressed={mode === "vertical"}
            aria-label="Mode vertical (planche + texte)"
            title="Mode vertical (planche + texte)"
          >
            <ScrollText size={14} aria-hidden />
            <span className="hidden sm:inline">Défilement</span>
          </button>
          <button
            type="button"
            className={mode === "paged" ? "m3-reader-btn-active" : "m3-reader-btn"}
            onClick={() => setMode("paged")}
            aria-pressed={mode === "paged"}
            aria-label="Mode paginé"
            title="Mode paginé"
          >
            <BookOpen size={14} aria-hidden />
            <span className="hidden sm:inline">Paginé</span>
          </button>
          <button
            type="button"
            className="m3-reader-btn"
            onClick={() => openLightbox()}
            disabled={!currentImage}
            aria-label="Agrandir la planche"
            title="Agrandir la planche"
          >
            <ZoomIn size={14} aria-hidden />
          </button>
          {isLarge && mode === "paged" && (
            <button
              type="button"
              className={useSpread ? "m3-reader-btn-active" : "m3-reader-btn"}
              onClick={() => setSpread((s) => !s)}
              aria-pressed={useSpread}
              aria-label="Double page"
              aria-keyshortcuts="D"
              title="Double page (D)"
            >
              <Columns2 size={14} aria-hidden />
              <span className="hidden xl:inline">Double</span>
            </button>
          )}
          {fullscreenDispo && (
            <button
              type="button"
              className="m3-reader-btn"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Quitter le plein écran" : "Activer le plein écran"}
              aria-keyshortcuts="F"
              title={isFullscreen ? "Quitter le plein écran (F)" : "Plein écran (F)"}
            >
              {isFullscreen ? (
                <Minimize2 size={14} aria-hidden />
              ) : (
                <Maximize2 size={14} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Zone de lecture */}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--reader-surface)]">
        {mode === "paged" ? (
          /* Layout côte à côte ≥ lg : planche fixe à gauche, texte scrollable
					   à droite — les légendes longues ne réduisent plus l'image. */
          <div className="flex h-full min-h-0 flex-col lg:flex-row">
            {/* Zone planche */}
            <div className="relative min-h-[52%] min-w-0 flex-[1.6] lg:h-full lg:min-h-0 lg:flex-[1.15]">
              <Swiper
                // Remonté au changement de double page : on repart de la planche courante.
                key={useSpread ? "databook-ltr-spread" : "databook-ltr"}
                initialSlide={current}
                dir="ltr"
                modules={[Zoom, Virtual, Mousewheel]}
                className="h-full w-full"
                slidesPerView={useSpread ? 2 : 1}
                slidesPerGroup={useSpread ? 2 : 1}
                spaceBetween={useSpread ? 8 : 0}
                mousewheel={{ forceToAxis: true }}
                zoom={{ maxRatio: 3, toggle: true }}
                virtual
                onSwiper={handleSwiper}
                onSlideChange={handleSlideChange}
              >
                {items.map((item, i) => (
                  <SwiperSlide
                    key={`db-page-${item.number}-${i}`}
                    virtualIndex={i}
                    zoom={Boolean(item.imageUrl)}
                    className="flex items-center justify-center"
                  >
                    <div className="swiper-zoom-container flex h-full w-full items-center justify-center bg-[var(--reader-surface)]">
                      {item.imageUrl ? (
                        <button
                          type="button"
                          className="group relative flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0"
                          onClick={() => openLightbox(i)}
                          aria-label={`Agrandir la page ${item.number}`}
                        >
                          <img
                            src={imageSrc(item.imageUrl, 1080)}
                            srcSet={imageSrcSet(item.imageUrl, [828, 1080, 1920]) || undefined}
                            sizes="(min-width: 1024px) 900px, 100vw"
                            alt={`${title} — page ${item.number}`}
                            loading={Math.abs(i - current) <= 1 ? "eager" : "lazy"}
                            draggable={false}
                            className="max-h-full max-w-full object-contain transition-opacity group-hover:opacity-95"
                          />
                          <span className="pointer-events-none absolute right-3 bottom-3 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] px-3 py-1 text-[18px] font-semibold text-[var(--reader-on-surface)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none">
                            Agrandir
                          </span>
                        </button>
                      ) : (
                        <div className="px-6 text-center text-[18px] text-[var(--reader-on-surface)]/50">
                          Page {item.number} — pas d&apos;image
                        </div>
                      )}
                    </div>
                  </SwiperSlide>
                ))}
              </Swiper>

              <button
                type="button"
                aria-label="Page précédente"
                onClick={goPrevPage}
                disabled={current <= 0}
                className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] p-3 text-[var(--reader-on-surface)] transition-colors hover:border-[var(--reader-accent)] hover:text-[var(--reader-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)] disabled:opacity-30"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Page suivante"
                onClick={goNextPage}
                disabled={current >= total - 1}
                className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] p-3 text-[var(--reader-on-surface)] transition-colors hover:border-[var(--reader-accent)] hover:text-[var(--reader-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)] disabled:opacity-30"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>

            {/* Légende — panneau scrollable indépendant (ne compresse plus l'image). La double
						    page la replie : on feuillette les scans, le texte revient en simple page. */}
            <div
              hidden={useSpread}
              className="min-h-0 max-h-[38%] shrink-0 border-t border-[var(--reader-outline)] bg-[var(--reader-surface)]/90 px-3 py-2.5 sm:max-h-[48%] sm:px-5 sm:py-4 lg:max-h-none lg:w-[min(420px,38%)] lg:overflow-hidden lg:border-l lg:border-t-0"
            >
              {legendBlock}
            </div>
          </div>
        ) : (
          <div
            ref={scrollParentRef}
            tabIndex={0}
            // `overscroll-y-auto` et non `contain` : arrivé en bout de lecteur,
            // la molette doit rendre la main au document. Avec `contain`, le
            // lecteur avalait le geste et la page restait bloquée — on ne
            // pouvait plus descendre vers la suite de la fiche sans sortir la
            // souris de la zone. Le risque d'origine (l'inertie mobile qui
            // éjectait le lecteur en pleine lecture) est traité autrement : les
            // planches s'accrochent au défilement, donc le mouvement s'arrête
            // franchement sur une page au lieu de filer.
            //
            // `snap-y snap-proximity` : le « vrai effet de page » — le
            // défilement s'arrête franchement sur une planche au lieu de
            // s'immobiliser entre deux images. `proximity` et non `mandatory` :
            // la liste est virtualisée (éléments montés/démontés en cours de
            // route, hauteurs mesurées après coup), et une accroche
            // obligatoire se bat avec ces remesures — elle produit des sauts au
            // moment où une planche entre dans la fenêtre.
            className="h-full w-full snap-y snap-proximity overflow-y-auto overflow-x-hidden overscroll-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--reader-focus,#fcf03a)]"
            aria-label={`${title} — lecture verticale`}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((vi) => {
                const item = items[vi.index];
                if (!item) return null;
                return (
                  <div
                    key={`${baseId}-${vi.key}`}
                    data-index={vi.index}
                    ref={virtualizer.measureElement}
                    style={virtualRowStyle(vi.start)}
                    className="snap-start snap-always border-b border-white/5 px-2 py-4 sm:px-4 sm:py-6"
                  >
                    <div className="group/planche mx-auto flex w-full max-w-3xl flex-col gap-3">
                      <span className="text-[18px] font-semibold tabular-nums text-[var(--reader-on-surface)]/70">
                        Page {item.number}
                      </span>
                      {item.imageUrl ? (
                        <button
                          type="button"
                          className="group relative w-full min-w-0 cursor-zoom-in rounded-sm border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)]"
                          onClick={() => openLightbox(vi.index)}
                          aria-label={`Ouvrir la page ${item.number} en plein écran`}
                        >
                          <img
                            src={imageSrc(item.imageUrl, 1080)}
                            srcSet={imageSrcSet(item.imageUrl, [828, 1080, 1920]) || undefined}
                            sizes="(min-width: 768px) 768px, 100vw"
                            alt={`${title} — page ${item.number}`}
                            // Trois planches de part et d'autre chargées d'avance :
                            // avec une seule, tourner la page laissait un rectangle
                            // vide le temps du téléchargement d'un scan de 1 à 2 Mo.
                            loading={Math.abs(vi.index - current) <= 3 ? "eager" : "lazy"}
                            // `high` sur la planche courante : le navigateur la sert
                            // avant les voisines préchargées.
                            fetchPriority={vi.index === current ? "high" : "auto"}
                            decoding="async"
                            draggable={false}
                            className="h-auto w-full rounded-sm border border-[var(--reader-outline)] bg-[var(--reader-surface)] object-contain"
                          />
                          {/* Appel au plein écran : au survol, au focus, et toujours au doigt. */}
                          <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] px-3 py-1.5 text-[18px] font-semibold text-[var(--reader-on-surface)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none">
                            <ZoomIn size={12} aria-hidden />
                            Plein écran
                          </span>
                        </button>
                      ) : (
                        <div className="flex min-h-[120px] items-center justify-center rounded border border-dashed border-white/10 bg-[var(--reader-surface)]/40 text-[18px] text-[var(--reader-on-surface)]/50">
                          Pas d&apos;image pour cette page
                        </div>
                      )}
                      {texteDe(item) ? (
                        <div className="rounded-md border border-[var(--reader-outline)]/40 bg-[var(--reader-surface)]/50 px-4 py-3">
                          {renderTranscription?.({
                            text: texteDe(item) as string,
                            page: item.number,
                            verified: item.verifiee,
                          }) ?? texteDe(item)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bande de vignettes (databooks courts). */}
      {mode === "paged" && total > 0 && total <= SHOW_STRIP_MAX && (
        <div className="z-10 flex items-center gap-4 overflow-x-auto border-t border-[var(--reader-outline)] bg-[var(--reader-surface)]/90 px-4 py-3 scrollbar-thin">
          <div className="mx-auto flex gap-2">
            {items.map((item, idx) => (
              <button
                key={`thumb-${item.number}-${idx}`}
                type="button"
                onClick={() => goTo(idx)}
                className={`relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)] ${
                  current === idx
                    ? "border-[var(--reader-focus,#fcf03a)]"
                    : "border-[var(--reader-outline)] hover:border-[var(--reader-on-surface)]/40"
                }`}
                title={`Page ${item.number}`}
                aria-label={`Aller à la page ${item.number}`}
                aria-current={current === idx ? "true" : undefined}
              >
                {item.imageUrl ? (
                  <img
                    // Vignette de 48×64 px : elle chargeait le scan source (jusqu'à
                    // 5 Mio) pour un timbre-poste, jusqu'à 40 fois par fiche.
                    src={imageSrc(item.imageUrl, 96)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center bg-[var(--reader-surface)] text-[18px] text-[var(--reader-on-surface)]/50">
                    Texte
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-[var(--reader-surface)] text-center text-[18px] font-semibold tabular-nums text-[var(--reader-on-surface)]">
                  {item.number}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saut direct pour les longs databooks. */}
      {mode === "paged" && total > SHOW_STRIP_MAX && (
        <form
          className="z-10 flex items-center justify-center gap-3 border-t border-[var(--reader-outline)] bg-[var(--reader-surface)] px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            const field = e.currentTarget.elements.namedItem("goto") as HTMLInputElement | null;
            const wanted = Number(field?.value);
            if (!Number.isFinite(wanted)) return;
            // Cherche d'abord par numéro éditorial, sinon par position 1-based.
            const byNumber = items.findIndex((it) => it.number === Math.trunc(wanted));
            if (byNumber >= 0) goTo(byNumber);
            else goTo(Math.trunc(wanted) - 1);
          }}
        >
          <label
            htmlFor={`${baseId}-goto`}
            className="text-[18px] font-semibold text-[var(--reader-on-surface)]"
          >
            Aller à la planche n°
          </label>
          <input
            id={`${baseId}-goto`}
            name="goto"
            type="number"
            key={currentNum}
            defaultValue={currentNum}
            className="min-h-11 w-20 rounded-lg border border-[var(--reader-outline)] bg-[var(--reader-surface)] px-2.5 py-1 text-center text-[18px] font-semibold tabular-nums text-[var(--reader-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)]"
          />
          <button type="submit" className="m3-reader-btn-active">
            Aller
          </button>
        </form>
      )}

      {/* Lightbox agrandissement planche */}
      {lightbox && currentImage && (
        <div
          ref={lightboxRef}
          // `tabIndex={-1}` : requis par `useFocusTrap`, qui donne le focus au
          // panneau à l'ouverture. Sans piège, la tabulation continuait DERRIÈRE
          // la visionneuse plein écran — le focus disparaissait pour l'utilisateur
          // clavier et pour le lecteur d'écran.
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — page ${currentNum} agrandie`}
          className="fixed inset-0 z-[100] flex flex-col bg-[var(--reader-surface)]/95"
          onClick={() => setLightbox(false)}
        >
          <div className="flex items-center gap-3 border-b border-[var(--reader-outline)] bg-[var(--reader-surface)] px-4 py-3">
            <span className="hidden min-w-0 flex-1 truncate text-[18px] font-semibold text-[var(--reader-on-surface)] sm:block">
              {title}
            </span>
            <span className="m3-reader-badge bg-[var(--reader-accent)] text-[var(--reader-on-accent)] px-3 py-0.5 text-[18px] font-bold tabular-nums">
              <span>n° {currentNum}</span>
            </span>
            <div
              className="ml-auto flex items-center gap-1.5"
              role="group"
              aria-label="Zoom"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="m3-reader-btn"
                onClick={zoomOut}
                disabled={!visionneuse.zoomed}
                aria-label="Dézoomer"
                aria-keyshortcuts="-"
                title="Dézoomer (−)"
              >
                <ZoomOut size={16} aria-hidden />
              </button>
              <output
                className="hidden min-w-[4ch] text-center text-[18px] font-bold tabular-nums text-[var(--reader-on-surface)] sm:inline"
                aria-live="polite"
              >
                {Math.round(visionneuse.zoom.scale * 100)} %
              </output>
              <button
                type="button"
                className="m3-reader-btn"
                onClick={zoomIn}
                disabled={visionneuse.zoom.scale >= ZOOM_MAX}
                aria-label="Zoomer"
                aria-keyshortcuts="+"
                title="Zoomer (+)"
              >
                <ZoomIn size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="m3-reader-btn"
                onClick={resetZoom}
                disabled={!visionneuse.zoomed}
                aria-label="Taille réelle de l'écran"
                aria-keyshortcuts="0"
                title="Ajuster à l'écran (0)"
              >
                <RotateCcw size={16} aria-hidden />
              </button>
              <button
                type="button"
                className="m3-reader-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox(false);
                }}
                aria-label="Fermer"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
          </div>
          <div
            ref={visionneuse.surfaceRef}
            className={`relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-2 select-none sm:p-4 ${visionneuse.zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
            data-zoomed={visionneuse.zoomed ? "" : undefined}
            data-testid="databook-lightbox-surface"
            onClick={(e) => e.stopPropagation()}
            {...visionneuse.handlers}
          >
            <img
              src={currentImage}
              alt={`${title} — page ${currentNum}`}
              className="max-h-full max-w-full object-contain will-change-transform motion-safe:transition-transform motion-safe:duration-75"
              style={visionneuse.style}
              draggable={false}
            />
            <button
              type="button"
              aria-label="Page précédente"
              onClick={() => goTo(current - 1)}
              disabled={current <= 0}
              className="absolute top-1/2 left-2 sm:left-4 -translate-y-1/2 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] p-3 text-[var(--reader-on-surface)] transition-colors hover:bg-[var(--reader-accent)] hover:text-[var(--reader-on-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)] disabled:opacity-30"
            >
              <ChevronLeft size={22} aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Page suivante"
              onClick={() => goTo(current + 1)}
              disabled={current >= total - 1}
              className="absolute top-1/2 right-2 sm:right-4 -translate-y-1/2 rounded-full border border-[var(--reader-outline)] bg-[var(--reader-surface)] p-3 text-[var(--reader-on-surface)] transition-colors hover:bg-[var(--reader-accent)] hover:text-[var(--reader-on-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--reader-focus,#fcf03a)] disabled:opacity-30"
            >
              <ChevronRight size={22} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
