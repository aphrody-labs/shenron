// SPDX-License-Identifier: Apache-2.0
export type EpisodeTheme = "neutral" | "beerus" | "goku";
export const EPISODE_THEME_KEY = "shenron:episode-theme";
export function resolveEpisodeTheme(value: unknown): EpisodeTheme {
  return value === "goku" || value === "beerus" ? value : "neutral";
}
export function applyEpisodeTheme(theme: EpisodeTheme) {
  document.documentElement.dataset.episodeTheme = theme;
  document.documentElement.classList.toggle("dark", theme !== "goku");
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--md-sys-color-background")
    .trim();
  if (background)
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme !== "goku" ? "dark" : "light");
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const manifestHref = manifest?.getAttribute("href");
  if (manifest && manifestHref) {
    try {
      const url = new URL(manifestHref, document.baseURI);
      url.searchParams.set("theme", theme);
      manifest.setAttribute("href", url.href);
    } catch {
      // An optional malformed manifest must not interrupt the page's theme hydration.
    }
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.controller?.postMessage({
      type: "DBFR_LOCALE",
      locale: document.documentElement.lang,
      theme,
    });
}
export const EPISODE_THEME_BOOT = `try{const v=localStorage.getItem('${EPISODE_THEME_KEY}');const t=v==='goku'||v==='beerus'?v:'neutral';document.documentElement.dataset.episodeTheme=t;document.documentElement.classList.toggle('dark',t!=='goku')}catch{}`;
