// SPDX-License-Identifier: Apache-2.0
// Copied from @aphrody/m3-reader@3.3.4 (src/use-reader-core.ts); owned by @shenron/ui since the Shenron extraction
// (Tauri fullscreen, pinned fallback and media queries are Shenron additions).
"use client";

/**
 * Behaviour shared by `MangaReader` and `DatabookReader`: reading mode, fullscreen, the Swiper
 * handle and the scroll-position sync of the virtualized vertical mode.
 */

import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { SwiperClass } from "swiper/react";
import { isTauri } from "../studio/tauri-bridge";
import {
  isTauriWindowFullscreen,
  setTauriWindowFullscreen,
  useTauriFullscreen,
} from "./use-tauri-fullscreen";

export type ViewMode = "paged" | "vertical";

/**
 * Above this many pages the thumbnail strip (one DOM node per page, up to ~282 for a whole volume)
 * is too heavy: a compact "go to page" control replaces it.
 */
export const SHOW_STRIP_MAX = 40;

/** `matchMedia` suivi en direct ; `false` au rendu serveur et avant l'hydratation. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);
    sync();
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, [query]);
  return matches;
}

/** Tailwind `lg` : la double page n'a de sens qu'à partir de là. */
export const LARGE_SCREEN_QUERY = "(min-width: 1024px)";

/**
 * Fullscreen state of this container. The toggle resolves false on native failure;
 * `fullscreenError` exposes that failure without rejecting a button's event handler.
 *
 * Under Tauri the native window follows the DOM fullscreen (`useTauriFullscreen`). A WebView
 * without element fullscreen still gets a full window: the container is pinned over the page
 * (`pseudoFullscreen`, Escape leaves it) while the window goes fullscreen natively.
 */
export function useFullscreen(containerRef: RefObject<HTMLElement | null>) {
  const [domFullscreen, setDomFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<Error | null>(null);
  const mounted = useRef(false);
  const operation = useRef(0);
  const pseudo = useRef(false);
  /** Vrai quand le plein écran épinglé a lui-même agrandi la fenêtre (à rendre en sortant). */
  const ownsWindow = useRef(false);

  useTauriFullscreen(containerRef);

  const setPseudo = useCallback((value: boolean) => {
    pseudo.current = value;
    if (mounted.current) setPseudoFullscreen(value);
  }, []);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    const el = containerRef.current;
    if (!el) return false;
    const doc = el.ownerDocument;
    const current = ++operation.current;
    if (mounted.current) setFullscreenError(null);
    if (pseudo.current) {
      setPseudo(false);
      if (ownsWindow.current) await setTauriWindowFullscreen(false);
      ownsWindow.current = false;
      return true;
    }
    try {
      if (doc.fullscreenElement === el) {
        if (typeof doc.exitFullscreen !== "function")
          throw new Error("Fullscreen exit is unavailable");
        await doc.exitFullscreen();
      } else {
        // Request this container directly; never exit another component's fullscreen.
        if (typeof el.requestFullscreen !== "function")
          throw new Error("Fullscreen is unavailable");
        await el.requestFullscreen();
      }
      if (mounted.current && current === operation.current) {
        setDomFullscreen(
          Boolean(containerRef.current && doc.fullscreenElement === containerRef.current),
        );
      }
      return true;
    } catch (reason) {
      if (isTauri() && doc.fullscreenElement !== el) {
        const alreadyFull = await isTauriWindowFullscreen();
        if (alreadyFull || (await setTauriWindowFullscreen(true))) {
          ownsWindow.current = !alreadyFull;
          setPseudo(true);
          return true;
        }
      }
      if (mounted.current && current === operation.current) {
        setFullscreenError(reason instanceof Error ? reason : new Error(String(reason)));
      }
      return false;
    }
  }, [containerRef, setPseudo]);

  useEffect(() => {
    const doc = containerRef.current?.ownerDocument;
    if (!doc) return;
    mounted.current = true;
    const onChange = () =>
      setDomFullscreen(
        Boolean(containerRef.current && doc.fullscreenElement === containerRef.current),
      );
    onChange();
    doc.addEventListener("fullscreenchange", onChange);
    return () => {
      mounted.current = false;
      operation.current++;
      doc.removeEventListener("fullscreenchange", onChange);
      if (pseudo.current && ownsWindow.current) void setTauriWindowFullscreen(false);
      pseudo.current = false;
      ownsWindow.current = false;
    };
  }, [containerRef]);

  // Escape quitte le plein écran épinglé, sauf si une modale du lecteur le réclame d'abord.
  useEffect(() => {
    if (!pseudoFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (containerRef.current?.querySelector('[aria-modal="true"]')) return;
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pseudoFullscreen, containerRef, toggleFullscreen]);

  return {
    isFullscreen: domFullscreen || pseudoFullscreen,
    pseudoFullscreen,
    fullscreenError,
    toggleFullscreen,
  };
}

/** The Swiper instance and the two callbacks that keep `current` in step with it. */
export function useSwiperSync(setCurrent: (index: number) => void) {
  const swiperRef = useRef<SwiperClass | null>(null);

  const handleSwiper = useCallback(
    (sw: SwiperClass) => {
      swiperRef.current = sw;
      setCurrent(sw.realIndex ?? sw.activeIndex ?? 0);
    },
    [setCurrent],
  );

  const handleSlideChange = useCallback(
    (sw: SwiperClass) => setCurrent(sw.realIndex ?? sw.activeIndex ?? 0),
    [setCurrent],
  );

  return { swiperRef, handleSwiper, handleSlideChange };
}

/** In vertical mode, `current` follows the page at the middle of the scroll viewport. */
export function useVerticalScrollSync(
  mode: ViewMode,
  scrollParentRef: RefObject<HTMLElement | null>,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  setCurrent: (index: number) => void,
) {
  useEffect(() => {
    if (mode !== "vertical") return;
    const el = scrollParentRef.current;
    if (!el) return;
    const onScroll = () => {
      const mid = el.scrollTop + el.clientHeight / 2;
      const item = virtualizer.getVirtualItems().find((vi) => vi.start <= mid && vi.end >= mid);
      if (item) setCurrent(item.index);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [mode, scrollParentRef, virtualizer, setCurrent]);
}

/** Absolute placement of one virtual row. */
export const virtualRowStyle = (start: number): CSSProperties => ({
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  transform: `translateY(${start}px)`,
});
