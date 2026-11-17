// SPDX-License-Identifier: Apache-2.0
"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { commands, type Page } from "@aphrody/shenron-koharu/protocol";
import { Button } from "../../components/button";
import { usePage } from "../lib/queries";
import { useAtlasPreview, type AtlasPreview, type AtlasPreviewFactory } from "../lib/atlas-preview";
import { atlasMatchesPage } from "../lib/atlas-source";

/** A host without an atlas renderer keeps its existing Studio capability set. */
export function ShenronAtlasPanel() {
  const renderer = useAtlasPreview();
  return renderer ? <ActivePageAtlas renderer={renderer} /> : null;
}

function ActivePageAtlas({ renderer }: { renderer: AtlasPreviewFactory }) {
  const { t } = useTranslation();
  const page = usePage().data;
  return page ? (
    <PageAtlas key={page.id} page={page} renderer={renderer} />
  ) : (
    <p className="p-3 text-xs text-muted-foreground">{t("atlasPreview.emptyPage")}</p>
  );
}

function PageAtlas({ page, renderer }: { page: Page; renderer: AtlasPreviewFactory }) {
  const { t } = useTranslation();
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [clip, setClip] = useState<AtlasPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const request = useRef<AbortController | null>(null);
  const elapsed = useRef(0);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!clip) return;
    elapsed.current = 0;
    if (canvas.current) clip.draw(canvas.current, 0);
    return () => clip.close();
  }, [clip]);

  useEffect(() => {
    const pause = () => setPlaying(false);
    const visibility = () => {
      if (document.hidden) pause();
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", pause);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", pause);
    };
  }, []);

  useEffect(() => {
    if (!clip || !playing) return;
    const started = performance.now();
    const base = elapsed.current;
    let animation = 0;
    const tick = (now: number) => {
      if (!canvas.current) return;
      elapsed.current = base + now - started;
      setFrame(clip.draw(canvas.current, elapsed.current));
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [clip, playing]);

  const reset = () => {
    request.current?.abort();
    setClip(null);
    setPlaying(false);
    setError(null);
    setFrame(0);
  };

  const open = async () => {
    if (!manifestFile || !imageFile) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setPlaying(false);
    setError(null);
    try {
      if (manifestFile.size > 1024 * 1024) throw new Error("manifest limit");
      const manifest: unknown = JSON.parse(await manifestFile.text());
      const source = await commands.getPageSourceSha256(page.id);
      if (controller.signal.aborted) return;
      if (!atlasMatchesPage(manifest, source, page.size)) {
        setError(t("atlasPreview.sourceMismatch"));
        return;
      }
      const next = await renderer(manifest, imageFile, controller.signal);
      if (controller.signal.aborted) next.close();
      else {
        setClip(next);
        setFrame(0);
      }
    } catch {
      if (!controller.signal.aborted) setError(t("atlasPreview.failed"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const select = (index: number) => {
    if (!clip || !canvas.current) return;
    setPlaying(false);
    elapsed.current = (index * 1000) / clip.fps;
    setFrame(clip.draw(canvas.current, elapsed.current));
  };

  return (
    <section
      aria-label={t("atlasPreview.title")}
      className="grid gap-3 rounded-xl border border-border bg-muted/15 p-3"
    >
      <div>
        <h3 className="text-xs font-semibold">{t("atlasPreview.title")}</h3>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {t("atlasPreview.description")}
        </p>
      </div>
      <label className="grid gap-1 text-[11px]">
        {t("atlasPreview.manifest")}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          className="w-full min-w-0 text-[10px] file:mr-2 file:rounded-full file:border-0 file:bg-primary/15 file:px-3 file:py-2 file:font-semibold file:text-primary"
          onChange={(event) => {
            reset();
            setManifestFile(event.target.files?.[0] ?? null);
          }}
        />
      </label>
      <label className="grid gap-1 text-[11px]">
        {t("atlasPreview.image")}
        <input
          type="file"
          accept=".png,image/png"
          disabled={busy}
          className="w-full min-w-0 text-[10px] file:mr-2 file:rounded-full file:border-0 file:bg-primary/15 file:px-3 file:py-2 file:font-semibold file:text-primary"
          onChange={(event) => {
            reset();
            setImageFile(event.target.files?.[0] ?? null);
          }}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !manifestFile || !imageFile}
        onClick={() => void open()}
      >
        {t(busy ? "atlasPreview.loading" : "atlasPreview.open")}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {clip && (
        <>
          <p className="text-[11px] text-muted-foreground">
            {t("atlasPreview.sourceMatched", { label: page.label })}
          </p>
          <canvas
            ref={canvas}
            width={clip.width}
            height={clip.height}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the atlas requires a Canvas 2D surface
            role="img"
            aria-label={t("atlasPreview.frame", { index: frame + 1, count: clip.frameCount })}
            className="mx-auto block h-auto max-w-full rounded-lg bg-white [image-rendering:pixelated]"
          />
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("atlasPreview.previous")}
              disabled={frame === 0}
              onClick={() => select(frame - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-pressed={playing}
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {t(playing ? "atlasPreview.pause" : "atlasPreview.play")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("atlasPreview.next")}
              disabled={frame === clip.frameCount - 1}
              onClick={() => select(frame + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <label className="grid gap-1 text-[11px]">
            {t("atlasPreview.frame", { index: frame + 1, count: clip.frameCount })}
            <input
              type="range"
              min="0"
              max={clip.frameCount - 1}
              step="1"
              value={frame}
              className="h-10 w-full accent-primary"
              onChange={(event) => select(Number(event.target.value))}
            />
          </label>
        </>
      )}
    </section>
  );
}
