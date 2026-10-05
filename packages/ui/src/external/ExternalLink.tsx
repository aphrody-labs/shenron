// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * `<ExternalLink>` et `<ExternalLinkBridge>` — les liens sortants, navigateur et Tauri.
 *
 * Le lien garde un vrai `href` (clic milieu, copie du lien, aperçu de l'URL) et un
 * `target="_blank"` sûr dans un navigateur ; sous Tauri, le clic est intercepté et confié au
 * navigateur du système par `openExternal`. Un schéma refusé (`javascript:`…) ne rend pas de
 * lien du tout.
 *
 * `ExternalLinkBridge`, monté une fois par le shell, applique la même règle aux liens hérités
 * (`<a target="_blank">` écrits à la main, contenu Markdown) sans toucher à chaque page.
 */
import { type ComponentPropsWithoutRef, type MouseEvent, type ReactNode, useEffect } from "react";
import { isTauri } from "../studio/tauri-bridge";
import { isExternalHref, openExternal, safeExternalUrl } from "./open-external";

export type ExternalLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href" | "target"> & {
  href: string;
  children: ReactNode;
  /** Texte réservé aux lecteurs d'écran, par exemple « (nouvel onglet) ». */
  newTabHint?: ReactNode;
};

const BASE_REL = ["noopener", "noreferrer"];

function mergeRel(rel: string | undefined): string {
  const parts = new Set([...BASE_REL, ...(rel ?? "").split(/\s+/).filter(Boolean)]);
  return [...parts].join(" ");
}

/** Clic gauche ou milieu sous Tauri : jamais de WebView orpheline. */
function routeNatively(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  if (event.defaultPrevented || event.button > 1 || !isTauri()) return;
  event.preventDefault();
  void openExternal(href);
}

export function ExternalLink({
  href,
  children,
  rel,
  newTabHint,
  onClick,
  onAuxClick,
  ...props
}: ExternalLinkProps) {
  if (!safeExternalUrl(href)) {
    return <span className={props.className}>{children}</span>;
  }
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel={mergeRel(rel)}
      onClick={(event) => {
        onClick?.(event);
        routeNatively(event, href);
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        routeNatively(event, href);
      }}
    >
      {children}
      {newTabHint ? <span className="sr-only">{newTabHint}</span> : null}
    </a>
  );
}

/** Ancre concernée par un clic, ou `null` si le clic doit suivre son cours. */
export function externalAnchorOf(
  target: EventTarget | null,
  origin: string,
): HTMLAnchorElement | null {
  const element = target instanceof Element ? target : null;
  const anchor = element?.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return null;
  const href = anchor.getAttribute("href") ?? "";
  const leavesApp = isExternalHref(anchor.href || href, origin);
  return leavesApp || anchor.target === "_blank" ? anchor : null;
}

/**
 * Sous Tauri, capte au niveau du document tout clic vers l'extérieur (ou vers un
 * `target="_blank"`) et le confie à `openExternal`. Ne rend rien ; inerte dans un navigateur.
 */
export function ExternalLinkBridge() {
  useEffect(() => {
    if (!isTauri()) return;
    const onClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button > 1) return;
      const anchor = externalAnchorOf(event.target, globalThis.location.origin);
      if (!anchor) return;
      const url = safeExternalUrl(anchor.href);
      event.preventDefault();
      if (url) void openExternal(url);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);
  return null;
}
