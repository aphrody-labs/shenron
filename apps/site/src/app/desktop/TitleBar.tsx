// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Title bar of the frameless Shenron Studio window: brand, drag region (Tauri's
 * `data-tauri-drag-region`, double-click maximizes) and the window buttons through the
 * window plugin. Renders nothing in a plain browser.
 */
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { DragonBall } from "@shenron/ui/toriyama";
import { isTauri, tauriInvoke } from "@shenron/ui/studio/tauri-bridge";

type WindowAction = "minimize" | "toggle_maximize" | "close";

function windowCommand(action: WindowAction): void {
  void tauriInvoke(`plugin:window|${action}`, { label: "main" }).catch(() => undefined);
}

const noSubscription = () => () => undefined;
const notNative = () => false;

export function TitleBar() {
  const t = useTranslations("desktop.titleBar");
  // Server render and hydration: no title bar; the client then reads the Tauri globals.
  const native = useSyncExternalStore(noSubscription, isTauri, notNative);
  if (!native) return null;
  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <span className="desktop-titlebar__brand" data-tauri-drag-region>
        <img src="/dbz/marque/emoji-128.png" alt="" width={20} height={20} data-tauri-drag-region />
        <span data-tauri-drag-region>{t("title")}</span>
        <DragonBall stars={4} size={14} decorative />
      </span>
      <span className="desktop-titlebar__buttons">
        <button type="button" aria-label={t("minimize")} onClick={() => windowCommand("minimize")}>
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 5h8" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={t("maximize")}
          onClick={() => windowCommand("toggle_maximize")}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1.5" y="1.5" width="7" height="7" />
          </svg>
        </button>
        <button
          type="button"
          className="desktop-titlebar__close"
          aria-label={t("close")}
          onClick={() => windowCommand("close")}
        >
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </span>
    </header>
  );
}
