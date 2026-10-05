// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Liens sortants — la seule porte vers l'extérieur du site et de l'application de bureau.
 *
 * Dans un navigateur, un lien externe s'ouvre dans un nouvel onglet. Dans la fenêtre Tauri,
 * `target="_blank"` ouvrirait une fenêtre WebView sans barre d'adresse ni retour : on passe
 * par `@aphrody/plugin-opener`, qui confie l'URL au navigateur du système. Les pages ne
 * branchent jamais `window.open` ni `target="_blank"` elles-mêmes (contrat du shell).
 */
import type { MouseEvent, ReactNode } from "react";
import { isTauri } from "../studio/tauri-bridge";

/** Schémas que l'on accepte de confier au système (jamais `javascript:` ni `file:`). */
const SAFE_SCHEME = /^(https?:|mailto:)/i;

export function isExternalHref(href: string): boolean {
  return SAFE_SCHEME.test(href.trim());
}

/** Ouvre une URL externe : navigateur du système sous Tauri, nouvel onglet ailleurs. */
export async function openExternal(url: string): Promise<void> {
  const target = url.trim();
  if (!SAFE_SCHEME.test(target)) throw new Error(`URL externe refusée : ${target}`);
  if (isTauri()) {
    const { openUrl } = await import("@aphrody/plugin-opener");
    await openUrl(target);
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

/**
 * `<a>` sortant : garde un vrai `href` (clic milieu, copie du lien, aperçu au survol) et,
 * sous Tauri, intercepte le clic pour l'ouvrir dans le navigateur du système.
 */
export function ExternalLink({
  href,
  children,
  className,
  title,
  "aria-label": ariaLabel,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  title?: string;
  "aria-label"?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauri() || event.defaultPrevented || event.button !== 0) return;
    event.preventDefault();
    void openExternal(href).catch(() => undefined);
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
