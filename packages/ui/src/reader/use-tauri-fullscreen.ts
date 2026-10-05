// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Plein écran Tauri : la fenêtre suit le plein écran DOM.
 *
 * Dans la WebView de bureau, `element.requestFullscreen()` n'agrandit l'élément qu'à la taille de
 * la fenêtre : barre de titre et bords restent là. Ce module fait suivre la fenêtre native
 * (`getCurrentWindow().setFullscreen`) quand un élément de la portée entre en plein écran DOM, et
 * la rend à son état quand il en sort. Une fenêtre déjà en plein écran (F11, système) n'est
 * jamais rétablie par nous. Sans la permission `core:window:allow-set-fullscreen`, ou hors de
 * Tauri, tout reste silencieux : le plein écran DOM continue de fonctionner seul.
 */
import { type RefObject, useEffect } from "react";
import { isTauri } from "../studio/tauri-bridge";

/**
 * Met la fenêtre Tauri courante en plein écran (ou l'en sort). Résout `false` hors de Tauri ou
 * si l'appel natif est refusé ; ne rejette jamais.
 */
export async function setTauriWindowFullscreen(fullscreen: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@aphrody/api/window");
    await getCurrentWindow().setFullscreen(fullscreen);
    return true;
  } catch {
    return false;
  }
}

/** La fenêtre Tauri courante est-elle déjà en plein écran ? `false` en cas de doute. */
export async function isTauriWindowFullscreen(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWindow } = await import("@aphrody/api/window");
    return await getCurrentWindow().isFullscreen();
  } catch {
    return false;
  }
}

function inScope(scope: RefObject<HTMLElement | null> | undefined, element: Element | null) {
  if (!element) return false;
  if (!scope) return true;
  const root = scope.current;
  return Boolean(root && (root === element || root.contains(element)));
}

/**
 * Fait suivre la fenêtre Tauri au plein écran DOM des éléments de `scope` (de tout le document
 * sans portée). Inerte dans un navigateur.
 */
export function useTauriFullscreen(scope?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!isTauri() || typeof document === "undefined") return;
    // Vrai quand c'est nous qui avons mis la fenêtre en plein écran.
    let owned = false;
    let disposed = false;
    const onChange = async () => {
      const element = document.fullscreenElement;
      if (element && inScope(scope, element)) {
        if (owned) return;
        if (await isTauriWindowFullscreen()) return;
        if (disposed) return;
        owned = await setTauriWindowFullscreen(true);
      } else if (!element && owned) {
        owned = false;
        await setTauriWindowFullscreen(false);
      }
    };
    const listener = () => void onChange();
    document.addEventListener("fullscreenchange", listener);
    return () => {
      disposed = true;
      document.removeEventListener("fullscreenchange", listener);
      if (owned) void setTauriWindowFullscreen(false);
    };
  }, [scope]);
}

/**
 * Montage déclaratif de `useTauriFullscreen` sans portée, pour un shell qui veut que tout
 * plein écran DOM (lecteurs, vidéos) prenne la fenêtre entière sous Tauri.
 */
export function TauriFullscreenSync(): null {
  useTauriFullscreen();
  return null;
}
