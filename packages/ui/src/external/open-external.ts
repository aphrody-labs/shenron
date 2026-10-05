// SPDX-License-Identifier: Apache-2.0
/**
 * Ouverture externe — la seule porte vers l'extérieur du site et de l'application de bureau.
 *
 * Dans la fenêtre Tauri, `window.open` ou `target="_blank"` ouvriraient une WebView sans barre
 * d'adresse ni retour : l'URL est confiée au navigateur du système par `@aphrody/plugin-opener`.
 * Dans un navigateur, elle s'ouvre dans un nouvel onglet sans `opener` ni `referrer`.
 * Seuls `http:`, `https:` et `mailto:` passent : jamais `javascript:`, `data:` ni `file:`.
 *
 * Module pur (aucun React) : utilisable depuis un gestionnaire d'événement, un hook ou un
 * pont natif. Le composant `<ExternalLink>` est dans `./ExternalLink`.
 */
import { isTauri } from "../studio/tauri-bridge";

/** Schémas que l'on accepte de confier au système. */
export const EXTERNAL_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);

/** Où l'URL a été confiée : navigateur du système (Tauri), nouvel onglet, ou nulle part. */
export type OpenExternalResult = "native" | "browser" | "refused";

/** URL absolue au schéma autorisé, sinon `null` (relative, `javascript:`, malformée…). */
export function safeExternalUrl(href: string | URL): URL | null {
  try {
    const url = new URL(String(href).trim());
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Vrai pour une URL absolue sûre qui sort de l'origine courante (ou de `origin`). Une adresse
 * `mailto:` est toujours externe ; un chemin relatif ne l'est jamais.
 */
export function isExternalHref(href: string, origin?: string): boolean {
  const url = safeExternalUrl(href);
  if (!url) return false;
  if (url.protocol === "mailto:") return true;
  const here = origin ?? globalThis.location?.origin;
  return !here || url.origin !== here;
}

function openInBrowser(url: URL): boolean {
  if (url.protocol === "mailto:") {
    // Un `mailto:` ne navigue pas : il réveille le client de messagerie sans onglet vide.
    if (!globalThis.location) return false;
    globalThis.location.assign(url.href);
    return true;
  }
  if (typeof globalThis.open !== "function") return false;
  // `noopener` : `open` renvoie toujours null, l'onglet ouvert n'a aucune prise sur celui-ci.
  globalThis.open(url.href, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Ouvre `href` hors de l'application. Ne rejette jamais : un échec du pont natif (permission
 * absente dans une fenêtre distante, par exemple) retombe sur l'ouverture navigateur.
 */
export async function openExternal(href: string | URL): Promise<OpenExternalResult> {
  const url = safeExternalUrl(href);
  if (!url) return "refused";
  if (isTauri()) {
    try {
      // Chargé à la demande : la page servie au navigateur n'évalue jamais le pont natif.
      const { openUrl } = await import("@aphrody/plugin-opener");
      await openUrl(url.href);
      return "native";
    } catch {
      // Permission `opener:default` absente de cette fenêtre : la WebView reste le dernier recours.
    }
  }
  return openInBrowser(url) ? "browser" : "refused";
}
