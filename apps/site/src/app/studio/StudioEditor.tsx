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
import { useLangue } from "@/lib/i18n/client";

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
  const [bridge, setBridge] = useState(false);
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    if (desktop) return;
    const controller = new AbortController();
    void localEngine(controller.signal).then((available) => {
      if (available) setBridge(true);
      return undefined;
    });
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

  const active = desktop || bridge;
  useEffect(() => {
    // The editor is about to open: stream and compile its canvas module meanwhile.
    if (!active) return;
    void import("@aphrody/shenron-ui/koharu")
      .then((editor) => editor.preloadCanvasModule())
      .catch(() => undefined);
  }, [active]);

  if (desktop && linked !== true) return <DesktopAuthGate />;
  if (desktop) return <StudioDesktop />;
  return bridge ? <StudioDesktop embedded /> : fallback;
}

function DesktopAuthGate() {
  const t = useTranslations("library.studio");
  const { dico } = useLangue();
  const [loading, setLoading] = useState(false);
  async function signIn() {
    setLoading(true);
    try {
      await fetch("/api/local/agent-home/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ open: true }),
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-dbz-bg px-6 text-white">
      <section className="max-w-xl space-y-5 rounded-2xl border border-dbz-orange/30 bg-dbz-card/80 p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-white/75">{t("desktopText")}</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void signIn()}
          className="min-h-11 rounded-xl bg-dbz-orange px-6 font-display font-bold text-black disabled:opacity-60"
        >
          {loading ? t("desktopTitle") : dico.common.signInDiscord}
        </button>
      </section>
    </main>
  );
}
