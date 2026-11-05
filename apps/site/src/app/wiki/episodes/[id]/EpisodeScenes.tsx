/* oxlint-disable react/no-array-index-key -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

/**
 * EpisodeScenes — galerie des scènes d'un épisode (`EpisodeFrame[]`) + export GIF animé
 * (`encodeFramesToGif`) et frise chronologique. La recherche de frames par image a été retirée
 * avec son backend.
 */

import { useCallback, useMemo, useState } from "react";
import { assetUrl } from "@/lib/assets";
import { EpisodeTimeline } from "@/components/episodes/EpisodeTimeline";
import { useVideoUIText } from "@/lib/video-ui-text";
import { Etoile } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";

/**
 * Réplique client-safe de `EpisodeFrame` (cf. `@/db/bot-schema`).
 */
export type SceneFrame = {
  source: "ffmpeg" | "bun-video";
  sourceId: string;
  sourceUrl: string | null;
  episodeNumber: number | null;
  imagePath: string | null;
  timecodeSec: number | null;
  width: number | null;
  height: number | null;
  characterNames: string[];
  tags: string[];
  caption: string | null;
  isNotable: boolean;
  sortOrder: number;
};
const NO_SCENE_FRAMES: SceneFrame[] = [];

function formatTimecode(sec: number | null): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Charge une image cross-origin en canvas pour l'encodage GIF. */
function loadFrameCanvas(src: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponible"));
        return;
      }
      const ir = img.width / img.height;
      const cr = width / height;
      let sx = 0;
      let sy = 0;
      let sw = img.width;
      let sh = img.height;
      if (ir > cr) {
        sw = img.height * cr;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / cr;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      resolve(canvas);
    });
    img.addEventListener("error", () => reject(new Error(`Frame illisible : ${src}`)));
    img.src = src;
  });
}

export function EpisodeScenes({
  frames = NO_SCENE_FRAMES,
  title,
  episodeNumber,
  episodeId,
  timelineAvailable = false,
}: {
  frames?: SceneFrame[];
  title: string;
  episodeNumber: number | null;
  episodeId?: number;
  timelineAvailable?: boolean;
}) {
  const videoText = useVideoUIText();
  const renderable = useMemo(
    () =>
      (frames ?? [])
        .filter((f): f is SceneFrame & { imagePath: string } => f.imagePath != null)
        .toSorted((a, b) => a.sortOrder - b.sortOrder),
    [frames],
  );

  // État de sélection pour l'export GIF
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [busyGif, setBusyGif] = useState(false);
  const [errorGif, setErrorGif] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);

  const selectionMode = selected.size > 0;

  const toggle = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const orderedSelection = useMemo(() => [...selected].toSorted((a, b) => a - b), [selected]);

  const exportGif = useCallback(async () => {
    setBusyGif(true);
    setErrorGif(null);
    try {
      const width = 480;
      const height = 270;
      const canvases = await Promise.all(
        orderedSelection.map((i) =>
          loadFrameCanvas(assetUrl(renderable[i].imagePath), width, height),
        ),
      );
      const { encodeFramesToGif } = await import("@/components/media/encodeGif");
      const blob = await encodeFramesToGif({
        width,
        height,
        frames: canvases.map((c) => ({ data: c, delay: 400 })),
        dither: "floyd-steinberg",
      });
      setGifUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setErrorGif(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyGif(false);
    }
  }, [orderedSelection, renderable]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setGifUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setErrorGif(null);
  }, []);

  return (
    <section className="shenron-episode-scenes @container min-w-0 space-y-6">
      {timelineAvailable && episodeId != null && (
        <EpisodeTimeline key={episodeId} episodeId={episodeId} />
      )}
      {/* En-tête de section avec navigation par onglets */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-dbz-orange/20 text-dbz-orange border border-dbz-orange/40">
            <Etoile taille={24} decorative className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display font-bold text-xl text-foreground uppercase tracking-wide flex flex-wrap items-center gap-2">
              {videoText("sceneTitle")}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)]">{videoText("sceneIntro")}</p>
          </div>
        </div>
      </div>

      {/* Galerie de scènes */}
      {renderable.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted-foreground)]">
            <p>{videoText("sceneSelectHint")}</p>
            <span className="scouter-text text-dbz-orange">
              {videoText("sceneFrameCount", { count: renderable.length })}
            </span>
          </div>

          <div className="grid grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-4 gap-3">
            {renderable.map((f, i) => {
              const isSelected = selected.has(i);
              const order = isSelected ? orderedSelection.indexOf(i) + 1 : 0;
              const tc = formatTimecode(f.timecodeSec);
              const alt =
                f.caption ??
                (f.characterNames.length > 0
                  ? `Scène avec ${f.characterNames.join(", ")}`
                  : episodeNumber === null
                    ? title
                    : `Scène de l'épisode ${episodeNumber}`);
              return (
                <button
                  key={`${f.sourceId}:${f.timecodeSec}:${f.sortOrder}`}
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isSelected}
                  className={`group relative aspect-video overflow-hidden rounded-lg bg-dbz-bg text-left transition-all dbz-panel ${
                    isSelected
                      ? "ring-2 ring-dbz-orange"
                      : f.isNotable
                        ? "ring-1 ring-dbz-orange/40"
                        : ""
                  }`}
                >
                  <img
                    src={assetUrl(f.imagePath)}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-85 transition-all duration-500 group-hover:opacity-100 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                  {f.isNotable && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-dbz-orange/85 text-black text-[9px] font-bold uppercase tracking-widest">
                      ★ Marquante
                    </span>
                  )}

                  {tc && (
                    <span className="absolute top-1.5 right-1.5 scouter-text text-[9px] text-dbz-orange bg-black/60 px-1.5 py-0.5 rounded">
                      {tc}
                    </span>
                  )}

                  {(f.caption ?? f.characterNames.length > 0) && (
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-1">
                      {f.caption ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-black/65 backdrop-blur-sm text-white text-[9px] font-semibold leading-none line-clamp-1">
                          {f.caption}
                        </span>
                      ) : (
                        f.characterNames.slice(0, 3).map((name) => (
                          <span
                            key={name}
                            className="px-1.5 py-0.5 rounded-full bg-black/65 backdrop-blur-sm text-white text-[9px] font-semibold leading-none line-clamp-1"
                          >
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                  )}

                  {order > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-dbz-orange text-black text-[11px] font-bold">
                      {order}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Barre d'export GIF */}
          {selectionMode && (
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 mt-4">
              <span className="text-sm text-foreground">
                {videoText("sceneSelection", { count: selected.size })}
              </span>
              <button
                type="button"
                onClick={exportGif}
                disabled={busyGif}
                className="min-h-11 rounded-full bg-primary px-5 py-2 font-display font-semibold text-primary-foreground text-sm transition-opacity disabled:opacity-50"
              >
                {videoText(busyGif ? "sceneEncoding" : "sceneExport")}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="min-h-11 px-3 text-sm text-foreground hover:text-primary transition-colors underline"
              >
                {videoText("sceneClear")}
              </button>
              {errorGif && <span className="text-sm text-dbz-red">{errorGif}</span>}
              {gifUrl && (
                <figure className="flex min-w-0 flex-wrap items-center gap-3">
                  <img
                    src={gifUrl}
                    alt={`GIF de scènes — ${title}`}
                    width={160}
                    height={90}
                    className="rounded-md border border-white/10"
                  />
                  <a
                    href={gifUrl}
                    download={`dbfr-ep${episodeNumber === null ? `id-${episodeId}` : String(episodeNumber).padStart(3, "0")}-scenes.gif`}
                    className="inline-flex min-h-11 items-center text-sm text-primary underline"
                  >
                    {videoText("sceneDownload")}
                  </a>
                </figure>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
