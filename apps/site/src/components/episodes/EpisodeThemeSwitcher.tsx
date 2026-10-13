"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Etoile } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";
import { Palette } from "@aphrody/shenron-ui/icones";
import { useVideoUIText } from "@/lib/video-ui-text";
import {
  EPISODE_THEME_KEY,
  applyEpisodeTheme,
  resolveEpisodeTheme,
  type EpisodeTheme,
} from "@/lib/episode-theme";

function themeSnapshot() {
  return resolveEpisodeTheme(document.documentElement.dataset.episodeTheme);
}
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-episode-theme"],
  });
  const sync = (event: StorageEvent) => {
    if (event.key === EPISODE_THEME_KEY) applyEpisodeTheme(resolveEpisodeTheme(event.newValue));
  };
  window.addEventListener("storage", sync);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", sync);
  };
}
const serverTheme = (): EpisodeTheme => "beerus";

export function EpisodeThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useVideoUIText();
  const theme = useSyncExternalStore(subscribeTheme, themeSnapshot, serverTheme);
  useEffect(() => {
    applyEpisodeTheme(theme);
  }, [theme]);
  return (
    <label
      className={`shenron-theme-choice ${compact ? "is-compact" : ""}`}
      title={t("themeChoice")}
    >
      {compact ? <Palette size={22} /> : <Etoile taille={18} decorative />}
      <span className="sr-only">{t("themeChoice")}</span>
      <select
        aria-label={t("themeChoice")}
        value={theme}
        onChange={(event) => {
          const next = resolveEpisodeTheme(event.target.value);
          applyEpisodeTheme(next);
          try {
            localStorage.setItem(EPISODE_THEME_KEY, next);
          } catch {
            /* Session preference remains usable. */
          }
        }}
      >
        <option value="beerus">{t("themeBeerus")}</option>
        <option value="goku">{t("themeGoku")}</option>
      </select>
    </label>
  );
}
