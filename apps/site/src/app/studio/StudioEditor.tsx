// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * The manga translation editor runs wherever its engine is local:
 *
 * - in Shenron Studio (Tauri), on the engine of the app process (Tauri IPC);
 * - in a browser on a site served by `shenron-server`, when `/api/local/health` reports the
 *   `koharu` group: the engine is a `koharu-sdk` child reached through `/api/local/koharu`.
 *
 * Elsewhere (dragonballfr.com) the server-rendered presentation (`fallback`) stays: it is also
 * what the first paint shows, and the editor bundle is only fetched once an engine is found.
 */
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { LocalHealthResponse } from "@aphrody/shenron-api/contract";
import { isTauri } from "@aphrody/shenron-ui/studio/tauri-bridge";

const StudioDesktop = dynamic(() => import("./StudioDesktop"), { ssr: false });

/** `LOCAL_HEALTH_PATH` of the contract (a type import keeps zod out of this bundle). */
const LOCAL_HEALTH_PATH = "/api/local/health";

const noSubscription = () => () => {};
const notDesktop = () => false;

/** `true` when the serving `shenron-server` has the editor engine (one probe per page). */
async function localEngine(signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(LOCAL_HEALTH_PATH, { cache: "no-store", signal });
    if (!response.ok && response.status !== 503) return false;
    const health = (await response.json()) as Partial<LocalHealthResponse>;
    return health.service === "shenron-server" && health.groups?.koharu?.available === true;
  } catch {
    return false;
  }
}

export function StudioEditor({ fallback }: { fallback: ReactNode }) {
  // The server and the hydration pass render the presentation; the client snapshot then
  // switches to the editor inside Tauri. Being in Tauri never changes during a session.
  const desktop = useSyncExternalStore(noSubscription, isTauri, notDesktop);
  const [bridge, setBridge] = useState<"local" | "hosted" | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  useEffect(() => {
    if (desktop) return;
    const controller = new AbortController();
    void localEngine(controller.signal)
      .then(async (available) => {
        if (controller.signal.aborted) return;
        if (available) {
          setBridge("local");
          return;
        }
        const response = await fetch("/api/studio/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || (await response.json()).available !== true || controller.signal.aborted)
          return;
        const transport = await import("@aphrody/shenron-koharu/transport");
        if (controller.signal.aborted) return;
        transport.configureKoharuBridge("/api/studio", true);
        setBridge("hosted");
        return undefined;
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    const controller = new AbortController();
    void fetch("/api/local/agent-home", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((home: { signedIn?: boolean } | null) => setLinked(home?.signedIn === true))
      .catch(() => setLinked(false));
    return () => controller.abort();
  }, [desktop]);

  useEffect(() => {
    if (!desktop || !loginPending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkLink = async () => {
      try {
        const response = await fetch("/api/local/agent-home", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const home = (await response.json()) as { signedIn?: boolean };
          if (home.signedIn === true) {
            setLinked(true);
            setLoginPending(false);
            return;
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (!controller.signal.aborted) timer = setTimeout(checkLink, 1_000);
    };
    void checkLink();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [desktop, loginPending]);

  const active = desktop || bridge;
  useEffect(() => {
    // The editor is about to open: stream and compile its canvas module meanwhile.
    if (!active) return;
    void import("@aphrody/shenron-ui/koharu")
      .then((editor) => editor.preloadCanvasModule())
      .catch(() => undefined);
  }, [active]);

  if (desktop && linked !== true)
    return <DesktopAuthGate pending={loginPending} onPendingChange={setLoginPending} />;
  if (desktop) return <StudioDesktop />;
  return bridge ? <StudioDesktop embedded /> : fallback;
}

function DesktopAuthGate({
  pending,
  onPendingChange,
}: {
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useTranslations("library.studio");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  async function signIn() {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/local/agent-home/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ open: true }),
      });
      if (!response.ok) throw new Error("Desktop account linking failed");
      onPendingChange(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-dbz-bg px-6 text-white">
      <section className="max-w-xl space-y-5 rounded-2xl border border-dbz-orange/30 bg-dbz-card/80 p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-white/75">{t("desktopText")}</p>
        {pending ? <output aria-live="polite">{t("desktopAuthWaiting")}</output> : null}
        {error ? <p role="alert">{t("desktopAuthError")}</p> : null}
        <button
          type="button"
          disabled={loading}
          onClick={() => void signIn()}
          className="min-h-11 rounded-xl bg-dbz-orange px-6 font-display font-bold text-black disabled:opacity-60"
        >
          {loading
            ? t("desktopAuthOpening")
            : pending
              ? t("desktopAuthRetry")
              : t("desktopAuthButton")}
        </button>
      </section>
    </main>
  );
}
