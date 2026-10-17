"use client";

/**
 * Dbxv2Image — a raster shown pixel perfect: integer scale in device pixels, nearest-neighbour
 * sampling, origin snapped to the physical pixel grid, `devicePixelRatio` respected. `src` is a
 * short-lived signed URL given by the host; the component never builds or sees a token.
 * Loading and error states are announced (`role="status"` / `role="alert"`); forced-colors and
 * reduced-motion are handled by `dbxv2.css`.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDbxv2Labels } from "./context";
import { placePixels, type PixelPlacement } from "./pixel";

export interface Dbxv2ImageProps {
  src: string;
  /** Accessible description; ignored when `decorative`. */
  alt: string;
  decorative?: boolean;
  /** Native size when known; otherwise read from the loaded image. */
  width?: number;
  height?: number;
  /** CSS height of the viewing box (default 256). */
  boxHeight?: number;
  maxScale?: number;
  className?: string;
}

type Phase = "loading" | "ready" | "error";

export function Dbxv2Image({
  src,
  alt,
  decorative = false,
  width,
  height,
  boxHeight = 256,
  maxScale,
  className = "",
}: Dbxv2ImageProps) {
  const labels = useDbxv2Labels();
  const box = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    width && height ? { w: width, h: height } : null,
  );
  const [size, setSize] = useState({ w: 0, dpr: 1 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, dpr: globalThis.devicePixelRatio || 1 });
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    globalThis.addEventListener?.("resize", measure);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.("resize", measure);
    };
  }, []);

  useEffect(() => {
    // A new source or a retry restarts the loading state.
    // oxlint-disable-next-line react/set-state-in-effect -- reset on external input change
    setPhase("loading");
  }, [src, attempt]);

  let placement: PixelPlacement | null = null;
  if (natural && size.w > 0) {
    placement = placePixels(
      natural.w,
      natural.h,
      { width: size.w, height: boxHeight },
      { dpr: size.dpr, maxScale },
    );
  }

  const imgStyle: CSSProperties = placement
    ? {
        position: "absolute",
        left: placement.cssX,
        top: placement.cssY,
        width: placement.cssWidth,
        height: placement.cssHeight,
        imageRendering: "pixelated",
      }
    : { position: "absolute", visibility: "hidden", imageRendering: "pixelated" };

  return (
    <figure className={`dbxv2-image ${className}`} data-phase={phase}>
      <div ref={box} className="dbxv2-image__box" style={{ height: boxHeight }}>
        {phase !== "error" && (
          // oxlint-disable-next-line next/no-img-element -- exact device pixels, no resampling
          <img
            key={attempt}
            src={src}
            alt={decorative ? "" : alt}
            aria-hidden={decorative || undefined}
            decoding="async"
            draggable={false}
            style={imgStyle}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0)
                setNatural((prev) => prev ?? { w: img.naturalWidth, h: img.naturalHeight });
              setPhase("ready");
            }}
            onError={() => setPhase("error")}
          />
        )}
        {phase === "loading" && (
          <p role="status" className="dbxv2-image__state">
            {labels.loading}
          </p>
        )}
        {phase === "error" && (
          <div role="alert" className="dbxv2-image__state">
            <span>{labels.error}</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              {labels.retry}
            </button>
          </div>
        )}
      </div>
      {placement && phase === "ready" && (
        <figcaption className="dbxv2-image__caption">
          {labels.scale.replace("{scale}", String(placement.scale))}
        </figcaption>
      )}
    </figure>
  );
}
