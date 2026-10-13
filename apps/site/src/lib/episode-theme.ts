// SPDX-License-Identifier: Apache-2.0
export type EpisodeTheme = "beerus" | "goku";
export const EPISODE_THEME_KEY = "shenron:episode-theme";
export function resolveEpisodeTheme(value: unknown): EpisodeTheme {
  return value === "goku" ? "goku" : "beerus";
}
export function applyEpisodeTheme(theme: EpisodeTheme) {
  document.documentElement.dataset.episodeTheme = theme;
  document.documentElement.classList.toggle("dark", theme === "beerus");
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--md-sys-color-background")
    .trim();
  if (background)
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme === "beerus" ? "dark" : "light");
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) {
    const url = new URL(manifest.href);
    url.searchParams.set("theme", theme);
    manifest.href = url.href;
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.controller?.postMessage({
      type: "DBFR_LOCALE",
      locale: document.documentElement.lang,
      theme,
    });
}
export const EPISODE_THEME_BOOT = `try{const t=localStorage.getItem('${EPISODE_THEME_KEY}')==='goku'?'goku':'beerus';document.documentElement.dataset.episodeTheme=t;document.documentElement.classList.toggle('dark',t==='beerus')}catch{}`;
