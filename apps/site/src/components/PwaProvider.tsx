/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-redundant-roles, jsx-a11y/prefer-tag-over-role, promise/always-return, react/jsx-no-constructed-context-values, react/set-state-in-effect, unicorn/require-post-message-target-origin -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLangue } from "@/lib/i18n/client";
import { pwaText } from "@/lib/pwa";
import { isTauri } from "@aphrody/shenron-ui/studio/tauri-bridge";
import { InstallDesktopIcon } from "@aphrody/shenron-ui/material-symbols";
import { Rafraichir } from "@aphrody/shenron-ui/icones";
import { resolveEpisodeTheme } from "@/lib/episode-theme";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface PwaState {
  install: InstallEvent | null;
  waiting: ServiceWorker | null;
  offline: boolean;
  ios: boolean;
  installed: boolean;
}
interface PwaContextValue extends PwaState {
  busy: boolean;
  error: boolean;
  requestInstall(): Promise<void>;
}
const PwaContext = createContext<PwaContextValue>({
  install: null,
  waiting: null,
  offline: false,
  ios: false,
  installed: false,
  busy: false,
  error: false,
  async requestInstall() {},
});

export function PwaProvider({ children }: { children: ReactNode }) {
  const { locale } = useLangue();
  const [state, setState] = useState<PwaState>({
    install: null,
    waiting: null,
    offline: false,
    ios: false,
    installed: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const installLock = useRef(false);
  const requestInstall = async () => {
    const install = state.install;
    if (!install || installLock.current) return;
    installLock.current = true;
    setBusy(true);
    setError(false);
    try {
      await install.prompt();
      await install.userChoice;
    } catch {
      setError(true);
    } finally {
      installLock.current = false;
      setBusy(false);
      // A browser install event can be prompted only once across shell surfaces.
      setState((current) => ({
        ...current,
        install: current.install === install ? null : current.install,
      }));
    }
  };
  useEffect(() => {
    if (isTauri()) {
      setState((current) => ({ ...current, installed: true }));
      return;
    }
    // The offline worker can serve stale App Router chunks during local HMR and
    // make Next replace a page repeatedly. Keep PWA caching out of development
    // and remove any worker previously registered on this local origin.
    if (process.env.NODE_ENV === "development") {
      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((item) => item.unregister())))
          .catch(() => {});
      }
      return;
    }
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
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
    const installed = () =>
      setState((current) => ({ ...current, install: null, ios: false, installed: true }));
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
      installed: standalone,
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
          if (!disposed)
            active.active?.postMessage({
              type: "DBFR_LOCALE",
              locale,
              theme: resolveEpisodeTheme(document.documentElement.dataset.episodeTheme),
            });
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
    if (manifest)
      manifest.href = `/manifest.webmanifest?lang=${locale}&theme=${resolveEpisodeTheme(document.documentElement.dataset.episodeTheme)}`;
  }, [locale]);
  return (
    <PwaContext.Provider value={{ ...state, busy, error, requestInstall }}>
      {children}
    </PwaContext.Provider>
  );
}

export function PwaControls({ variant = "status" }: { variant?: "status" | "icon" }) {
  const { locale } = useLangue();
  const t = pwaText(locale);
  const { install, waiting, offline, ios, busy, error, requestInstall, installed } =
    useContext(PwaContext);
  const root = useRef<HTMLDivElement>(null);
  const instructions = useRef<HTMLDetailsElement>(null);
  const promptedHere = useRef(false);
  useEffect(() => {
    if (!install && promptedHere.current) {
      promptedHere.current = false;
      root.current?.querySelector<HTMLElement>("summary")?.focus();
    }
  }, [install]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        instructions.current?.open &&
        event.target instanceof Node &&
        !instructions.current.contains(event.target)
      )
        instructions.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const style =
    "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60";
  return (
    <div
      ref={root}
      className={
        variant === "icon"
          ? "relative flex shrink-0 items-center gap-1"
          : "flex min-w-0 flex-wrap items-center gap-2 px-2 py-2"
      }
      data-pwa-controls
    >
      {offline && variant !== "icon" && (
        <output className="text-sm text-muted-foreground">{t.offline}</output>
      )}
      {!installed &&
        (install ? (
          <button
            className={style}
            disabled={busy}
            type="button"
            aria-label={busy ? t.installing : t.install}
            title={busy ? t.installing : t.install}
            data-pwa-install
            onClick={() => {
              promptedHere.current = true;
              void requestInstall();
            }}
          >
            <InstallDesktopIcon />
          </button>
        ) : (
          <details
            ref={instructions}
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape" && instructions.current?.open) {
                event.preventDefault();
                instructions.current.open = false;
                instructions.current.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              className={`${style} list-none cursor-pointer [&::-webkit-details-marker]:hidden`}
              aria-label={ios ? t.iosInstall : t.install}
              title={ios ? t.iosInstall : t.install}
            >
              <InstallDesktopIcon />
            </summary>
            <p
              className={`absolute top-full ${variant === "icon" ? "right-0" : "left-0"} z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-3 text-sm leading-relaxed text-popover-foreground shadow-lg`}
            >
              {error ? `${t.installError} ` : ""}
              {ios ? t.iosHint : t.manualHint}
            </p>
          </details>
        ))}
      {waiting && (
        <button
          className={style}
          type="button"
          aria-label={t.update}
          title={t.update}
          onClick={() => {
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
              once: true,
            });
            waiting.postMessage({ type: "DBFR_ACTIVATE_UPDATE" });
          }}
        >
          <Rafraichir size={24} />
        </button>
      )}
      {error && variant !== "icon" && (
        <output role="status" className="text-sm text-muted-foreground">
          {t.installError}
        </output>
      )}
      {error && variant === "icon" && (
        <span role="status" className="sr-only">
          {t.installError}
        </span>
      )}
    </div>
  );
}
