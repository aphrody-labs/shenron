/* oxlint-disable react/exhaustive-effect-dependencies, react/set-state-in-effect -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Zoom d'une planche au doigt, à la souris et au clavier (visionneuse plein écran).
 *
 * Pointer Events seulement (une seule pile pour le tactile, le stylet et la souris) :
 *  - pincement à deux doigts, centré entre les doigts ;
 *  - double tap (double clic à la souris) : bascule 1× ↔ 2,5× au point touché ;
 *  - glisser pour déplacer une planche agrandie ;
 *  - balayage horizontal au doigt, planche non agrandie : page suivante ou précédente ;
 *  - molette ou pincement du pavé tactile (`ctrl` + molette) ;
 *  - `zoomIn`/`zoomOut`/`reset` pour les boutons et les touches `+`, `-`, `0`.
 *
 * La géométrie est pure (`zoomAround`, `clampZoom`) : testée sans DOM.
 */
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
} from "react";

export type ZoomState = { scale: number; x: number; y: number };
export type ZoomBounds = { width: number; height: number };
export type Point = { x: number; y: number };

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_DOUBLE_TAP = 2.5;
export const ZOOM_STEP = 1.25;
/** Déplacement minimal (px) d'un balayage, et au-delà duquel un tap n'en est plus un. */
export const SWIPE_MIN = 48;
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;

export const IDENTITY: ZoomState = { scale: 1, x: 0, y: 0 };

/** Garde l'échelle dans [1, 4] et la planche agrandie au contact des bords de la surface. */
export function clampZoom(state: ZoomState, bounds: ZoomBounds): ZoomState {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, state.scale));
  if (scale === 1) return IDENTITY;
  const maxX = ((scale - 1) * bounds.width) / 2;
  const maxY = ((scale - 1) * bounds.height) / 2;
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y)),
  };
}

/**
 * Nouvelle échelle en gardant fixe le point `focus` (coordonnées relatives au centre de la
 * surface) : ce qui est sous le doigt reste sous le doigt.
 */
export function zoomAround(
  state: ZoomState,
  nextScale: number,
  focus: Point,
  bounds: ZoomBounds,
): ZoomState {
  const scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextScale));
  const ratio = scale / state.scale;
  return clampZoom(
    {
      scale,
      x: focus.x - (focus.x - state.x) * ratio,
      y: focus.y - (focus.y - state.y) * ratio,
    },
    bounds,
  );
}

type Gesture =
  | { kind: "idle" }
  | {
      kind: "pan";
      id: number;
      start: Point;
      origin: ZoomState;
      type: string;
      at: number;
      fromPinch: boolean;
    }
  | { kind: "pinch"; distance: number; mid: Point; origin: ZoomState };

export type PinchZoomOptions = {
  /** Balayage horizontal sur planche non agrandie : `1` = suivante, `-1` = précédente. */
  onSwipe?: (direction: 1 | -1) => void;
  /** Toute nouvelle valeur (la page affichée) ramène le zoom à 1×. */
  resetKey?: unknown;
};

export function usePinchZoom({ onSwipe, resetKey }: PinchZoomOptions = {}) {
  // Ref de rappel : la surface (la visionneuse) se monte après le hook, la molette suit.
  const elementRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture>({ kind: "idle" });
  const lastTap = useRef<{ at: number; point: Point } | null>(null);
  const clearGestures = useCallback(() => {
    const ids = [...pointers.current.keys()];
    pointers.current.clear();
    gesture.current = { kind: "idle" };
    lastTap.current = null;
    const element = elementRef.current;
    for (const id of ids) {
      if (element?.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    }
  }, []);
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const surfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (elementRef.current !== node) clearGestures();
      elementRef.current = node;
      setSurface(node);
    },
    [clearGestures],
  );
  const [zoom, setZoom] = useState<ZoomState>(IDENTITY);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    zoomRef.current = zoom;
  });
  const onSwipeRef = useRef(onSwipe);
  useLayoutEffect(() => {
    onSwipeRef.current = onSwipe;
  });

  useEffect(() => {
    clearGestures();
    setZoom(IDENTITY);
  }, [resetKey, clearGestures]);

  const bounds = useCallback((): ZoomBounds => {
    const rect = elementRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  }, []);

  /** Coordonnées client → relatives au centre de la surface. */
  const local = useCallback((clientX: number, clientY: number): Point => {
    const rect = elementRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  const toggleAt = useCallback(
    (focus: Point) => {
      const current = zoomRef.current;
      setZoom(current.scale > 1 ? IDENTITY : zoomAround(current, ZOOM_DOUBLE_TAP, focus, bounds()));
    },
    [bounds],
  );

  const zoomBy = useCallback(
    (factor: number, focus: Point = { x: 0, y: 0 }) =>
      setZoom((current) => zoomAround(current, current.scale * factor, focus, bounds())),
    [bounds],
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const reset = useCallback(() => {
    clearGestures();
    setZoom(IDENTITY);
  }, [clearGestures]);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      origin: zoomRef.current,
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Un bouton posé sur la surface (page suivante, zoom) n'est pas un geste : deux
    // appuis rapides sur « Page suivante » ne doivent pas agrandir la planche.
    const target = event.target as Element | null;
    if (target !== event.currentTarget && target?.closest?.("button, a, input, select, textarea"))
      return;
    const point = local(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (pointers.current.size === 2) startPinch();
    else if (pointers.current.size === 1)
      gesture.current = {
        kind: "pan",
        id: event.pointerId,
        start: point,
        origin: zoomRef.current,
        type: event.pointerType,
        at: event.timeStamp,
        fromPinch: false,
      };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = local(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;
    if (current.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = current.origin.scale * (Math.hypot(b.x - a.x, b.y - a.y) / current.distance);
      const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
      const ratio = clamped / current.origin.scale;
      setZoom(
        clampZoom(
          {
            scale: clamped,
            x: mid.x - (current.mid.x - current.origin.x) * ratio,
            y: mid.y - (current.mid.y - current.origin.y) * ratio,
          },
          bounds(),
        ),
      );
    } else if (current.kind === "pan" && current.id === event.pointerId) {
      if (current.origin.scale <= 1) return;
      setZoom(
        clampZoom(
          {
            scale: current.origin.scale,
            x: current.origin.x + point.x - current.start.x,
            y: current.origin.y + point.y - current.start.y,
          },
          bounds(),
        ),
      );
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const point = local(event.clientX, event.clientY);
    pointers.current.delete(event.pointerId);
    const current = gesture.current;
    if (current.kind === "pinch") {
      // Un doigt reste posé : il reprend un déplacement depuis l'état atteint.
      const [rest] = [...pointers.current.entries()];
      gesture.current = rest
        ? {
            kind: "pan",
            id: rest[0],
            start: rest[1],
            origin: zoomRef.current,
            type: "touch",
            at: event.timeStamp,
            fromPinch: true,
          }
        : { kind: "idle" };
      lastTap.current = null;
      return;
    }
    gesture.current = { kind: "idle" };
    if (current.kind !== "pan" || current.id !== event.pointerId || current.fromPinch) return;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    const touchLike = current.type !== "mouse";
    if (
      touchLike &&
      current.origin.scale <= 1 &&
      Math.abs(dx) >= SWIPE_MIN &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      lastTap.current = null;
      onSwipeRef.current?.(dx < 0 ? 1 : -1);
      return;
    }
    // Double tap au doigt ; la souris passe par `onDoubleClick`.
    if (!touchLike || Math.hypot(dx, dy) > TAP_SLOP) return;
    const previous = lastTap.current;
    if (
      previous &&
      event.timeStamp - previous.at >= 0 &&
      event.timeStamp - previous.at <= DOUBLE_TAP_MS &&
      Math.hypot(point.x - previous.point.x, point.y - previous.point.y) <= DOUBLE_TAP_SLOP
    ) {
      lastTap.current = null;
      toggleAt(point);
    } else {
      lastTap.current = { at: event.timeStamp, point };
    }
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    if (pointers.current.has(event.pointerId)) clearGestures();
  };

  const onDoubleClick = (event: { clientX: number; clientY: number }) =>
    toggleAt(local(event.clientX, event.clientY));

  // Molette non passive : React enregistre `wheel` en passif, sans `preventDefault` possible.
  useEffect(() => {
    if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      const rect = surface.getBoundingClientRect();
      zoomBy(factor, {
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2),
      });
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, [surface, zoomBy]);

  const style: CSSProperties = {
    transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
    transformOrigin: "center center",
  };

  return {
    surfaceRef,
    zoom,
    zoomed: zoom.scale > 1,
    style,
    zoomIn,
    zoomOut,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onDoubleClick,
    },
  };
}
