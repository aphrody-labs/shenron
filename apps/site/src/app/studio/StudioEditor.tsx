// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * The manga translation editor runs wherever its engine is local:
 *
 * - in Shenron Studio (Tauri), on the engine of the app process (Tauri IPC);
 * - in a browser on a site served by `shenron-server`, when `/api/local/health` reports the
 *   `koharu` group: the engine is a `koharu-sdk` child reached through `/api/local/koharu`.
 *
 * - on the public site, an authenticated account owns an isolated engine through `/api/studio`.
 * The first paint shows the presentation; the editor is fetched once an engine is available.
 */
import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { LocalHealthResponse } from "@aphrody/shenron-api/contract";
import { isTauri } from "@aphrody/shenron-ui/studio/tauri-bridge";
import { SignInDiscord } from "@/components/SignInDiscord";
import { ShenronWebStudio, type StudioSource } from "@/components/studio/ShenronWebStudio";

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

export function StudioEditor({
  fallback,
  source = null,
}: {
  fallback: ReactNode;
  source?: StudioSource | null;
}) {
  // The server and the hydration pass render the presentation; the client snapshot then
  // switches to the editor inside Tauri. Being in Tauri never changes during a session.
  const desktop = useSyncExternalStore(noSubscription, isTauri, notDesktop);
  const [bridge, setBridge] = useState<"local" | "hosted" | null>(null);
  const [linked, setLinked] = useState<boolean | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [webStatus, setWebStatus] = useState<"signIn" | "unavailable" | null>(null);

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
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setWebStatus("signIn");
          return;
        }
        if (!response.ok || (await response.json()).available !== true) {
          setWebStatus("unavailable");
          return;
        }
        const transport = await import("@aphrody/shenron-koharu/transport");
        if (controller.signal.aborted) return;
        transport.configureKoharuBridge("/api/studio", true);
        setBridge("hosted");
        return undefined;
      })
      .catch(() => {
        if (!controller.signal.aborted) setWebStatus("unavailable");
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
  return bridge ? (
    <StudioDesktop embedded />
  ) : (
    <div className="flex flex-col gap-6">
      <ShenronWebStudio source={source} />
      {webStatus && <WebAccess status={webStatus} />}
      {fallback}
    </div>
  );
}

function WebAccess({ status }: { status: "signIn" | "unavailable" }) {
  const t = useTranslations("library.studio");
  const returnPath =
    typeof window === "undefined" ? "/studio" : window.location.pathname + window.location.search;
  return (
    <section className="mx-auto my-6 w-[calc(100%-2rem)] max-w-6xl rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-lg font-semibold">{t("webTitle")}</h2>
      <p
        role={status === "unavailable" ? "status" : undefined}
        className="mt-2 text-sm text-muted-foreground"
      >
        {t(status === "signIn" ? "webText" : "webUnavailable")}
      </p>
      {status === "signIn" && (
        <SignInDiscord
          callbackURL={returnPath}
          className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
        >
          {t("webSignIn")}
        </SignInDiscord>
      )}
    </section>
  );
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
