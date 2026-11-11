// SPDX-License-Identifier: Apache-2.0
/**
 * Canonical Master Database of Dragon Ball Games.
 * Aggregates SteamDB AppIDs, Libretro/RetroArch cores, platform serials,
 * cover art, ROM hashes, and community modding signatures.
 */

export type GamePlatform =
  | "steam"
  | "wii"
  | "ps2"
  | "ps1"
  | "psp"
  | "gba"
  | "nds"
  | "snes"
  | "megadrive"
  | "arcade";

export interface GameRelease {
  id: string;
  slug: string;
  title: string;
  titleJa?: string;
  titleFr?: string;
  year: number;
  platform: GamePlatform;
  developer: string;
  publisher: string;
  /** Steam App ID if available on PC */
  steamAppId?: number;
  /** SteamDB URL */
  steamDbUrl?: string;
  /** Libretro core ID for RetroArch */
  libretroCore?: string;
  /** Platform serials (e.g. SLUS-21670, RDSP64) */
  serials?: {
    europe?: string;
    usa?: string;
    japan?: string;
  };
  /** Supported dump container formats */
  formats: string[];
  /** Cloudflare R2 storage key pattern */
  r2StorageKey?: string;
  /** Community mod/patch support */
  communityMods?: {
    name: string;
    category: "translation" | "audio_dub" | "balance" | "hd_textures";
    sourceUrl: string;
  }[];
}

export const DRAGON_BALL_GAMES_CATALOG: GameRelease[] = [
  // --- Modern PC / Steam (SteamDB) ---
  {
    id: "db-sparking-zero",
    slug: "sparking-zero",
    title: "DRAGON BALL: Sparking! ZERO",
    titleJa: "ドラゴンボール Sparking! ZERO",
    titleFr: "Dragon Ball: Sparking! ZERO",
    year: 2024,
    platform: "steam",
    developer: "Spike Chunsoft",
    publisher: "Bandai Namco Entertainment",
    steamAppId: 1790600,
    steamDbUrl: "https://steamdb.info/app/1790600/",
    formats: ["depot", "exe"],
    r2StorageKey: "steam/1790600/manifest.json",
  },
  {
    id: "db-xenoverse-2",
    slug: "xenoverse-2",
    title: "DRAGON BALL Xenoverse 2",
    titleJa: "ドラゴンボール ゼノバース2",
    titleFr: "Dragon Ball Xenoverse 2",
    year: 2016,
    platform: "steam",
    developer: "Dimps",
    publisher: "Bandai Namco Entertainment",
    steamAppId: 454650,
    steamDbUrl: "https://steamdb.info/app/454650/",
    formats: ["depot", "cpk", "exe"],
    r2StorageKey: "steam/454650/manifest.json",
    communityMods: [
      {
        name: "XV2INS (Xenoverse 2 Installer) & Patchver",
        category: "balance",
        sourceUrl: "https://videogamemods.com/xenoverse/",
      },
    ],
  },
  {
    id: "db-kakarot",
    slug: "kakarot",
    title: "DRAGON BALL Z: KAKAROT",
    titleJa: "ドラゴンボールZ KAKAROT",
    titleFr: "Dragon Ball Z: Kakarot",
    year: 2020,
    platform: "steam",
    developer: "CyberConnect2",
    publisher: "Bandai Namco Entertainment",
    steamAppId: 851850,
    steamDbUrl: "https://steamdb.info/app/851850/",
    formats: ["depot", "pak", "exe"],
    r2StorageKey: "steam/851850/manifest.json",
  },
  {
    id: "db-fighterz",
    slug: "fighterz",
    title: "DRAGON BALL FighterZ",
    titleJa: "ドラゴンボール ファイターズ",
    titleFr: "Dragon Ball FighterZ",
    year: 2018,
    platform: "steam",
    developer: "Arc System Works",
    publisher: "Bandai Namco Entertainment",
    steamAppId: 678950,
    steamDbUrl: "https://steamdb.info/app/678950/",
    formats: ["depot", "pak", "exe"],
    r2StorageKey: "steam/678950/manifest.json",
  },
  {
    id: "db-the-breakers",
    slug: "the-breakers",
    title: "DRAGON BALL: THE BREAKERS",
    titleJa: "ドラゴンボール ザ ブレイカーズ",
    titleFr: "Dragon Ball: The Breakers",
    year: 2022,
    platform: "steam",
    developer: "Dimps",
    publisher: "Bandai Namco Entertainment",
    steamAppId: 1276760,
    steamDbUrl: "https://steamdb.info/app/1276760/",
    formats: ["depot", "cpk", "exe"],
    r2StorageKey: "steam/1276760/manifest.json",
  },

  // --- Nintendo Wii (Dolphin Core) ---
  {
    id: "dbz-budokai-tenkaichi-3-wii",
    slug: "budokai-tenkaichi-3-wii",
    title: "Dragon Ball Z: Budokai Tenkaichi 3",
    titleJa: "ドラゴンボールZ Sparking! METEOR",
    titleFr: "Dragon Ball Z: Budokai Tenkaichi 3",
    year: 2007,
    platform: "wii",
    developer: "Spike",
    publisher: "Bandai / Atari",
    libretroCore: "dolphin_libretro",
    serials: {
      europe: "RDSP64",
      usa: "RDSE64",
      japan: "RDSJ64",
    },
    formats: ["rvz", "iso", "wbfs"],
    r2StorageKey: "games/wii/RDSP64/budokai-tenkaichi-3.rvz",
    communityMods: [
      {
        name: "Dragon Ball Z: Budokai Tenkaichi 3 Version Latine / FR Dub Remaster",
        category: "audio_dub",
        sourceUrl: "https://dragonballfr.com/community/bt3-dub",
      },
    ],
  },
  {
    id: "dbz-revenge-of-king-piccolo",
    slug: "revenge-of-king-piccolo",
    title: "Dragon Ball: Revenge of King Piccolo",
    titleJa: "ドラゴンボール 天下一大冒険",
    titleFr: "Dragon Ball: Revenge of King Piccolo",
    year: 2009,
    platform: "wii",
    developer: "Media.Vision",
    publisher: "Bandai Namco",
    libretroCore: "dolphin_libretro",
    serials: {
      europe: "R7OP64",
      usa: "R7OE64",
      japan: "R7OJ64",
    },
    formats: ["rvz", "iso"],
    r2StorageKey: "games/wii/R7OP64/revenge-of-king-piccolo.rvz",
  },

  // --- Sony PlayStation 2 (PCSX2 Core) ---
  {
    id: "dbz-budokai-tenkaichi-3-ps2",
    slug: "budokai-tenkaichi-3-ps2",
    title: "Dragon Ball Z: Budokai Tenkaichi 3",
    titleJa: "ドラゴンボールZ Sparking! METEOR",
    titleFr: "Dragon Ball Z: Budokai Tenkaichi 3",
    year: 2007,
    platform: "ps2",
    developer: "Spike",
    publisher: "Bandai / Atari",
    libretroCore: "pcsx2_libretro",
    serials: {
      europe: "SLES-54945",
      usa: "SLUS-21670",
      japan: "SLPS-25815",
    },
    formats: ["chd", "iso", "cso"],
    r2StorageKey: "games/ps2/SLES-54945/budokai-tenkaichi-3.chd",
  },
  {
    id: "dbz-budokai-3-ps2",
    slug: "budokai-3-ps2",
    title: "Dragon Ball Z: Budokai 3",
    titleJa: "ドラゴンボールZ3",
    titleFr: "Dragon Ball Z: Budokai 3",
    year: 2004,
    platform: "ps2",
    developer: "Dimps",
    publisher: "Bandai / Atari",
    libretroCore: "pcsx2_libretro",
    serials: {
      europe: "SLES-52730",
      usa: "SLUS-20998",
      japan: "SLPS-25440",
    },
    formats: ["chd", "iso"],
    r2StorageKey: "games/ps2/SLES-52730/budokai-3.chd",
  },
  {
    id: "dbz-infinite-world-ps2",
    slug: "infinite-world-ps2",
    title: "Dragon Ball Z: Infinite World",
    titleJa: "ドラゴンボールZ インフィニットワールド",
    titleFr: "Dragon Ball Z: Infinite World",
    year: 2008,
    platform: "ps2",
    developer: "Dimps",
    publisher: "Bandai Namco",
    libretroCore: "pcsx2_libretro",
    serials: {
      europe: "SLES-55346",
      usa: "SLUS-21820",
      japan: "SLPS-25916",
    },
    formats: ["chd", "iso"],
    r2StorageKey: "games/ps2/SLES-55346/infinite-world.chd",
  },

  // --- Sony PlayStation 1 (DuckStation / SwanStation / Beetle PSX) ---
  {
    id: "dbz-ultimate-battle-22",
    slug: "ultimate-battle-22",
    title: "Dragon Ball Z: Ultimate Battle 22",
    titleJa: "ドラゴンボールZ アルティメイト バトル 22",
    titleFr: "Dragon Ball Z: Ultimate Battle 22",
    year: 1995,
    platform: "ps1",
    developer: "Tose",
    publisher: "Bandai",
    libretroCore: "swanstation_libretro",
    serials: {
      europe: "SLES-00271",
      usa: "SLUS-01446",
      japan: "SLPS-00073",
    },
    formats: ["chd", "bin_cue"],
    r2StorageKey: "games/ps1/SLES-00271/ultimate-battle-22.chd",
  },
  {
    id: "db-final-bout",
    slug: "final-bout",
    title: "Dragon Ball Final Bout",
    titleJa: "ドラゴンボール ファイナルバウト",
    titleFr: "Dragon Ball Final Bout",
    year: 1997,
    platform: "ps1",
    developer: "Tose",
    publisher: "Bandai",
    libretroCore: "swanstation_libretro",
    serials: {
      europe: "SLES-00842",
      usa: "SLUS-00493",
      japan: "SLPS-00898",
    },
    formats: ["chd", "bin_cue"],
    r2StorageKey: "games/ps1/SLES-00842/final-bout.chd",
  },

  // --- Game Boy Advance (mGBA Core) ---
  {
    id: "dbz-legacy-of-goku-2",
    slug: "legacy-of-goku-2",
    title: "Dragon Ball Z: The Legacy of Goku II",
    titleFr: "Dragon Ball Z: L'Héritage de Goku II",
    year: 2003,
    platform: "gba",
    developer: "Webfoot Technologies",
    publisher: "Atari",
    libretroCore: "mgba_libretro",
    formats: ["gba", "zip"],
    r2StorageKey: "games/gba/legacy-of-goku-2.gba",
  },
  {
    id: "dbz-buus-fury",
    slug: "buus-fury",
    title: "Dragon Ball Z: Buu's Fury",
    titleFr: "Dragon Ball Z: Buu's Fury",
    year: 2004,
    platform: "gba",
    developer: "Webfoot Technologies",
    publisher: "Atari",
    libretroCore: "mgba_libretro",
    formats: ["gba", "zip"],
    r2StorageKey: "games/gba/buus-fury.gba",
  },
  {
    id: "db-advanced-adventure",
    slug: "advanced-adventure",
    title: "Dragon Ball: Advanced Adventure",
    titleJa: "ドラゴンボール アドバンスアドベンチャー",
    titleFr: "Dragon Ball: Advanced Adventure",
    year: 2004,
    platform: "gba",
    developer: "Dimps",
    publisher: "Banpresto",
    libretroCore: "mgba_libretro",
    formats: ["gba", "zip"],
    r2StorageKey: "games/gba/advanced-adventure.gba",
  },
  {
    id: "dbz-supersonic-warriors",
    slug: "supersonic-warriors",
    title: "Dragon Ball Z: Supersonic Warriors",
    titleJa: "ドラゴンボールZ 舞空闘劇",
    titleFr: "Dragon Ball Z: Supersonic Warriors",
    year: 2004,
    platform: "gba",
    developer: "Arc System Works",
    publisher: "Banpresto / Atari",
    libretroCore: "mgba_libretro",
    formats: ["gba", "zip"],
    r2StorageKey: "games/gba/supersonic-warriors.gba",
  },

  // --- Nintendo DS (DeSmuME / MelonDS Core) ---
  {
    id: "dbk-ultimate-butoden",
    slug: "ultimate-butoden",
    title: "Dragon Ball Kai: Ultimate Butoden",
    titleJa: "ドラゴンボール改 アルティメット武闘伝",
    year: 2011,
    platform: "nds",
    developer: "Game Republic",
    publisher: "Bandai Namco",
    libretroCore: "melonds_libretro",
    formats: ["nds", "zip"],
    r2StorageKey: "games/nds/ultimate-butoden.nds",
    communityMods: [
      {
        name: "Ultimate Butoden English/French Fan Translation",
        category: "translation",
        sourceUrl: "https://romhacking.net/translations/2837/",
      },
    ],
  },
  {
    id: "dbk-attack-of-the-saiyans",
    slug: "attack-of-the-saiyans",
    title: "Dragon Ball Z: Attack of the Saiyans",
    titleJa: "ドラゴンボール改 サイヤ人来襲",
    titleFr: "Dragon Ball Z: Attack of the Saiyans",
    year: 2009,
    platform: "nds",
    developer: "Monolith Soft",
    publisher: "Bandai Namco",
    libretroCore: "melonds_libretro",
    formats: ["nds", "zip"],
    r2StorageKey: "games/nds/attack-of-the-saiyans.nds",
  },

  // --- Super Nintendo / Super Famicom (Snes9x / bsnes) ---
  {
    id: "dbz-super-butoden-2",
    slug: "super-butoden-2",
    title: "Dragon Ball Z: Super Butōden 2",
    titleJa: "ドラゴンボールZ 超武闘伝2",
    titleFr: "Dragon Ball Z: La Légende Saien",
    year: 1993,
    platform: "snes",
    developer: "Tose",
    publisher: "Bandai",
    libretroCore: "snes9x_libretro",
    formats: ["sfc", "smc", "zip"],
    r2StorageKey: "games/snes/super-butoden-2.sfc",
  },
  {
    id: "dbz-hyper-dimension",
    slug: "hyper-dimension",
    title: "Dragon Ball Z: Hyper Dimension",
    titleJa: "ドラゴンボールZ ハイパー ディメンション",
    titleFr: "Dragon Ball Z: Hyper Dimension",
    year: 1996,
    platform: "snes",
    developer: "Tose",
    publisher: "Bandai",
    libretroCore: "snes9x_libretro",
    formats: ["sfc", "smc", "zip"],
    r2StorageKey: "games/snes/hyper-dimension.sfc",
  },

  // --- Sega Mega Drive / Genesis (Genesis Plus GX) ---
  {
    id: "dbz-buyu-retsuden",
    slug: "buyu-retsuden",
    title: "Dragon Ball Z: Buyū Retsuden",
    titleJa: "ドラゴンボールZ 武勇烈伝",
    titleFr: "Dragon Ball Z: L'Appel du Destin",
    year: 1994,
    platform: "megadrive",
    developer: "Tose",
    publisher: "Bandai",
    libretroCore: "genesis_plus_gx_libretro",
    formats: ["md", "gen", "zip"],
    r2StorageKey: "games/megadrive/buyu-retsuden.md",
  },

  // --- Arcade (FBNeo / MAME) ---
  {
    id: "dbz-2-super-battle-arcade",
    slug: "super-battle-arcade",
    title: "Dragon Ball Z 2: Super Battle",
    titleJa: "ドラゴンボールZ 2 Super Battle",
    year: 1994,
    platform: "arcade",
    developer: "Banpresto",
    publisher: "Banpresto",
    libretroCore: "fbneo_libretro",
    formats: ["zip"],
    r2StorageKey: "games/arcade/dbz2.zip",
  },
];

export function findGameBySlug(slug: string): GameRelease | undefined {
  const norm = slug.toLowerCase().trim();
  return DRAGON_BALL_GAMES_CATALOG.find((g) => g.slug === norm || g.id === norm);
}

export function findGamesByPlatform(platform: GamePlatform): GameRelease[] {
  return DRAGON_BALL_GAMES_CATALOG.filter((g) => g.platform === platform);
}

export function searchGames(query: string): GameRelease[] {
  const terms = query.toLowerCase().trim().split(/\s+/);
  return DRAGON_BALL_GAMES_CATALOG.filter((g) => {
    const haystack =
      `${g.title} ${g.titleJa ?? ""} ${g.titleFr ?? ""} ${g.platform} ${g.developer} ${g.publisher} ${g.slug}`.toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
