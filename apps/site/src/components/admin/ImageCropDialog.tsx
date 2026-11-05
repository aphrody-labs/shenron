"use client";

import { Check, Move, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminImageText } from "@/lib/admin-image-text";

const PRESETS = [
  { key: "square", ratio: 1 },
  { key: "portrait", ratio: 3 / 4 },
  { key: "landscape", ratio: 4 / 3 },
  { key: "wide", ratio: 16 / 9 },
  { key: "original", ratio: 0 },
] as const;

type Preset = (typeof PRESETS)[number]["key"];

export function ImageCropDialog({
  file,
  defaultAspect,
  onCancel,
  onConfirm,
}: {
  file: File;
  defaultAspect: "square" | "portrait" | "landscape" | "wide";
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const t = useAdminImageText();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [aspectKey, setAspectKey] = useState<Preset>(defaultAspect);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");

  const measureViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return { width: 0, height: 0 };
    const { width, height } = element.getBoundingClientRect();
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      setSize({ width, height });
      return { width, height };
    }
    return { width: 0, height: 0 };
  }, []);

  const aspect = useMemo(() => {
    const preset = PRESETS.find(({ key }) => key === aspectKey);
    if (!preset || preset.ratio)
      return preset?.ratio || natural.width / Math.max(1, natural.height);
    return natural.width / Math.max(1, natural.height);
  }, [aspectKey, natural.height, natural.width]);

  // The object URL is an external resource: attach it to the preview and revoke it on change.
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const objectUrl = URL.createObjectURL(file);
    image.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    // Seed the crop dimensions immediately. ResizeObserver's first callback can
    // be deferred while a native dialog enters the top layer, leaving finish()
    // with a zero-sized viewport even though the preview is visible.
    measureViewport();
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        setSize({ width, height });
      }
    });
    observer.observe(element);

    const frame = requestAnimationFrame(measureViewport);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measureViewport]);

  const baseScale = Math.max(
    size.width / Math.max(natural.width, 1),
    size.height / Math.max(natural.height, 1),
  );
  const imageWidth = natural.width * baseScale * zoom;
  const imageHeight = natural.height * baseScale * zoom;

  // Keep the pan inside the image bounds when they shrink (state adjusted during render).
  const boundedPan = {
    x: Math.max(-(imageWidth - size.width) / 2, Math.min((imageWidth - size.width) / 2, pan.x)),
    y: Math.max(-(imageHeight - size.height) / 2, Math.min((imageHeight - size.height) / 2, pan.y)),
  };
  if (!Object.is(boundedPan.x, pan.x) || !Object.is(boundedPan.y, pan.y)) setPan(boundedPan);

  const finish = useCallback(() => {
    const image = imageRef.current;
    const canvas = document.createElement("canvas");
    const measuredSize = size.width > 0 && size.height > 0 ? size : measureViewport();
    if (
      !image ||
      !natural.width ||
      !natural.height ||
      !Number.isFinite(measuredSize.width) ||
      !Number.isFinite(measuredSize.height) ||
      measuredSize.width <= 0 ||
      measuredSize.height <= 0
    ) {
      setError(t("cropFailed"));
      return;
    }
    const scale =
      Math.max(measuredSize.width / natural.width, measuredSize.height / natural.height) * zoom;
    const left = (measuredSize.width - natural.width * scale) / 2 + pan.x;
    const top = (measuredSize.height - natural.height * scale) / 2 + pan.y;
    const sx = Math.max(0, Math.min(natural.width, -left / scale));
    const sy = Math.max(0, Math.min(natural.height, -top / scale));
    const sw = Math.min(natural.width - sx, measuredSize.width / scale);
    const sh = Math.min(natural.height - sy, measuredSize.height / scale);
    const outputScale = Math.min(1, 1800 / Math.max(sw, sh));
    canvas.width = Math.max(1, Math.round(sw * outputScale));
    canvas.height = Math.max(1, Math.round(sh * outputScale));
    const context = canvas.getContext("2d");
    if (!context) {
      setError(t("cropFailed"));
      return;
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(t("cropFailed"));
          return;
        }
        const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`;
        onConfirm(new File([blob], name, { type: "image/webp", lastModified: Date.now() }));
      },
      "image/webp",
      0.92,
    );
  }, [file, measureViewport, natural, onConfirm, pan, size, t, zoom]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={t("cropTitle")}
      aria-modal="true"
      className="fixed inset-0 z-[70] m-0 flex h-full max-h-full w-full max-w-none flex-col items-center justify-center overflow-y-auto bg-black/80 p-4 text-white backdrop-blur-sm"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <section className="dbz-panel w-full max-w-2xl space-y-4 p-4 sm:p-6">
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-saiyan text-xl uppercase text-dbz-orange">{t("cropTitle")}</h2>
            <p className="mt-1 text-sm text-white/65">{t("cropHelp")}</p>
          </div>
          <button
            type="button"
            className="btn btn-ghost px-2"
            aria-label={t("close")}
            onClick={onCancel}
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap gap-2" aria-label={t("cropAspect")}>
          {PRESETS.map(({ key }) => (
            <button
              key={key}
              type="button"
              aria-pressed={aspectKey === key}
              onClick={() => {
                setAspectKey(key);
                setPan({ x: 0, y: 0 });
                // The viewport ratio changes on the next commit: measure it once laid out.
                requestAnimationFrame(measureViewport);
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${aspectKey === key ? "border-dbz-orange bg-dbz-orange/15 text-dbz-orange" : "border-white/15 bg-white/5 text-white/70 hover:border-white/40"}`}
            >
              {t(`aspect.${key}`)}
            </button>
          ))}
        </div>

        <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/60 p-3">
          <div
            ref={viewportRef}
            className="relative w-full max-w-[420px] touch-none overflow-hidden rounded-lg bg-[#111] ring-1 ring-white/25"
            style={{ aspectRatio: String(aspect) }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={(event) => {
              if (!dragRef.current) return;
              setPan({
                x: Math.max(
                  -(imageWidth - size.width) / 2,
                  Math.min(
                    (imageWidth - size.width) / 2,
                    dragRef.current.panX + event.clientX - dragRef.current.x,
                  ),
                ),
                y: Math.max(
                  -(imageHeight - size.height) / 2,
                  Math.min(
                    (imageHeight - size.height) / 2,
                    dragRef.current.panY + event.clientY - dragRef.current.y,
                  ),
                ),
              });
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
            onPointerCancel={() => {
              dragRef.current = null;
            }}
          >
            {/* The image is positioned from its measured source dimensions so dragging maps directly to crop offsets. */}
            <img
              ref={imageRef}
              alt={t("cropPreview")}
              draggable={false}
              onLoad={(event) => {
                setNatural({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
                requestAnimationFrame(measureViewport);
              }}
              className="pointer-events-none absolute max-w-none select-none"
              style={{
                width: imageWidth,
                height: imageHeight,
                left: `calc(50% + ${pan.x}px)`,
                top: `calc(50% + ${pan.y}px)`,
                transform: "translate(-50%, -50%)",
              }}
            />
            <div className="pointer-events-none absolute inset-0 border border-white/50" />
          </div>
        </div>

        <label className="flex items-center gap-3 text-xs text-white/70">
          <span className="shrink-0">{t("zoom")}</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            aria-label={t("zoom")}
            className="w-full accent-[var(--color-dbz-orange)]"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <span className="w-10 text-right font-mono">{zoom.toFixed(1)}×</span>
        </label>
        <p className="flex items-center gap-2 text-xs text-white/50">
          <Move className="size-4 shrink-0" />{" "}
          {t(file.type === "image/gif" ? "cropGifNote" : "cropDragHint")}
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <footer className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!natural.width}
            onClick={finish}
          >
            <Check className="size-4" /> {t("cropAndUpload")}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
