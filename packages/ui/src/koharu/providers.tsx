"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { StartupView } from "./components/app/StartupView";
import { ClientOnly } from "./components/ClientOnly";
import { refreshTranslationModels } from "./lib/backend";
import i18n from "./lib/i18n";
import { useSiteLocale } from "./lib/site-locale";
import { pageKey, pagesKey, projectKey, queryClient, refresh } from "./lib/queries";
import {
  receiveCanvas,
  failStartup,
  receiveDownload,
  receiveStartupState,
  receiveJob,
  receiveResources,
  useKoharuStore,
} from "./lib/store";
import {
  Channel,
  commands,
  type CanvasState,
  type Download,
  type Job,
  type ModelResources,
  type ProjectInfo,
} from "@aphrody/shenron-koharu/protocol";
import { Toaster } from "@aphrody/m3-primitives";
import { TooltipProvider } from "@aphrody/m3-primitives";
import { AtlasPreviewContext, type AtlasPreviewFactory } from "./lib/atlas-preview";
export type { AtlasPreviewFactory } from "./lib/atlas-preview";

/** How long the editor waits for the engine's startup state before showing an error. */
const STARTUP_TIMEOUT_MS = 30_000;

/** `locale`: the site locale (`fr | en | ja`) the editor speaks; unset, it keeps its detected language. */
export function Providers({
  children,
  locale,
  embedded = false,
  atlasRenderer = null,
}: {
  children: ReactNode;
  locale?: string;
  embedded?: boolean;
  atlasRenderer?: AtlasPreviewFactory | null;
}) {
  useSiteLocale(locale);
  const runtime = useRef({ active: false, bound: false });

  useEffect(() => {
    const lifecycle = runtime.current;
    lifecycle.active = true;
    if (!lifecycle.bound) {
      lifecycle.bound = true;
      const completed = new Map<string, number>();
      const channel = <T,>(receive: (value: T) => void) =>
        new Channel<T>((value) => {
          if (lifecycle.active) receive(value);
        });

      void refreshTranslationModels().catch(() => undefined);
      // Never wait forever on the engine: a missing or stuck engine becomes a visible error.
      const watchdog = setTimeout(() => failStartup("timeout"), STARTUP_TIMEOUT_MS);

      void commands
        .subscribe(
          channel<CanvasState>(receiveCanvas),
          channel<Job>((job) => {
            const previous = completed.get(job.id) ?? 0;
            completed.set(job.id, job.completed);
            receiveJob(job);
            if (job.completed > previous || job.state !== "running") {
              void refresh(projectKey, pagesKey, pageKey).catch(() => undefined);
            }
          }),
          channel<Download>(receiveDownload),
          channel<ModelResources>(receiveResources),
          channel<ProjectInfo | null>((project) => {
            const previous = queryClient.getQueryData<ProjectInfo | null>(projectKey);
            queryClient.setQueryData(projectKey, project);
            if (previous?.name !== project?.name) {
              const store = useKoharuStore.getState();
              store.selectPages(project?.active_page ? [project.active_page] : []);
              store.selectLayers([]);
            }
            if (project) {
              void refresh(pagesKey, pageKey).catch(() => undefined);
            } else {
              queryClient.setQueryData(pagesKey, []);
              queryClient.setQueryData(pageKey, null);
            }
          }),
        )
        .then((state) => {
          clearTimeout(watchdog);
          if (lifecycle.active) receiveStartupState(state);
          return undefined;
        })
        .catch((error: unknown) => {
          clearTimeout(watchdog);
          console.error("Shenron Studio engine unavailable", error);
          failStartup(error instanceof Error ? error.message : String(error));
        });
    }

    return () => {
      lifecycle.active = false;
    };
  }, []);

  useEffect(() => {
    const setLanguage = (language: string) => {
      document.documentElement.lang = language;
    };
    setLanguage(i18n.language);
    i18n.on("languageChanged", setLanguage);
    return () => i18n.off("languageChanged", setLanguage);
  }, []);

  useEffect(() => {
    // Prevent the host webview from applying browser zoom; keep Ctrl+wheel for app handlers.
    const preventViewportScaling = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    window.addEventListener("wheel", preventViewportScaling, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", preventViewportScaling, { capture: true });
  }, []);

  return (
    <AtlasPreviewContext.Provider value={atlasRenderer}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <TooltipProvider delay={0}>
            <ClientOnly>
              <StartupBoundary embedded={embedded}>{children}</StartupBoundary>
              <Toaster />
            </ClientOnly>
          </TooltipProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </AtlasPreviewContext.Provider>
  );
}

function StartupBoundary({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  const initialized = useKoharuStore((state) => state.initialized);
  return initialized ? <>{children}</> : <StartupView embedded={embedded} />;
}

export default Providers;
