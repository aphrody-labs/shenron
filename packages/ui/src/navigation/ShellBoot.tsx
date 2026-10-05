// SPDX-License-Identifier: Apache-2.0
/**
 * Amorce du shell, à poser dans le `<head>` du layout racine (composant serveur, sans état).
 *
 * Elle applique les préférences d'affichage AVANT la première peinture : barre latérale
 * repliée (`html[data-shell-sidebar=collapsed]`) et fenêtre Tauri (`html[data-tauri]`). Sans
 * elle, la barre s'afficherait dépliée puis se replierait à l'hydratation. Aucune donnée de
 * session : le HTML reste identique pour tous, donc cacheable.
 */

export const SHELL_SIDEBAR_KEY = "shenron:shell-sidebar";
export const SHELL_SIDEBAR_ATTR = "data-shell-sidebar";

export const SHELL_BOOT_SCRIPT = [
  "try{",
  `if(localStorage.getItem(${JSON.stringify(SHELL_SIDEBAR_KEY)})==="collapsed")`,
  `document.documentElement.setAttribute(${JSON.stringify(SHELL_SIDEBAR_ATTR)},"collapsed");`,
  "}catch(e){}",
  "if(window.__TAURI_INTERNALS__)document.documentElement.setAttribute('data-tauri','');",
].join("");

export function ShellBoot() {
  return <script dangerouslySetInnerHTML={{ __html: SHELL_BOOT_SCRIPT }} />;
}
