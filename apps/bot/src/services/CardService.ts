import { singleton, inject } from "tsyringe";
import { BackgroundCacheService } from "./BackgroundCacheService";
import type { User } from "discord.js";
import { logger } from "~/lib/logger";
import { xpProgress } from "~/lib/xp";
import { DatabaseService } from "~/db/index";
import { cardThemes } from "~/db/schema";
import { container } from "tsyringe";
import {
  imageSourceFrom,
  renderProfileCard,
  withExtensions,
  type ProfileCardInput,
  type ProfileCardLabels,
  type RenderedCard,
} from "~/render";

interface CardTheme {
  name: string;
  accent: string; // couleur principale (ring, highlights)
  aura: string; // couleur de l'aura avatar + barre XP
  bgGrad: readonly [string, string, string]; // dégradé de fond si pas d'image
  bgFile?: string; // chemin relatif (assets/banners|backgrounds/...) — overlay obscurci en top
  textShadow: string;
  overlayOpacity?: number; // assombrissement de l'image de fond (0-1), défaut 0.78
  tintStrength?: number; // teinte aura par-dessus le fond (0-1), défaut 0.08
  gradientAngle?: number; // angle du dégradé sans image (deg), défaut 135
}

// Palettes calquées sur les couleurs officielles de l'anime/manga DBZ.
// Sources : brandpalettes.com pour le logo, schemecolor.com pour Goku/Vegeta.
const CARDS: Record<string, CardTheme> = {
  default: {
    name: "DB Classic",
    accent: "#F3E603",
    aura: "#D67711",
    bgGrad: ["#550000", "#D67711", "#1a0a00"],
    bgFile: "assets/banners/banner-17.jpg", // Goku enfant + Shenron
    textShadow: "rgba(0,0,0,0.8)",
  },
  goku: {
    name: "Goku",
    accent: "#F85B1A",
    aura: "#FA5A1E",
    bgGrad: ["#3b0d00", "#F85B1A", "#072083"],
    bgFile: "assets/banners/banner-08.jpg", // Goku SSJ Kamehameha
    textShadow: "rgba(7,32,131,0.8)",
  },
  vegeta: {
    name: "Vegeta",
    accent: "#2955DC",
    aura: "#4169E1",
    bgGrad: ["#0a0f3d", "#2955DC", "#181463"],
    bgFile: "assets/banners/banner-03.png", // Z Warriors (Vegeta)
    textShadow: "rgba(24,20,99,0.9)",
  },
  kaio: {
    name: "Kaio-ken",
    accent: "#FA0011",
    aura: "#FF3030",
    bgGrad: ["#4a0000", "#FA0011", "#1a0000"],
    bgFile: "assets/banners/banner-10.jpg", // Goku SSG (rouge) vs Beerus
    textShadow: "rgba(74,0,0,0.9)",
  },
  ssj: {
    name: "Super Saiyan",
    accent: "#F9EE54",
    aura: "#FFD700",
    bgGrad: ["#422006", "#F3A903", "#0f0800"],
    bgFile: "assets/banners/banner-04.jpg", // 5 SSJ ère Cell
    textShadow: "rgba(66,32,6,0.9)",
  },
  blue: {
    name: "Super Saiyan Blue",
    accent: "#00E5FF",
    aura: "#00B8FF",
    bgGrad: ["#001a3d", "#0369a1", "#00091f"],
    bgFile: "assets/banners/banner-15.jpg", // Vegito SSB
    textShadow: "rgba(0,26,61,0.9)",
  },
  rose: {
    name: "Super Saiyan Rosé",
    accent: "#FF4FB0",
    aura: "#FF1493",
    bgGrad: ["#3a0420", "#9d174d", "#0a0208"],
    bgFile: "assets/banners/banner-16.png", // Goku Black Rosé (miroir brisé)
    textShadow: "rgba(58,4,32,0.9)",
  },
  ultra: {
    name: "Ultra Instinct",
    accent: "#E5E9F0",
    aura: "#B4C4DD",
    bgGrad: ["#000814", "#475569", "#000000"],
    bgFile: "assets/banners/banner-02.jpg", // Goku silhouette UI arc-en-ciel
    textShadow: "rgba(0,8,20,0.95)",
  },
};

export interface CardInput {
  discordUser: User;
  xp: number;
  zeni: number;
  messageCount: number;
  cardKey?: string | null;
  bannerKey?: string | null;
  bannerPath?: string | null;
  badge?: string | null;
  title?: string | null;
  color?: string | null;
  fused?: boolean;
  rank?: number | null;
  /** Race and current transformation role, localized by the caller. */
  race?: ProfileCardInput["race"];
  tier?: ProfileCardInput["tier"];
  /** "1 200 XP to level 13", localized by the caller; `undefined` uses the French fallback. */
  progressLabel?: string | null;
  /** Card texts; the French ones below stand in until the callers pass the dictionaries. */
  labels?: Partial<ProfileCardLabels>;
  /** Locale of the figures (`fr`, `en`, `ja`). */
  locale?: string;
}

/** French card texts used while the callers do not pass `labels` (to remove with lot L2). */
const LEGACY_PROFILE_LABELS: ProfileCardLabels = {
  level: "Niveau",
  rank: "Rang",
  zeni: "Zéni",
  messages: "Messages",
  experience: "Expérience",
  power: "Niveau de ki",
  max: "MAX",
  fused: "Fusionné",
};

/**
 * French "XP left before the next level" line, from the same `xpProgress` as the gauge and
 * the level of the card, so the three always agree. `null` at the top level. Stands in until
 * the callers pass a localized `progressLabel` (to remove with lot L2).
 */
export function legacyProgressLabel(xp: number): string | null {
  const { next, remaining } = xpProgress(xp);
  if (!next) return null;
  return `${new Intl.NumberFormat("fr-FR").format(Math.ceil(remaining))} XP avant le niveau ${next.level}`;
}

@singleton()
export class CardService {
  // Cache thèmes DB — refresh 60s. Fallback CARDS hardcoded si DB inaccessible.
  private themesCache: Map<string, CardTheme> | null = null;
  private themesCacheAt = 0;
  /** Theme id → background path referenced by the catalog but absent from disk. */
  private readonly missing = new Map<string, string>();

  constructor(@inject(BackgroundCacheService) private bgs: BackgroundCacheService) {}

  /**
   * Retourne la map active des thèmes (DB > fallback CARDS hardcoded).
   * Cache TTL 60s — admin peut éditer via dashboard et voir le résultat
   * en max 1 minute (ou via /reload).
   */
  private async getThemes(): Promise<Map<string, CardTheme>> {
    const now = Date.now();
    if (this.themesCache && now - this.themesCacheAt < 60_000) {
      return this.themesCache;
    }
    const out = new Map<string, CardTheme>(Object.entries(CARDS));
    try {
      const dbs = container.resolve(DatabaseService);
      const rows = await dbs.db.select().from(cardThemes);
      for (const r of rows) {
        if (!r.enabled) continue;
        out.set(r.id, {
          name: r.name,
          accent: r.accent,
          aura: r.aura,
          bgGrad: [r.bgGrad1, r.bgGrad2, r.bgGrad3] as const,
          bgFile: r.bgFile ?? undefined,
          textShadow: r.textShadow,
          overlayOpacity: r.overlayOpacity,
          tintStrength: r.tintStrength,
          gradientAngle: r.gradientAngle,
        });
      }
    } catch (err) {
      logger.warn({ err }, "CardService.getThemes — fallback CARDS hardcoded");
    }
    for (const [id, theme] of out) out.set(id, this.withAvailableBackground(id, theme));
    this.themesCache = out;
    this.themesCacheAt = now;
    return out;
  }

  /**
   * A theme never references a background that is not on disk. The database rows seeded by
   * migration 0007 name NASA images (`assets/backgrounds/...`) that were never shipped: the
   * banner of the built-in theme of the same id replaces them, else the theme renders its
   * gradient. Reported once per theme and path, not on every 60 s refresh.
   */
  private withAvailableBackground(id: string, theme: CardTheme): CardTheme {
    const wanted = theme.bgFile;
    if (!wanted || this.bgs.exists(wanted)) {
      this.missing.delete(id);
      return theme;
    }
    const builtin = CARDS[id]?.bgFile;
    const fallback =
      builtin && builtin !== wanted && this.bgs.exists(builtin) ? builtin : undefined;
    if (this.missing.get(id) !== wanted) {
      this.missing.set(id, wanted);
      logger.warn(
        { theme: id, bgFile: wanted, fallback: fallback ?? null },
        "card theme background missing on disk, not used",
      );
    }
    return { ...theme, bgFile: fallback };
  }

  /** Themes whose configured background is absent from disk (diagnostics). */
  missingBackgrounds(): { theme: string; bgFile: string }[] {
    return [...this.missing].map(([theme, bgFile]) => ({ theme, bgFile }));
  }

  /** Invalide le cache thèmes (appelé par admin POST/PUT/DELETE card-themes). */
  invalidateThemes(): void {
    this.themesCache = null;
  }

  async resolveBannerPath(bannerKey: string): Promise<string | null> {
    if (!bannerKey) return null;
    if (bannerKey.startsWith("assets/banners/")) return bannerKey;
    if (bannerKey.startsWith("banner-")) return `assets/banners/${bannerKey}`;
    try {
      const dbs = container.resolve(DatabaseService);
      const item = await dbs.db.query.shopItems.findFirst({
        where: (s, { eq }) => eq(s.key, bannerKey),
      });
      if (item?.meta) {
        const parsed = JSON.parse(item.meta) as { bannerPath?: string };
        if (parsed.bannerPath) return parsed.bannerPath;
      }
    } catch {}
    return null;
  }

  async listCards(): Promise<string[]> {
    const themes = await this.getThemes();
    return [...themes.keys()];
  }

  async describeCard(key: string): Promise<CardTheme | undefined> {
    const themes = await this.getThemes();
    return themes.get(key);
  }

  /** Thème effectif d'une carte équipée (clé brute, préfixe `card_` ou inconnue → défaut). */
  async resolveTheme(cardKey: string | null | undefined): Promise<CardTheme> {
    const themes = await this.getThemes();
    return themes.get(await this.resolveThemeKey(cardKey)) ?? CARDS.default!;
  }

  private async resolveThemeKey(cardKey: string | null | undefined): Promise<string> {
    const themes = await this.getThemes();
    const rawKey = cardKey
      ? themes.has(cardKey)
        ? cardKey
        : cardKey.replace(/^card_/, "")
      : "default";
    return themes.has(rawKey) ? rawKey : "default";
  }

  /**
   * Candidate backgrounds of a card, best first: the equipped banner (as given, then with
   * the usual extensions), the file of the theme, then the legacy `assets/cards/<key>`
   * convention of purchasable backgrounds. The renderer takes the first that decodes and
   * draws the theme gradient when none does.
   */
  private backgroundCandidates(key: string, theme: CardTheme, bannerFile: string | null): string[] {
    return [
      ...(bannerFile ? [bannerFile, ...withExtensions(`assets/banners/${bannerFile}`)] : []),
      ...(theme.bgFile ? [theme.bgFile] : []),
      ...withExtensions(`assets/cards/${key}`),
    ];
  }

  /**
   * Profile card as PNG at 2x through the shared card renderer (`~/render`): level and XP
   * gauge from `xpProgress`, rank, zeni, race, tier, equipped banner, colour and badge. A
   * missing background or avatar draws its fallback and never throws.
   */
  async renderCard(input: CardInput): Promise<RenderedCard> {
    const cardKey = await this.resolveThemeKey(input.cardKey);
    const theme = await this.resolveTheme(cardKey);
    const bannerFile =
      input.bannerPath || (input.bannerKey ? await this.resolveBannerPath(input.bannerKey) : null);
    return renderProfileCard(
      {
        name: input.discordUser.displayName || input.discordUser.username,
        title: input.title,
        avatarUrl: input.discordUser.displayAvatarURL({
          extension: "png",
          size: 512,
          forceStatic: true,
        }),
        xp: input.xp,
        zeni: input.zeni,
        messages: input.messageCount,
        rank: input.rank,
        race: input.race,
        tier: input.tier,
        badge: input.badge,
        fused: input.fused,
        color: input.color,
        theme: {
          accent: theme.accent,
          aura: theme.aura,
          gradient: theme.bgGrad,
          overlayOpacity: theme.overlayOpacity,
          tintStrength: theme.tintStrength,
          gradientAngle: theme.gradientAngle,
          label: theme.name,
        },
        backgrounds: this.backgroundCandidates(cardKey, theme, bannerFile),
        progressLabel:
          input.progressLabel === undefined ? legacyProgressLabel(input.xp) : input.progressLabel,
        labels: { ...LEGACY_PROFILE_LABELS, ...input.labels },
      },
      { images: imageSourceFrom(this.bgs), locale: input.locale },
    );
  }

  /** Profile card image (see `renderCard`). */
  async render(input: CardInput): Promise<Buffer> {
    return (await this.renderCard(input)).buffer;
  }
}
