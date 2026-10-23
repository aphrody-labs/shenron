/**
 * Which episodes show which transformation, read from the titles of the episodes themselves.
 *
 * A link is only made when the Japanese title (or the French one) of an episode names the
 * transformation: "ついに変身!! 伝説の超サイヤ人・孫悟空" (episode 95 of DBZ) is Goku turning
 * Super Saiyan, and nothing else is guessed. A transformation that no title names has no
 * link, and its card falls back to the series where it first appears (`TRANSFORMATION_SERIES`).
 * Used by the catalog build (`scripts/build-frame-catalog.ts`) and by the card services.
 */

export const TRANSFORMATION_KEYS = [
  "ozaru",
  "kaioken",
  "ssj",
  "ssj2",
  "ssj3",
  "ssj4",
  "ssg",
  "ssb",
  "rose",
  "ui",
] as const;
export type TransformationKey = (typeof TRANSFORMATION_KEYS)[number];

/** Title patterns, tried on the Japanese then the French title of an episode. */
const TITLE_PATTERNS: Record<TransformationKey, RegExp> = {
  ozaru: /大猿|オオザル|Grand Singe|singe g[ée]ant/i,
  kaioken: /界王拳|Ka[ïi]o-?ken/i,
  // the first transformation: the title must announce it ("ついに変身!! 伝説の超サイヤ人"),
  // not merely mention the form ("超サイヤ人を超えろ", "目覚める超サイヤ人の血")
  ssj: /(?=.*超(?:スーパー)?サイヤ人(?![2-4２-４ゴブロを]))(?=.*(?:変身|誕生))/,
  ssj2: /超サイヤ人[2２]|Super Sa[ïi]yen 2|Super Saiyan 2/i,
  ssj3: /超サイヤ人[3３]|Super Sa[ïi]yen 3|Super Saiyan 3/i,
  ssj4: /超サイヤ人[4４]|Super Sa[ïi]yen 4|Super Saiyan 4/i,
  ssg: /超サイヤ人ゴッド|Super Sa[ïi]yen Divin|Super Saiyan God/i,
  ssb: /超サイヤ人ブルー|Super Sa[ïi]yen bleu|Super Saiyan Blue/i,
  rose: /超サイヤ人ロゼ|Super Sa[ïi]yen ros[ée]|Super Saiyan Ros[ée]/i,
  ui: /身勝手の極意|Ultra Instinct/i,
};

/** Transformations a title announces, in key order. */
export function transformationsOfTitles(titles: {
  ja?: string | null;
  fr?: string | null;
}): TransformationKey[] {
  return TRANSFORMATION_KEYS.filter((key) => {
    const pattern = TITLE_PATTERNS[key];
    return pattern.test(titles.ja ?? "") || pattern.test(titles.fr ?? "");
  });
}

/** Series where each transformation appears, used when no episode title names it. */
export const TRANSFORMATION_SERIES: Record<TransformationKey, readonly string[]> = {
  ozaru: ["DB"],
  kaioken: ["DBZ", "DBZ_KAI"],
  ssj: ["DBZ", "DBZ_KAI"],
  ssj2: ["DBZ", "DBZ_KAI"],
  ssj3: ["DBZ", "DBZ_KAI_FINAL"],
  ssj4: ["DBGT"],
  ssg: ["DBS"],
  ssb: ["DBS"],
  rose: ["DBS"],
  ui: ["DBS"],
};

/** Labels (any of fr, en, ja, with or without accents and spaces) of the tier roles. */
const LABEL_PATTERNS: ReadonlyArray<readonly [TransformationKey, RegExp]> = [
  ["ui", /instinct|身勝手の極意/i],
  ["ssb", /blue|bleu|ブルー/i],
  ["rose", /ros[ée]|ロゼ/i],
  ["ssg", /god|divin|ゴッド/i],
  ["ssj4", /(?:ssj|super sa[ïi]y?[ae]?n|super saiyan|超サイヤ人)\s*[4４]/i],
  ["ssj3", /(?:ssj|super sa[ïi]y?[ae]?n|super saiyan|超サイヤ人)\s*[3３]/i],
  ["ssj2", /(?:ssj|super sa[ïi]y?[ae]?n|super saiyan|超サイヤ人)\s*[2２]/i],
  ["ssj", /super sa[ïi]y?[ae]?n|super saiyan|ssj|超サイヤ人/i],
  ["kaioken", /ka[ïi]o-?ken|界王拳/i],
  ["ozaru", /[oō]zaru|大猿|grand singe/i],
];

/** Transformation named by a tier label ("Super Saiyan 2", "超サイヤ人2"), `null` when none. */
export function transformationKeyForLabel(
  label: string | null | undefined,
): TransformationKey | null {
  if (!label) return null;
  for (const [key, pattern] of LABEL_PATTERNS) if (pattern.test(label)) return key;
  return null;
}

/**
 * Hue of the aura or the hair of each transformation, with the half width of the sector that
 * counts as "its colour" (degrees). Ranks the frames of the linked episodes: the episode is
 * the reliable link (its title), the colour tells which of its frames look like it. Ozaru and
 * Ultra Instinct (silver, achromatic) have no hue to look for.
 */
export const TRANSFORMATION_AURA: Partial<
  Record<TransformationKey, { hue: number; width: number }>
> = {
  kaioken: { hue: 0, width: 25 },
  ssj: { hue: 50, width: 25 },
  ssj2: { hue: 50, width: 25 },
  ssj3: { hue: 50, width: 25 },
  ssj4: { hue: 0, width: 25 },
  ssg: { hue: 0, width: 25 },
  ssb: { hue: 195, width: 35 },
  rose: { hue: 330, width: 25 },
};

/** Share of a frame in the colour of a transformation, from its 12 hue sectors (0 to 1). */
export function auraShare(key: TransformationKey, hueShares: readonly number[]): number {
  const aura = TRANSFORMATION_AURA[key];
  if (!aura) return 0;
  let share = 0;
  for (let sector = 0; sector < hueShares.length; sector++) {
    const center = sector * 30 + 15;
    const distance = Math.abs(((center - aura.hue + 540) % 360) - 180);
    if (distance <= aura.width + 15) share += hueShares[sector]!;
  }
  return share;
}
