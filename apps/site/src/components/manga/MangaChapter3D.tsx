"use client";

/**
 * One page of the chapter staged in 3D: its panels, found on the gutters by shenron-engine
 * (wgpu on WebGPU, wasm), lift from the page. A client island because the renderer factory is
 * a function; without WebGPU the page stays flat. The reader above remains the way to read.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MangaPage3D } from "@aphrody/shenron-ui/reader";
import { createMangaSceneRenderer } from "@aphrody/shenron-engine/manga-scene";

export function MangaChapter3D({ pages }: { pages: readonly string[] }) {
  const t = useTranslations("mangaScene3d");
  const [index, setIndex] = useState(0);
  const [panels, setPanels] = useState<number | null>(null);
  const src = pages[index];
  if (!src) return null;
  const button =
    "cible-44 rounded-full border border-dbz-border bg-dbz-card px-4 py-2 text-sm text-os transition-colors hover:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-yellow disabled:pointer-events-none disabled:opacity-40";
  const go = (next: number) => {
    setPanels(null);
    setIndex(next);
  };
  return (
    <section aria-labelledby="manga-scene-3d" className="mx-auto mt-10 min-w-0 max-w-xl">
      <h2 id="manga-scene-3d" className="font-title text-2xl text-os">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-os/70">{t("lede")}</p>
      <div className="mt-4 min-w-0">
        <MangaPage3D
          key={src}
          src={src}
          alt={t("alt", { page: index + 1 })}
          renderer={createMangaSceneRenderer}
          onPanels={setPanels}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className={button}
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          {t("previous")}
        </button>
        <output aria-live="polite" className="text-sm text-os/70 tabular-nums">
          {t("position", { page: index + 1, total: pages.length })}
          {panels !== null && panels > 1 ? ` · ${t("panels", { count: panels })}` : null}
        </output>
        <button
          type="button"
          className={button}
          disabled={index >= pages.length - 1}
          onClick={() => go(index + 1)}
        >
          {t("next")}
        </button>
      </div>
    </section>
  );
}
