"use client";
// SPDX-License-Identifier: Apache-2.0
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useLangue } from "@/lib/i18n/client";
import { reprises, viderHistorique, type EntreeHistorique } from "@/lib/historique-local";
import type { PortalPublication } from "@/lib/wiki-publications";
import { SCENE_MASCOTS } from "./scene-assets";
import { SCENE_ARCHIVE_STILLS, SCENE_TEXTURE_SHEETS, sceneTextureCrop } from "./scene-media";
import {
  WIKI_SCENE_CATEGORIES,
  WIKI_SCENE_REGIONS,
  REGION_LABEL_POINTS,
  sceneCamera,
  scenePoint,
  sceneHotspotPoint,
  type WikiSceneView,
} from "./scene-catalogue";
import type { SceneRendererState, WikiSceneController } from "./scene-renderer";
import { sceneMessages } from "./scene-messages";
import { WikiWorldFallback } from "./WikiWorldFallback";
import { WikiSceneDepth } from "./WikiSceneDepth";
import { useWikiSceneViewport } from "./useWikiSceneViewport";
import styles from "./wiki-scene.module.css";

const INITIAL_STATE: SceneRendererState = {
  phase: "starting",
  backend: "svg",
  context: "none",
  running: false,
  reducedMotion: false,
  loadedAssets: [],
  frames: 0,
  width: 1200,
  height: 720,
};
const EMPTY_COUNTS: Record<string, number> = {};
const EMPTY_PUBLICATIONS: readonly PortalPublication[] = [];

/** Accessible navigation is DOM-owned; the GPU scene is an independently disposable enhancement. */
export function WikiScenePortal({
  counts = EMPTY_COUNTS,
  enabledSections,
  publications = EMPTY_PUBLICATIONS,
  corpus,
}: {
  counts?: Record<string, number>;
  enabledSections?: readonly string[];
  publications?: readonly PortalPublication[];
  corpus?: { canonReferences: number | null; ragChunks: number | null };
}) {
  const { locale } = useLangue();
  const t = sceneMessages(locale);
  const unique = useId().replaceAll(":", "");
  const indexId = `wiki-world-index-${unique}`;
  const world = useRef<HTMLElement>(null);
  useWikiSceneViewport(world);
  const viewport = useRef<HTMLDivElement>(null);
  const gpuHost = useRef<HTMLDivElement>(null);
  const controller = useRef<WikiSceneController | undefined>(undefined);
  const [size, setSize] = useState({ width: 1200, height: 720 });
  const [measured, setMeasured] = useState(false);
  const [view, setView] = useState<WikiSceneView>("atlas");
  const [paused, setPaused] = useState(false);
  const [gpu, setGpu] = useState<SceneRendererState>(INITIAL_STATE);
  const [indexOpen, setIndexOpen] = useState(false);
  const [depthEnabled, setDepthEnabled] = useState(false);
  const [depthUnavailable, setDepthUnavailable] = useState(false);
  const handleDepthUnavailable = useCallback(() => {
    setDepthEnabled(false);
    setDepthUnavailable(true);
  }, []);
  const [history, setHistory] = useState<EntreeHistorique[]>([]);
  const viewRef = useRef(view);
  const hasChosenView = useRef(false);
  const chooseView = useCallback((next: WikiSceneView) => {
    hasChosenView.current = true;
    viewRef.current = next;
    setView(next);
  }, []);
  const pausedRef = useRef(paused);
  const camera = sceneCamera(view, size.width, size.height);
  const houseSign = scenePoint(camera, 560, 705);
  const number = new Intl.NumberFormat(locale);
  const categories = useMemo(
    () =>
      WIKI_SCENE_CATEGORIES.filter(
        (entry) => !enabledSections || enabledSections.includes(entry.id),
      ),
    [enabledSections],
  );
  const archiveStills =
    !enabledSections || enabledSections.includes("episodes") ? SCENE_ARCHIVE_STILLS : [];

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- synchronize the existing private device-history owner after hydration.
    setHistory(
      reprises()
        .filter((entry) =>
          categories.some(
            (category) =>
              entry.href === category.href || entry.href.startsWith(`${category.href}/`),
          ),
        )
        .slice(0, 3),
    );
  }, [categories]);

  useEffect(() => {
    viewRef.current = view;
    controller.current?.setView(view);
  }, [view]);

  useEffect(() => {
    pausedRef.current = paused;
    controller.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const element = viewport.current;
    const host = gpuHost.current;
    if (!element || !host) return;
    const abort = new AbortController();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setGpu((previous) => ({ ...previous, reducedMotion: motion.matches }));
    motion.addEventListener("change", onMotion);
    let firstResize = true;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || abort.signal.aborted) return;
      const next = {
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      };
      setSize(next);
      setMeasured(true);
      if (firstResize && next.width < 760 && !hasChosenView.current) {
        viewRef.current = "earth";
        setView("earth");
      }
      firstResize = false;
      controller.current?.resize(next.width, next.height);
    });
    observer.observe(element);
    if (!window.isSecureContext || !navigator.gpu) {
      // oxlint-disable-next-line react/set-state-in-effect -- synchronize browser GPU and motion capabilities, without loading Pixi in fallback mode.
      setGpu((previous) => ({
        ...previous,
        phase: "fallback",
        backend: "svg",
        reason: "unavailable",
        reducedMotion: motion.matches,
      }));
    } else
      void import("./scene-renderer")
        .then(({ createWikiScene }) =>
          createWikiScene(
            host,
            viewRef.current,
            (state) => {
              if (!abort.signal.aborted) setGpu(state);
            },
            abort.signal,
          ),
        )
        .then((scene) => {
          if (abort.signal.aborted) {
            scene.destroy();
            return scene;
          }
          controller.current = scene;
          scene.setView(viewRef.current);
          scene.setPaused(pausedRef.current);
          scene.resize(element.clientWidth, element.clientHeight);
          return scene;
        })
        .catch(() => {
          if (!abort.signal.aborted)
            setGpu((previous) => ({
              ...previous,
              phase: "fallback",
              backend: "svg",
              reason: "module-unavailable",
            }));
        });
    return () => {
      abort.abort();
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      controller.current?.destroy();
      controller.current = undefined;
    };
  }, []);

  const count = (key?: string) =>
    key && typeof counts[key] === "number" ? number.format(counts[key]) : undefined;
  return (
    <section
      ref={world}
      className={styles.world}
      data-view={view}
      data-measured={measured}
      data-renderer={gpu.backend}
      data-phase={gpu.phase}
      data-paused={paused || gpu.reducedMotion || gpu.phase === "fallback"}
    >
      <a className={styles.skip} href={`#${indexId}`} onClick={() => setIndexOpen(true)}>
        {t("skip")}
      </a>
      <header className={styles.header} data-scene-chrome>
        <div className={styles.title}>
          <span aria-hidden="true" className={styles.brandOrb}>
            ★
          </span>
          <div>
            <h1>{t("title")}</h1>
            <p>{t("subtitle")}</p>
          </div>
        </div>
        <search className={styles.search}>
          <form action="/wiki/search">
            <label htmlFor={`world-search-${unique}`} className={styles.screenReader}>
              {t("searchLabel")}
            </label>
            <input
              id={`world-search-${unique}`}
              type="search"
              name="q"
              placeholder={t("searchPlaceholder")}
            />
            <button type="submit" aria-label={t("search")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 6 6" />
              </svg>
            </button>
          </form>
        </search>
      </header>

      <nav className={styles.destinations} aria-label={t("regionsLabel")} data-scene-chrome>
        {(["atlas", ...WIKI_SCENE_REGIONS] as const).map((region) => (
          <button
            type="button"
            key={region}
            aria-pressed={view === region}
            data-region={region}
            onClick={() => chooseView(region)}
          >
            {t(region)}
          </button>
        ))}
        <button
          type="button"
          className={styles.motion}
          onClick={() => setPaused((value) => !value)}
          disabled={gpu.reducedMotion || gpu.phase === "fallback"}
          aria-pressed={paused}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            {paused ? (
              <path d="m6 3 10 7-10 7z" />
            ) : (
              <>
                <path d="M5 3h3v14H5z" />
                <path d="M12 3h3v14h-3z" />
              </>
            )}
          </svg>
          <span>
            {t(
              gpu.phase === "fallback"
                ? "staticScene"
                : gpu.reducedMotion
                  ? "reducedMotion"
                  : paused
                    ? "resume"
                    : "pause",
            )}
          </span>
        </button>
        <button
          type="button"
          className={styles.depthControl}
          disabled={gpu.phase !== "ready"}
          aria-pressed={depthEnabled}
          onClick={() => {
            setDepthUnavailable(false);
            if (!depthEnabled) chooseView("namek");
            setDepthEnabled((value) => !value);
          }}
        >
          {t("depth")}
        </button>
      </nav>

      <div ref={viewport} className={styles.viewport} data-scene-viewport>
        <div ref={gpuHost} className={styles.gpuHost} aria-hidden="true" />
        <div className={styles.fallback} aria-hidden="true">
          <WikiWorldFallback camera={camera} width={size.width} height={size.height} />
        </div>
        <div className={styles.mascots} aria-hidden="true">
          {SCENE_MASCOTS.map((asset) => {
            const point = scenePoint(camera, asset.x, asset.y);
            const hidden = gpu.phase === "ready" && gpu.loadedAssets.includes(asset.id);
            return (
              <img
                key={asset.id}
                src={asset.src}
                alt=""
                width={asset.width}
                height={asset.height}
                hidden={hidden}
                className={styles.mascot}
                data-character={asset.id}
                style={{ left: point.x, top: point.y, height: asset.displayHeight * camera.scale }}
              />
            );
          })}
        </div>
        {depthEnabled && gpu.phase === "ready" && (
          <WikiSceneDepth
            camera={camera}
            paused={paused || gpu.reducedMotion}
            onUnavailable={handleDepthUnavailable}
          />
        )}
        <span
          aria-hidden="true"
          className={styles.houseSign}
          style={{ left: houseSign.x, top: houseSign.y, fontSize: 22 * camera.scale }}
        >
          {t("houseSign")}
        </span>
        <div className={styles.landmarkLabels}>
          {WIKI_SCENE_REGIONS.map((region) => {
            const center = REGION_LABEL_POINTS[region];
            const point = scenePoint(camera, center.x, center.y);
            if (view === "atlas" && size.width < 760)
              return (
                <button
                  key={region}
                  type="button"
                  style={{ left: point.x, top: point.y }}
                  onClick={() => chooseView(region)}
                >
                  {t(region)}
                </button>
              );
            return (
              <span
                key={region}
                aria-hidden="true"
                hidden={view !== "atlas" && view !== region}
                style={{ left: point.x, top: point.y }}
              >
                {t(region)}
              </span>
            );
          })}
        </div>
        <nav className={styles.hotspots} aria-label={t("mapLabel")}>
          {categories.map((entry) => {
            const point = sceneHotspotPoint(entry, view, size.width, size.height);
            const visible = view === entry.region || (view === "atlas" && size.width >= 760);
            const x = Math.max(70, Math.min(size.width - 70, point.x));
            return (
              <Link
                key={entry.id}
                href={entry.href}
                prefetch={false}
                hidden={!visible}
                data-region={entry.region}
                className={styles.hotspot}
                style={{ left: x, top: point.y } as CSSProperties}
              >
                <span className={styles.marker} aria-hidden="true" />
                <span>{t(entry.id)}</span>
              </Link>
            );
          })}
        </nav>
        {gpu.phase === "fallback" && (
          <output className={styles.fallbackStatus}>{t("illustratedMode")}</output>
        )}
        {depthUnavailable && (
          <output className={styles.fallbackStatus}>{t("depthUnavailable")}</output>
        )}
      </div>

      <div className={styles.bottomBar} data-scene-chrome>
        <details
          id={indexId}
          tabIndex={-1}
          className={styles.index}
          open={indexOpen}
          onToggle={(event) => setIndexOpen(event.currentTarget.open)}
        >
          <summary>{t("index")}</summary>
          <nav aria-label={t("index")}>
            {categories.map((entry) => (
              <Link key={entry.id} href={entry.href} prefetch={false}>
                <span>{t(entry.id)}</span>
                {count(entry.countKey) && <small>{count(entry.countKey)}</small>}
              </Link>
            ))}
          </nav>
        </details>
        {(publications.length > 0 || history.length > 0 || archiveStills.length > 0 || corpus) && (
          <details className={styles.journal}>
            <summary>{t("journal")}</summary>
            <div>
              {history.length > 0 && (
                <section>
                  <div className={styles.journalHeading}>
                    <h2>{t("resumeReading")}</h2>
                    <button
                      type="button"
                      onClick={() => {
                        viderHistorique();
                        setHistory([]);
                      }}
                    >
                      {t("clearHistory")}
                    </button>
                  </div>
                  <nav>
                    {history.map((entry) => (
                      <Link key={entry.href} href={entry.href} prefetch={false}>
                        {entry.titre}
                      </Link>
                    ))}
                  </nav>
                </section>
              )}
              {publications.length > 0 && (
                <section>
                  <h2>{t("recent")}</h2>
                  <nav>
                    {publications.map((entry) => (
                      <Link key={entry.id} href={entry.href} prefetch={false}>
                        {entry.image && (
                          <img src={entry.image} width={40} height={52} alt="" loading="lazy" />
                        )}
                        <span>
                          {entry.title}
                          <time dateTime={new Date(entry.date).toISOString()}>
                            {new Intl.DateTimeFormat(locale, {
                              year: "numeric",
                              month: "short",
                              timeZone: "UTC",
                            }).format(entry.date)}
                          </time>
                        </span>
                      </Link>
                    ))}
                  </nav>
                </section>
              )}
              {archiveStills.length > 0 && (
                <section>
                  <h2>{t("fromAnime")}</h2>
                  <nav>
                    {archiveStills.map((entry) => (
                      <Link
                        key={entry.id}
                        href={entry.href}
                        prefetch={false}
                        data-media-id={entry.id}
                      >
                        <span
                          className={styles.archiveThumb}
                          aria-hidden="true"
                          style={sceneTextureCrop(entry)}
                        />
                        <span>{t(entry.id)}</span>
                      </Link>
                    ))}
                  </nav>
                </section>
              )}
              {corpus &&
                (corpus.ragChunks !== null ||
                  (corpus.canonReferences !== null &&
                    categories.some((entry) => entry.id === "canon"))) && (
                  <section>
                    <h2>{t("corpus")}</h2>
                    <nav>
                      {corpus.canonReferences !== null &&
                        categories.some((entry) => entry.id === "canon") && (
                          <Link href="/wiki/canon">
                            {t("canonReferences")}{" "}
                            <span>{number.format(corpus.canonReferences)}</span>
                          </Link>
                        )}
                      {corpus.ragChunks !== null && (
                        <Link href="/wiki/search">
                          {t("indexedSources")} <span>{number.format(corpus.ragChunks)}</span>
                        </Link>
                      )}
                    </nav>
                  </section>
                )}
            </div>
          </details>
        )}
        <Link href="/wiki/contribute" className={styles.contribute}>
          {t("contribute")} <span aria-hidden="true">↗</span>
        </Link>
        <details className={styles.sources}>
          <summary>{t("sources")}</summary>
          <div>
            <p>{t("vectorScenery")}</p>
            {SCENE_MASCOTS.map((asset) => (
              <a
                key={asset.id}
                href={asset.sourcePage ?? asset.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t(asset.id)} · {asset.sourceLabel} ·{" "}
                {t(asset.format === "raster" ? "raster" : "vectorScenery")}
              </a>
            ))}
            {Object.values(SCENE_TEXTURE_SHEETS).map((sheet) => (
              <a key={sheet.src} href={sheet.sourceUrl} target="_blank" rel="noreferrer">
                {sheet.sourceLabel} ·{" "}
                {t(sheet.format === "raster" ? "raster" : "vectorIllustration")}
              </a>
            ))}
            <a href="https://kenney.nl/assets/nature-kit" target="_blank" rel="noreferrer">
              {t("depth")} · Kenney · CC0
            </a>
          </div>
        </details>
      </div>
      <noscript>
        <nav aria-label={t("index")} className={styles.noScriptIndex}>
          {categories.map((entry) => (
            <a key={entry.id} href={entry.href}>
              {t(entry.id)}
            </a>
          ))}
        </nav>
      </noscript>
    </section>
  );
}
