/* oxlint-disable react/set-state-in-effect -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Contrôles de fenêtre de l'application de bureau (Tauri 3, `@aphrody/api/window`).
 *
 * Rendus seulement quand la fenêtre n'a PAS de décoration native : sinon on doublerait les
 * boutons du système. Le module Tauri est chargé à la demande, jamais dans un navigateur.
 * Permissions attendues côté hôte : `core:window:allow-minimize`, `allow-toggle-maximize`,
 * `allow-close`, `allow-start-dragging` (poignée `data-tauri-drag-region`).
 */
import { useEffect, useState, type ReactNode } from "react";
import type { ShellLabels } from "./AppShell";

type TauriWindow = Awaited<ReturnType<typeof currentWindow>>;

async function currentWindow() {
  const { getCurrentWindow } = await import("@aphrody/api/window");
  return getCurrentWindow();
}

/** `true` quand on est dans Tauri ET que la fenêtre est sans décoration native. */
export function useUndecoratedWindow(tauri: boolean): boolean {
  const [undecorated, setUndecorated] = useState(false);
  useEffect(() => {
    if (!tauri) {
      setUndecorated(false);
      return;
    }
    let alive = true;
    void currentWindow()
      .then((window) => window.isDecorated())
      .then((decorated) => {
        if (alive) setUndecorated(!decorated);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tauri]);
  return undecorated;
}

export function WindowControls({ labels }: { labels: ShellLabels }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    void currentWindow()
      .then(async (window: TauriWindow) => {
        const sync = () =>
          void window.isMaximized().then((value) => {
            if (alive) setMaximized(value);
            return undefined;
          });
        sync();
        const unlisten = await window.onResized(sync);
        if (alive) stop = unlisten;
        else unlisten();
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  const run = (action: (window: TauriWindow) => Promise<void>) => () =>
    void currentWindow()
      .then(action)
      .catch(() => undefined);

  return (
    <div className="-my-px -mr-[max(env(safe-area-inset-right),0.5rem)] ml-1 flex h-14 shrink-0 self-stretch">
      <WindowButton label={labels.windowMinimize} onClick={run((w) => w.minimize())}>
        <path d="M5 12h14" />
      </WindowButton>
      <WindowButton
        label={maximized ? labels.windowRestore : labels.windowMaximize}
        onClick={run(async (w) => {
          await w.toggleMaximize();
          setMaximized(await w.isMaximized());
        })}
      >
        {maximized ? (
          <>
            <rect x="5" y="8" width="11" height="11" />
            <path d="M8 8V5h11v11h-3" />
          </>
        ) : (
          <rect x="5" y="5" width="14" height="14" />
        )}
      </WindowButton>
      <WindowButton label={labels.windowClose} danger onClick={run((w) => w.close())}>
        <path d="M6 6l12 12M18 6L6 18" />
      </WindowButton>
    </div>
  );
}

function WindowButton({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid w-12 place-items-center text-os/65 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kinto-lumiere ${
        danger ? "hover:bg-dbz-red hover:text-os" : "hover:bg-os/[0.08] hover:text-os"
      }`}
    >
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        {children}
      </svg>
    </button>
  );
}
