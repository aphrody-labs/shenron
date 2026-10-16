/* oxlint-disable react/no-array-index-key -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

/**
 * EpisodeScenes — Section « Scènes & Frame Finder (bxc frames) » d'un épisode.
 *
 * Combine deux moteurs :
 *   1. Galerie des scènes de l'épisode (`EpisodeFrame[]`) + export GIF animé (`encodeFramesToGif`).
 *   2. Scanner & Identifier de frames `bxc frames` (MPEG-7 ColorLayout DCT + trace.moe)
 *      permettant d'analyser n'importe quelle capture d'écran, de vérifier le timecode
 *      d'une scène et d'extraire la signature visuelle compacte de 33 coefficients.
 *
 * Affiché sur TOUS les épisodes du site pour offrir la feature frames de bxc en direct.
 */

import { useCallback, useMemo, useState } from "react";
import { assetUrl } from "@/lib/assets";
import { Film, RefreshCw, Scan, Search, Sparkles, Upload } from "lucide-react";
import { useVideoUIText } from "@/lib/video-ui-text";
import { frameUploadError, resolveFrameSearchTarget } from "@/lib/frames-map-shared";
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

interface FrameSearchResult {
  title: string;
  episode: number | null;
  season: number | null;
  atMs: number;
  timecode: string;
  similarity: number;
  isFirm: boolean;
  isPlausible: boolean;
  /** Faux = correspondance hors univers Dragon Ball (bruit trace.moe). */
  isDragonBall: boolean;
  /** Fiche du site visée, `null` si la correspondance ne concerne pas le site. */
  siteEpisode: {
    id: number;
    series: string;
    numberInSeries: number | null;
    title: string | null;
    href: string;
  } | null;
  preview: {
    image: string;
    video: string;
  };
  source: string;
  anilist: number;
}

interface BxcApiResponse {
  success: boolean;
  hash: string | null;
  /** Moteur qui a répondu : index local de la machine, trace.moe, ou rien. */
  origin?: "local" | "trace.moe" | "none";
  /** Vrai quand AUCUNE correspondance ne concerne Dragon Ball. */
  offUniverseOnly?: boolean;
  vector: number[];
  matches: FrameSearchResult[];
  quota: {
    used: number;
    total: number;
  };
}

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
  series,
  episodeId,
  episodeImage,
}: {
  frames?: SceneFrame[];
  title: string;
  episodeNumber: number | null;
  series?: string;
  episodeId?: number;
  episodeImage?: string | null;
}) {
  const videoText = useVideoUIText();
  const renderable = useMemo(
    () =>
      (frames ?? [])
        .filter((f): f is SceneFrame & { imagePath: string } => f.imagePath != null)
        .toSorted((a, b) => a.sortOrder - b.sortOrder),
    [frames],
  );

  // Onglet actif : "scenes" (si frames présentes) ou "finder"
  const [activeTab, setActiveTab] = useState<"scenes" | "finder">(
    renderable.length > 0 ? "scenes" : "finder",
  );

  // État de sélection pour l'export GIF
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [busyGif, setBusyGif] = useState(false);
  const [errorGif, setErrorGif] = useState<string | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);

  // État du scanner / analyseur bxc frames
  const [searchUrl, setSearchUrl] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<BxcApiResponse | null>(null);

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

  // Lancement de l'analyse bxc frames
  const executeScan = async (overrideTarget?: { file?: File; url?: string }) => {
    setScanning(true);
    setScanError(null);
    setScanResults(null);

    try {
      const formData = new FormData();
      const { file: targetFile, url: targetUrl } = resolveFrameSearchTarget(
        { file: uploadedFile, url: searchUrl },
        overrideTarget,
      );

      if (targetFile) {
        formData.append("file", targetFile);
      } else if (targetUrl?.trim()) {
        formData.append("url", targetUrl.trim());
      } else {
        throw new Error("Veuillez choisir un fichier ou renseigner une URL d'image.");
      }

      const res = await fetch("/api/frames/search", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });

      const data = (await res.json()) as BxcApiResponse & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Erreur serveur (${res.status})`);
      }

      setScanResults(data);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Erreur lors de l'analyse.");
    } finally {
      setScanning(false);
    }
  };

  const submitImageFile = async (file: File) => {
    if (scanning) return;
    const error = await frameUploadError(file).catch(() => "invalid" as const);
    if (error) {
      setScanError(videoText(error === "tooLarge" ? "sceneImageTooLarge" : "sceneInvalidImage"));
      return;
    }
    setUploadedFile(file);
    await executeScan({ file });
  };

  return (
    <section className="shenron-episode-scenes @container min-w-0 space-y-6">
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

        <div className="shenron-video-selectors flex max-w-full flex-wrap items-center gap-2 rounded-full bg-card p-1 border border-border">
          {renderable.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("scenes")}
              aria-pressed={activeTab === "scenes"}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === "scenes"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:text-primary"
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              {videoText("sceneGallery", { count: renderable.length })}
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("finder")}
            aria-pressed={activeTab === "finder"}
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "finder"
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:text-primary"
            }`}
          >
            <Scan className="h-3.5 w-3.5" />
            {videoText("sceneSearch")}
          </button>
        </div>
      </div>

      {/* Onglet 1 : Galerie de Scènes */}
      {activeTab === "scenes" && renderable.length > 0 && (
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

      {/* Onglet 2 : Frame Finder & Reconnaissance bxc frames */}
      {activeTab === "finder" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
            <div className="flex min-w-0 flex-col @3xl:flex-row items-start @3xl:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-dbz-yellow" />
                  {videoText("sceneSearchTitle")}
                </h3>
                <p className="mt-1 max-w-2xl text-sm text-[var(--muted-foreground)]">
                  {videoText("sceneSearchNote")}
                </p>
              </div>

              {episodeImage && (
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => executeScan({ url: assetUrl(episodeImage) })}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                >
                  {scanning ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {videoText("sceneScanThumbnail")}
                </button>
              )}
            </div>

            {/* Formulaire de soumission d'image */}
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
              <div className="min-w-0 space-y-2">
                <span className="block text-sm font-semibold text-foreground">
                  {videoText("sceneImageUrl")}
                </span>
                <div className="flex gap-2">
                  <input
                    type="url"
                    aria-label={videoText("sceneImageUrl")}
                    placeholder="https://..."
                    value={searchUrl}
                    onChange={(e) => setSearchUrl(e.target.value)}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--muted-foreground)] focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={scanning || !searchUrl.trim()}
                    onClick={() => executeScan({ url: searchUrl })}
                    className="min-h-11 shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                  >
                    {videoText(scanning ? "sceneAnalyzing" : "sceneAnalyze")}
                  </button>
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <span className="block text-sm font-semibold text-foreground">
                  {videoText("sceneUploadLabel")}
                </span>
                <label className="relative flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background p-3 text-sm text-foreground hover:border-primary cursor-pointer transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
                  <Upload className="h-3.5 w-3.5" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {uploadedFile ? uploadedFile.name : videoText("sceneImageUpload")}
                  </span>
                  <input
                    type="file"
                    aria-label={videoText("sceneImageFile")}
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    disabled={scanning}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files[0];
                      if (file) void submitImageFile(file);
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void submitImageFile(file);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            {scanError && (
              <div
                role="alert"
                className="mt-4 rounded-lg bg-red-950/40 border border-red-500/40 p-3 text-sm text-red-300"
              >
                {scanError}
              </div>
            )}
          </div>

          {/* Résultats de l'analyse bxc frames */}
          {scanResults && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-6 sm:p-6">
              <h4 className="text-base font-bold text-foreground">
                {videoText("sceneResults", { count: scanResults.matches.length })}
              </h4>
              <details className="rounded-xl border border-border p-3 text-foreground">
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                  {videoText("sceneTechnical")}
                </summary>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    {scanResults.hash && (
                      <p className="mt-1 font-mono text-xs text-[var(--muted-foreground)] [overflow-wrap:anywhere]">
                        Signature ColorLayout MPEG-7 : <code>{scanResults.hash}</code>
                      </p>
                    )}
                    {scanResults.origin && scanResults.origin !== "none" && (
                      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                        Source :{" "}
                        {scanResults.origin === "local" ? (
                          <strong className="text-foreground">
                            index local des épisodes (frame par frame)
                          </strong>
                        ) : (
                          <strong className="text-foreground">
                            trace.moe — catalogue anime mondial, hors base DBFR
                          </strong>
                        )}
                      </p>
                    )}
                  </div>

                  {scanResults.vector.length > 0 && (
                    <div className="flex max-w-full flex-wrap items-center gap-1 bg-background px-3 py-2 rounded-lg border border-border">
                      <span className="text-xs text-[var(--muted-foreground)] mr-2 font-mono">
                        DCT 33 Coeffs
                      </span>
                      <div className="flex items-end gap-0.5 h-4">
                        {scanResults.vector.slice(0, 24).map((val, idx) => {
                          const h = Math.min(100, Math.max(15, (val / 64) * 100));
                          return (
                            <div
                              key={`dct-${idx}`}
                              style={{ height: `${h}%` }}
                              className={`w-1 rounded-t-sm ${
                                idx < 8
                                  ? "bg-dbz-orange"
                                  : idx < 16
                                    ? "bg-dbz-yellow"
                                    : "bg-blue-400"
                              }`}
                              title={`Coeff ${idx}: ${val}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </details>

              {scanResults.offUniverseOnly && scanResults.matches.length > 0 && (
                <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
                  {videoText("sceneOtherAnime")}
                </div>
              )}

              {scanResults.matches.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">
                  {videoText("sceneNoMatch")}
                </p>
              ) : (
                <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
                  {scanResults.matches.map((m) => {
                    // Un numéro d'épisode seul ne prouve rien : « One Piece 5 » et
                    // « DB 5 » partagent le même entier. La confirmation exige que la
                    // correspondance soit rattachée à CETTE fiche du site.
                    const isCurrentEp =
                      m.isDragonBall &&
                      (m.siteEpisode?.id === episodeId ||
                        (episodeNumber !== null &&
                          m.siteEpisode?.numberInSeries === episodeNumber &&
                          m.siteEpisode?.series === series));
                    return (
                      <div
                        key={`${m.anilist}:${m.episode}:${m.atMs}`}
                        className={`rounded-lg border p-4 transition-all ${
                          isCurrentEp
                            ? "border-emerald-500/50 bg-emerald-950/20"
                            : m.isFirm
                              ? "border-primary/40 bg-primary/10"
                              : "border-border bg-background"
                        }`}
                      >
                        <div className="flex min-w-0 flex-col gap-3 @lg:flex-row">
                          {m.preview?.video ? (
                            <div className="relative w-36 aspect-video shrink-0 overflow-hidden rounded bg-black">
                              <video
                                src={m.preview.video}
                                autoPlay
                                muted
                                loop
                                playsInline
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : m.preview?.image ? (
                            <img
                              src={m.preview.image}
                              alt={m.title}
                              className="w-36 aspect-video shrink-0 rounded object-cover border border-white/10"
                            />
                          ) : null}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-sm text-foreground truncate">
                                {m.title}
                              </p>
                              <span
                                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                  m.isFirm
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                    : m.isPlausible
                                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                      : "bg-white/10 text-white/50"
                                }`}
                              >
                                {m.similarity}%
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-foreground)]">
                              <span>
                                Épisode <strong>{m.episode ?? "?"}</strong>
                              </span>
                              <span>•</span>
                              <span className="font-mono text-dbz-orange font-bold">
                                {m.timecode}
                              </span>
                            </div>

                            {m.siteEpisode && (
                              <a
                                href={m.siteEpisode.href}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-dbz-orange underline-offset-2 hover:underline"
                              >
                                Ouvrir la fiche{" "}
                                {m.siteEpisode.title
                                  ? `« ${m.siteEpisode.title} »`
                                  : `#${m.siteEpisode.id}`}{" "}
                                au timecode
                              </a>
                            )}

                            {!m.isDragonBall && (
                              <div className="inline-flex items-center gap-1 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-bold text-yellow-300">
                                Hors univers Dragon Ball
                              </div>
                            )}

                            {isCurrentEp && (
                              <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 mt-1">
                                ✓ Confirmé pour cet épisode !
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
