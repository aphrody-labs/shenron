// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * The studio runs on the desktop app's Studio commands (Tauri IPC). Outside the desktop app the
 * server-rendered presentation (`fallback`) stays in place: it is also what the first paint
 * shows, and the studio bundle is only fetched once Tauri is detected.
 */
import dynamic from "next/dynamic";
import { type ReactNode, useSyncExternalStore } from "react";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

const StudioDesktop = dynamic(() => import("./StudioDesktop"), { ssr: false });

const noSubscription = () => () => {};
const notDesktop = () => false;

export function StudioScreen({ fallback }: { fallback: ReactNode }) {
  // The server and the hydration pass render the presentation; the client snapshot then
  // switches to the studio inside Tauri. Being in Tauri never changes during a session.
  const desktop = useSyncExternalStore(noSubscription, isTauri, notDesktop);
  return desktop ? <StudioDesktop /> : fallback;
}
