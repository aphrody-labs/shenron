"use client";
import { useEffect, useState } from "react";
import { Etoile } from "@aphrody/shenron-ui/toriyama/MotifsCouverture";
import { useVideoUIText } from "@/lib/video-ui-text";
import {
  EPISODE_THEME_KEY,
  applyEpisodeTheme,
  resolveEpisodeTheme,
  type EpisodeTheme,
} from "@/lib/episode-theme";

export function EpisodeThemeSwitcher() {
  const t = useVideoUIText();
  const [theme, setTheme] = useState<EpisodeTheme>("beerus");
  useEffect(() => {
    const current = resolveEpisodeTheme(document.documentElement.dataset.episodeTheme);
    setTheme(current);
    applyEpisodeTheme(current);
    const sync = (event: StorageEvent) => {
      if (event.key !== EPISODE_THEME_KEY) return;
      const next = resolveEpisodeTheme(event.newValue);
      setTheme(next);
      applyEpisodeTheme(next);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <label className="shenron-theme-choice">
      <Etoile taille={18} decorative />
      <span className="sr-only">{t("themeChoice")}</span>
      <select
        value={theme}
        onChange={(event) => {
          const next = resolveEpisodeTheme(event.target.value);
          setTheme(next);
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
