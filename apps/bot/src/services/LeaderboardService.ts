import { singleton, inject } from "tsyringe";
import type { Image } from "@napi-rs/canvas";
import { BackgroundCacheService } from "./BackgroundCacheService";
import { imageSourceFrom, renderLeaderboardCard, type RenderedCard } from "~/render";

export interface LeaderboardEntry {
  id: string;
  username: string;
  avatarURL: string;
  xp: number;
  zeni: number;
}

export interface LeaderboardMeta {
  title: string;
  subtitle?: string;
  page: number;
  totalPages: number;
  /** Membres classés au total (toutes pages) ; défaut : lignes de la page. */
  total?: number;
  /** Instant des données affichées ; défaut : maintenant. */
  generatedAt?: Date;
  /** Valeur classée : l'XP (défaut) ou les zéni. */
  metric?: "xp" | "zeni";
  /** Textes du pied de carte et de l'unité, localisés par l'appelant. */
  text?: Partial<LeaderboardCardText>;
  /** Langue des nombres (`fr`, `en`, `ja`). */
  locale?: string;
}

/**
 * Backgrounds in order of preference: the nebula image (not shipped to production), then a
 * built-in banner; when neither is on disk the canvas draws its gradient.
 */
const BG_CANDIDATES = [
  "assets/backgrounds/nebula/weighing-in-on-the-dumbbell-nebula.webp",
  "assets/banners/banner-02.jpg",
] as const;

/** Texts of the card footer; the French ones stand in until the callers pass the dictionaries. */
export interface LeaderboardCardText {
  page: (page: number, totalPages: number) => string;
  total: (count: number) => string;
  updated: (at: Date) => string;
  /** Unit printed after each value. */
  unit: string;
  site: string;
}

/** French footer texts used while the callers do not pass `meta.text` (to remove with lot L2). */
const LEGACY_TEXT: LeaderboardCardText = {
  page: (page, totalPages) => `Page ${page} / ${totalPages}`,
  total: (count) => `${count} combattants répertoriés`,
  updated: (at) =>
    `Mis à jour ${new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Europe/Paris",
    }).format(at)}`,
  unit: "XP",
  site: "dragonballfr.com",
};

@singleton()
export class LeaderboardService {
  constructor(@inject(BackgroundCacheService) private bgCache: BackgroundCacheService) {}

  private async loadBg(): Promise<Image | null> {
    const file = this.bgCache.firstAvailable(BG_CANDIDATES);
    return file ? this.bgCache.get(file) : null;
  }

  /**
   * Leaderboard card through the shared renderer (`~/render`): podium on the first page, list
   * of ten otherwise, ranks following `meta.page`. A missing background or avatar draws its
   * fallback and never throws.
   */
  async renderCard(entries: LeaderboardEntry[], meta: LeaderboardMeta): Promise<RenderedCard> {
    const text = { ...LEGACY_TEXT, ...meta.text };
    const background = this.bgCache.firstAvailable(BG_CANDIDATES);
    return renderLeaderboardCard(
      {
        entries: entries.slice(0, 10).map((entry) => ({
          id: entry.id,
          name: entry.username,
          avatarUrl: entry.avatarURL,
          value: meta.metric === "zeni" ? entry.zeni : entry.xp,
        })),
        firstRank: (meta.page - 1) * 10 + 1,
        podium: meta.page === 1,
        title: meta.title,
        subtitle: meta.subtitle,
        unit: text.unit,
        pageLabel: text.page(meta.page, meta.totalPages),
        totalLabel: text.total(meta.total ?? entries.length),
        updatedLabel: text.updated(meta.generatedAt ?? new Date()),
        site: text.site,
        backgrounds: background ? [background] : [],
      },
      { images: imageSourceFrom(this.bgCache), locale: meta.locale },
    );
  }

  /** Leaderboard card image (see `renderCard`). */
  async render(entries: LeaderboardEntry[], meta: LeaderboardMeta): Promise<Buffer> {
    return (await this.renderCard(entries, meta)).buffer;
  }
}
