import fr from "../../messages/pwa/fr.json";
import en from "../../messages/pwa/en.json";
import ja from "../../messages/pwa/ja.json";
import palette from "@aphrody/shenron-ui/episode-theme-palette";
import { resolveEpisodeTheme, type EpisodeTheme } from "./episode-theme";

export { palette as pwaPalette, resolveEpisodeTheme as pwaTheme };

export type PwaLocale = "fr" | "en" | "ja";
export function pwaLocale(value: unknown): PwaLocale {
  return value === "en" || value === "ja" ? value : "fr";
}
export function pwaText(locale: unknown) {
  return { fr, en, ja }[pwaLocale(locale)];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!;
  });
}

/** A self-contained fallback needs neither Next chunks nor a working CDN. */
export function offlineDocument(locale: PwaLocale, theme: EpisodeTheme = "beerus"): string {
  const t = pwaText(locale);
  const c = palette[theme];
  return `<!doctype html><html lang="${locale}" data-episode-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="${c.background}"><title>${escapeHtml(t.offline)} · DBFR</title><style>
  :root{color-scheme:${theme === "beerus" ? "dark" : "light"};font-family:system-ui,sans-serif;background:${c.background};color:${c.foreground}}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;padding-bottom:max(24px,env(safe-area-inset-bottom))}main{max-width:36rem;width:100%}h1{font-size:clamp(1.5rem,5vw,2.25rem);line-height:1.2}p{line-height:1.65}nav{display:flex;gap:12px;flex-wrap:wrap}button,a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 18px;border:1px solid currentColor;border-radius:12px;font:inherit;text-decoration:none;color:inherit}button{background:${c.primary};color:${c.onPrimary};cursor:pointer;margin:12px 0 24px}a:focus-visible,button:focus-visible{outline:3px solid ${c.focus};outline-offset:4px}
  </style></head><body><main><p>Dragon Ball France</p><h1>${escapeHtml(t.offlineTitle)}</h1><p>${escapeHtml(t.offlineBody)}</p><button type="button" onclick="location.reload()">${escapeHtml(t.retry)}</button><nav aria-label="DBFR"><a href="/">${escapeHtml(t.home)}</a><a href="/wiki/manga">${escapeHtml(t.manga)}</a><a href="/wiki/episodes">${escapeHtml(t.episodes)}</a></nav></main></body></html>`;
}
