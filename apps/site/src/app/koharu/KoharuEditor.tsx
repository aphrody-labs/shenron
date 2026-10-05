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
import type { LocalHealthResponse } from "@shenron/api/contract";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

const KoharuDesktop = dynamic(() => import("./KoharuDesktop"), { ssr: false });

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

export function KoharuEditor({ fallback }: { fallback: ReactNode }) {
  // The server and the hydration pass render the presentation; the client snapshot then
  // switches to the editor inside Tauri. Being in Tauri never changes during a session.
  const desktop = useSyncExternalStore(noSubscription, isTauri, notDesktop);
  const [bridge, setBridge] = useState(false);

  useEffect(() => {
    if (desktop) return;
    const controller = new AbortController();
    void localEngine(controller.signal).then((available) => {
      if (available) setBridge(true);
    });
    return () => controller.abort();
  }, [desktop]);

  if (desktop) return <KoharuDesktop />;
  return bridge ? <KoharuDesktop embedded /> : fallback;
}
