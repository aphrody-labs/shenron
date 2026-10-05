// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * The Koharu editor runs on the desktop app's in-process engine (Tauri IPC). Outside the
 * desktop app the server-rendered presentation (`fallback`) stays in place: it is also what
 * the first paint shows, and the editor bundle is only fetched once Tauri is detected.
 */
import dynamic from "next/dynamic";
import { type ReactNode, useSyncExternalStore } from "react";
import { isTauri } from "@shenron/ui/studio/tauri-bridge";

const KoharuDesktop = dynamic(() => import("./KoharuDesktop"), { ssr: false });

const noSubscription = () => () => {};
const notDesktop = () => false;

export function KoharuEditor({ fallback }: { fallback: ReactNode }) {
  // The server and the hydration pass render the presentation; the client snapshot then
  // switches to the editor inside Tauri. Being in Tauri never changes during a session.
  const desktop = useSyncExternalStore(noSubscription, isTauri, notDesktop);
  return desktop ? <KoharuDesktop /> : fallback;
}
