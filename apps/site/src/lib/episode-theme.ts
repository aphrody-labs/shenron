// SPDX-License-Identifier: Apache-2.0
export type EpisodeTheme = "beerus" | "goku";
export const EPISODE_THEME_KEY = "shenron:episode-theme";
export function resolveEpisodeTheme(value: unknown): EpisodeTheme {
  return value === "goku" ? "goku" : "beerus";
}
export function applyEpisodeTheme(theme: EpisodeTheme) {
  document.documentElement.dataset.episodeTheme = theme;
  document.documentElement.classList.toggle("dark", theme === "beerus");
}
export const EPISODE_THEME_BOOT = `try{const t=localStorage.getItem('${EPISODE_THEME_KEY}')==='goku'?'goku':'beerus';document.documentElement.dataset.episodeTheme=t;document.documentElement.classList.toggle('dark',t==='beerus')}catch{}`;
