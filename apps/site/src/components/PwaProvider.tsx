"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLangue } from "@/lib/i18n/client";
import { pwaText } from "@/lib/pwa";
import { isTauri } from "@aphrody/shenron-ui/studio/tauri-bridge";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface PwaState {
  install: InstallEvent | null;
  waiting: ServiceWorker | null;
  offline: boolean;
  ios: boolean;
}
const PwaContext = createContext<PwaState>({
  install: null,
  waiting: null,
  offline: false,
  ios: false,
});

export function PwaProvider({ children }: { children: ReactNode }) {
  const { locale } = useLangue();
  const [state, setState] = useState<PwaState>({
    install: null,
    waiting: null,
    offline: false,
    ios: false,
  });
  useEffect(() => {
    if (isTauri() || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const online = () => setState((current) => ({ ...current, offline: !navigator.onLine }));
    const navigateOffline = (event: MouseEvent) => {
      if (
        navigator.onLine ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self"))
        return;
      const target = new URL(link.href, location.href);
      if (
        target.origin !== location.origin ||
        (target.pathname === location.pathname && target.search === location.search && target.hash)
      )
        return;
      event.preventDefault();
      location.assign(target.href);
    };
    const installed = () => setState((current) => ({ ...current, install: null, ios: false }));
    const prompt = (event: Event) => {
      event.preventDefault();
      if (!standalone) setState((current) => ({ ...current, install: event as InstallEvent }));
    };
    const status = () => {
      if (!disposed)
        setState((current) => ({ ...current, waiting: registration?.waiting ?? null }));
    };
    const found = () => {
      installing?.removeEventListener("statechange", status);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", status);
      status();
    };
    online();
    setState((current) => ({
      ...current,
      ios:
        !standalone &&
        (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)),
    }));
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("click", navigateOffline, true);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((value) => {
        if (disposed) return;
        registration = value;
        registration.addEventListener("updatefound", found);
        found();
        void registration.update().catch(() => {});
        void navigator.serviceWorker.ready.then((active) => {
          if (!disposed) active.active?.postMessage({ type: "DBFR_LOCALE", locale });
        });
      })
      .catch(() => {});
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", found);
      installing?.removeEventListener("statechange", status);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("click", navigateOffline, true);
    };
  }, [locale]);
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest) manifest.href = `/manifest.webmanifest?lang=${locale}`;
  }, [locale]);
  return <PwaContext.Provider value={state}>{children}</PwaContext.Provider>;
}

export function PwaControls() {
  const { locale } = useLangue();
  const t = pwaText(locale);
  const { install, waiting, offline, ios } = useContext(PwaContext);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState<InstallEvent | null>(null);
  const style =
    "min-h-11 w-full rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  if (!install && !waiting && !offline && !ios && !error) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2 px-2 py-2" data-pwa-controls>
      {offline && <output className="text-sm text-muted-foreground">{t.offline}</output>}
      {install && dismissed !== install && (
        <button
          className={style}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              await install.prompt();
              await install.userChoice;
              setDismissed(install);
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t.installing : t.install}
        </button>
      )}
      {waiting && (
        <button
          className={style}
          onClick={() => {
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
              once: true,
            });
            waiting.postMessage({ type: "DBFR_ACTIVATE_UPDATE" });
          }}
        >
          {t.update}
        </button>
      )}
      {ios && (
        <details>
          <summary className={`${style} cursor-pointer`}>{t.iosInstall}</summary>
          <p className="pt-2 text-sm text-muted-foreground">{t.iosHint}</p>
        </details>
      )}
      {error && <output className="text-sm text-muted-foreground">{t.installError}</output>}
    </div>
  );
}
