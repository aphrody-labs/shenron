/**
 * Sample data for the card previews and the render tests. Not imported by production code:
 * the strings below stand in for what the localized callers would pass.
 */
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { xpProgress } from "~/lib/xp";
import { hashSeed, rng } from "./draw";
import { defaultImages } from "./images";
import { formatInt } from "./text";
import {
  renderBalanceCard,
  renderGameCard,
  renderLeaderboardCard,
  renderProfileCard,
  renderShopBoardCard,
  renderShopItemCard,
  renderTierCard,
  type LeaderboardCardInput,
  type ProfileCardInput,
  type ScorePlayer,
  type ShopItemInput,
} from "./index";
import type { ImageSource, RenderOptions, RenderedCard } from "./types";

/** Deterministic avatar-like picture (gradient disc with a pattern) for a seed. */
export async function syntheticAvatar(seed: string, size = 256): Promise<Image> {
  const random = rng(hashSeed(seed));
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const hue = Math.floor(random() * 360);
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, `hsl(${hue}, 70%, 55%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360}, 75%, 30%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = `hsla(${(hue + 180) % 360}, 80%, 70%, 0.55)`;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 20 + random() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  return loadImage(await canvas.encode("png"));
}

/** Image source that invents avatars (no network) and reads assets from disk. */
export function syntheticImages(overrides: Partial<ImageSource> = {}): ImageSource {
  const cache = new Map<string, Promise<Image>>();
  return {
    avatar: (url) => {
      let pending = cache.get(url);
      if (!pending) {
        pending = syntheticAvatar(url);
        cache.set(url, pending);
      }
      return pending;
    },
    asset: defaultImages.asset,
    ...overrides,
  };
}

/** Source with no avatar and no asset: every card must still render. */
export const emptyImages: ImageSource = {
  avatar: async () => null,
  asset: async () => null,
};

export const NAMES = [
  "Son Goku",
  "Vegeta",
  "Bulma",
  "Piccolo",
  "Trunks du Futur",
  "Krillin",
  "Gohan",
  "Yamcha",
  "Maître Roshi",
  "Tenshinhan",
];

export const PROFILE_LABELS = {
  fr: {
    level: "Niveau",
    rank: "Rang",
    zeni: "Zéni",
    messages: "Messages",
    experience: "Expérience",
    power: "Niveau de ki",
    max: "MAX",
    fused: "Fusionné",
  },
  en: {
    level: "Level",
    rank: "Rank",
    zeni: "Zeni",
    messages: "Messages",
    experience: "Experience",
    power: "Ki level",
    max: "MAX",
    fused: "Fused",
  },
  ja: {
    level: "レベル",
    rank: "ランク",
    zeni: "ゼニー",
    messages: "メッセージ",
    experience: "経験値",
    power: "気",
    max: "MAX",
    fused: "フュージョン",
  },
} as const;

// ─── Sample cards ─────────────────────────────────────────────────────────────

const BANNER = "assets/banners/banner-08.jpg";

/** One sample card: a name for the file and the call that renders it. */
export interface SampleCard {
  name: string;
  render: (options: RenderOptions) => Promise<RenderedCard>;
}

/** Every card type in its typical and edge states, with sample French texts. */
/** "126 544 XP avant le niveau 7": the sample line follows `xpProgress`, like the gauge. */
export function sampleProgress(xp: number): { fr: string; ja: string } {
  const { next, remaining } = xpProgress(xp);
  if (!next) return { fr: "", ja: "" };
  const left = formatInt(remaining, "fr");
  return {
    fr: `${left} XP avant le niveau ${next.level}`,
    ja: `レベル${next.level}まで ${formatInt(remaining, "ja")} XP`,
  };
}

export function sampleCards(): SampleCard[] {
  const progress = sampleProgress(123_456);
  const profile: ProfileCardInput = {
    name: "Son Goku",
    title: "Guerrier du Futur",
    avatarUrl: "https://cdn.example/goku.png",
    xp: 123_456,
    zeni: 54_321,
    messages: 4_200,
    rank: 3,
    race: { id: "saiyan", label: "Saiyan", emoji: "⚡" },
    tier: { label: "Super Saiyan 2" },
    badge: "\u{1F525}",
    theme: {
      accent: "#f85b1a",
      aura: "#fa5a1e",
      gradient: ["#3b0d00", "#f85b1a", "#072083"],
      label: "Goku",
    },
    backgrounds: [BANNER],
    progressLabel: progress.fr,
    labels: PROFILE_LABELS.fr,
  };
  const entries = NAMES.map((name, i) => ({
    id: String(i),
    name,
    avatarUrl: `https://cdn.example/${i}.png`,
    value: Math.round(2_400_000 / (i + 1) ** 1.3),
    caption: `Niveau ${30 - i} · Saiyan`,
    highlight: i === 5,
  }));
  const board: LeaderboardCardInput = {
    entries,
    title: "Classement XP",
    subtitle: "Les meilleurs combattants de l’univers 7",
    unit: "XP",
    pageLabel: "Page 1 / 13",
    totalLabel: "128 combattants",
    updatedLabel: "Mis à jour à 12:30",
    site: "dragonballfr.com",
  };
  const tierLabels = {
    title: "Palier franchi",
    level: "Niveau",
    newRole: "Nouvelle transformation",
  };
  const items: ShopItemInput[] = [
    {
      name: "Goku Super Saiyan",
      kindLabel: "Bannière",
      description: "Une bannière de profil avec Goku en Super Saiyan.",
      price: 2_500,
      accent: "#f85b1a",
      preview: { kind: "image", ref: BANNER },
    },
    {
      name: "Cyan Ki",
      kindLabel: "Couleur",
      description: "Colore ton pseudo et ta barre d’expérience.",
      price: 800,
      accent: "#00e5ff",
      preview: { kind: "color", color: "#00e5ff" },
    },
    {
      name: "Boule de cristal",
      kindLabel: "Badge",
      description: "Un badge pour montrer ton goût.",
      price: 1_200,
      stateLabel: "Possédé",
      accent: "#a855f7",
      preview: { kind: "badge", text: "\u{1F52E}" },
    },
    {
      name: "Ultra Instinct",
      kindLabel: "Carte",
      description: "Thème de carte argenté.",
      priceLabel: "Récompense",
      accent: "#b4c4dd",
      preview: { kind: "gradient", colors: ["#000814", "#475569", "#000000"] },
    },
  ];
  const players: ScorePlayer[] = [
    { name: "Son Goku", avatarUrl: "https://cdn.example/goku.png", score: "2", active: true },
    { name: "Vegeta", avatarUrl: "https://cdn.example/vegeta.png", score: "1", tone: "info" },
  ];
  return [
    { name: "profile-photo", render: (o) => renderProfileCard(profile, o) },
    {
      name: "profile-gradient",
      render: (o) =>
        renderProfileCard(
          {
            ...profile,
            name: "Trunks",
            title: null,
            badge: null,
            rank: null,
            fused: true,
            tier: null,
            color: "#00e5ff",
            xp: 900,
            backgrounds: [],
            theme: { label: "DB Classic" },
          },
          o,
        ),
    },
    {
      name: "profile-ja",
      render: (o) =>
        renderProfileCard(
          {
            ...profile,
            name: "孫悟空",
            title: "未来の戦士",
            labels: PROFILE_LABELS.ja,
            race: { id: "saiyan", label: "サイヤ人", emoji: "⚡" },
            tier: { label: "超サイヤ人2" },
            progressLabel: progress.ja,
          },
          { ...o, locale: "ja" },
        ),
    },
    { name: "leaderboard-podium", render: (o) => renderLeaderboardCard(board, o) },
    {
      name: "leaderboard-list",
      render: (o) =>
        renderLeaderboardCard(
          {
            ...board,
            firstRank: 11,
            podium: false,
            pageLabel: "Page 2 / 13",
            entries: entries.map((entry) => Object.assign({}, entry, { caption: null })),
          },
          o,
        ),
    },
    {
      name: "tier-role",
      render: (o) =>
        renderTierCard(
          {
            name: "Son Goku",
            avatarUrl: "https://cdn.example/goku.png",
            fromLevel: 12,
            toLevel: 15,
            role: { label: "Super Saiyan", accent: "#f9ee54" },
            labels: tierLabels,
          },
          o,
        ),
    },
    {
      name: "tier-plain",
      render: (o) =>
        renderTierCard(
          {
            name: "Bulma",
            avatarUrl: null,
            fromLevel: 3,
            toLevel: 4,
            accent: "#2955dc",
            labels: tierLabels,
          },
          o,
        ),
    },
    {
      name: "balance",
      render: (o) =>
        renderBalanceCard(
          {
            name: "Son Goku",
            avatarUrl: "https://cdn.example/goku.png",
            zeni: 1_234_567,
            stats: [
              { label: "Aujourd’hui", value: "+420", tone: "good" },
              { label: "Rang", value: "#3" },
              { label: "Boost", value: "x1,25", tone: "warn" },
            ],
            history: {
              label: "7 derniers jours",
              values: [800, 950, 900, 1100, 1050, 1180, 1234],
            },
            labels: { zeni: "Zéni" },
          },
          o,
        ),
    },
    {
      name: "shop-item",
      render: (o) => renderShopItemCard({ item: items[0]!, balanceLabel: "Solde : 12 300 Z" }, o),
    },
    {
      name: "shop-board",
      render: (o) =>
        renderShopBoardCard(
          {
            title: "Boutique : bannières",
            subtitle: "Choisis un objet dans le menu",
            items,
            balanceLabel: "Solde : 12 300 Z",
            site: "dragonballfr.com",
          },
          o,
        ),
    },
    {
      name: "game-hangman",
      render: (o) =>
        renderGameCard(
          {
            title: "Pendu",
            subtitle: "Indice : Personnage",
            badge: { label: "Normal" },
            blocks: [
              {
                type: "tiles",
                cells: [..."kame sennin"].map((char) =>
                  char === " "
                    ? { char, state: "gap" as const }
                    : {
                        char,
                        state: "kae".includes(char) ? ("revealed" as const) : ("hidden" as const),
                      },
                ),
              },
              { type: "lives", label: "Vies", total: 6, left: 4 },
              {
                type: "keyboard",
                rows: ["abcdefghijklm", "nopqrstuvwxyz"],
                hit: new Set(["k", "a", "e"]),
                miss: new Set(["z", "x"]),
              },
            ],
          },
          o,
        ),
    },
    {
      name: "game-range",
      render: (o) =>
        renderGameCard(
          {
            title: "Bingo",
            subtitle: "Nombre entre 1 et 1000",
            badge: { label: "Difficile", tone: "bad" },
            blocks: [
              {
                type: "range",
                min: 1,
                max: 1000,
                lo: 501,
                hi: 749,
                guesses: [
                  { value: 500, tone: "bad" },
                  { value: 750, tone: "bad" },
                ],
              },
              { type: "pips", label: "Essais", total: 8, used: 2 },
              { type: "callout", text: "Plus bas" },
            ],
          },
          o,
        ),
    },
    {
      name: "game-board",
      render: (o) =>
        renderGameCard(
          {
            title: "Morpion",
            subtitle: "Son Goku contre Vegeta",
            status: { label: "À toi de jouer", tone: "warn" },
            footer: "Gain : 150 Z",
            blocks: [
              { type: "scoreboard", players, versus: "VS" },
              {
                type: "grid",
                rows: 3,
                cols: 3,
                cells: [
                  { text: "X", tone: "warn", highlight: true },
                  { text: "O", tone: "info" },
                  {},
                  { text: "O", tone: "info" },
                  { text: "X", tone: "warn", highlight: true },
                  {},
                  {},
                  {},
                  { text: "X", tone: "warn", highlight: true },
                ],
              },
              {
                type: "stats",
                items: [
                  { label: "Tour", value: "5" },
                  { label: "Mise", value: "150 Z", tone: "warn" },
                ],
              },
            ],
          },
          o,
        ),
    },
  ];
}
