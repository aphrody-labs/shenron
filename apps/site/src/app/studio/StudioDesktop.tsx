// SPDX-License-Identifier: Apache-2.0
"use client";
import { ThemeProvider } from "next-themes";
import { Providers, type AtlasPreviewFactory } from "@aphrody/shenron-ui/koharu/providers";
import { openSpriteAtlas } from "@aphrody/shenron-engine/sprite-atlas";
import { KoharuApp } from "@aphrody/shenron-ui/koharu/components/app/KoharuApp";
import { useLangue } from "@/lib/i18n/client";
import { DesktopStudioShell } from "./DesktopStudioShell";
import { StudioCatalogueImport } from "@/components/studio/StudioCatalogueImport";

const atlasRenderer: AtlasPreviewFactory = async (manifest, image, signal) => {
  const clip = await openSpriteAtlas(manifest, image, signal);
  const [width, height] = clip.player.atlas.tile;
  return {
    frameCount: clip.player.atlas.frames.length,
    fps: clip.player.atlas.fps,
    width,
    height,
    draw(canvas, elapsedMs) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D unavailable");
      context.clearRect(0, 0, width, height);
      return clip.player.draw(context, clip.image, elapsedMs);
    },
    close: clip.close,
  };
};

/**
 * The full editor, loaded only where its engine is local (see `StudioEditor`). `embedded`: in
 * a browser tab, without the window controls of the desktop app. The editor speaks the locale
 * of the site.
 */
export default function StudioDesktop({ embedded = false }: { embedded?: boolean }) {
  const { locale } = useLangue();
  const editor = (
    <div
      className={
        embedded
          ? "flex h-[calc(100dvh-8rem)] min-h-[440px] w-full min-w-0 overflow-hidden"
          : "flex min-h-0 flex-1"
      }
      data-koharu-host
    >
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Providers locale={locale} embedded atlasRenderer={atlasRenderer}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {embedded && <StudioCatalogueImport />}
            <KoharuApp embedded />
          </div>
        </Providers>
      </ThemeProvider>
    </div>
  );
  return embedded ? editor : <DesktopStudioShell>{editor}</DesktopStudioShell>;
}
