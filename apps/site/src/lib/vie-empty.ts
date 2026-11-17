/**
 * États vides illustrés : une seule table décrit, pour chaque situation, la scène
 * décorative et les sorties proposées. Les textes vivent dans `messages/*.json`
 * (`vie.empty.<kind>.{title,description}`, `vie.cta.<key>`), jamais ici.
 */
import type { VieArtKind } from "@aphrody/shenron-ui/vie/VieArt";
import { DISCORD_INVITE } from "@/lib/config";

export const VIE_EMPTY_KINDS = ["warriors", "news", "shop"] as const;
export type VieEmptyKind = (typeof VIE_EMPTY_KINDS)[number];

export interface VieEmptyAction {
  /** Clé sous `vie.cta`. */
  cta: "readManga" | "exploreWiki" | "joinDiscord" | "fullBoard" | "rate" | "clearSearch";
  href: string;
  external?: boolean;
}

export const VIE_EMPTY: Record<VieEmptyKind, { art: VieArtKind; actions: VieEmptyAction[] }> = {
  warriors: {
    art: "spheres",
    actions: [
      { cta: "joinDiscord", href: DISCORD_INVITE, external: true },
      { cta: "fullBoard", href: "/leaderboard" },
    ],
  },
  news: {
    art: "kinto",
    actions: [
      { cta: "readManga", href: "/wiki/manga" },
      { cta: "exploreWiki", href: "/wiki" },
    ],
  },
  shop: {
    art: "senzu",
    actions: [{ cta: "exploreWiki", href: "/wiki" }],
  },
};
