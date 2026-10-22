/**
 * Polices des canvases du bot, sans dépendance native : `canvas-kit` les
 * enregistre et `scripts/build/bot.ts` les livre à côté du binaire.
 */

/** `[fichier sous assets/fonts, famille]`. */
export const CANVAS_FONT_FILES: ReadonlyArray<readonly [string, string]> = [
  // Google Sans Flex — police principale (variable, axes opsz+wght). Skia
  // (@napi-rs/canvas) sélectionne le poids via la font string (`600 24px ...`).
  ["GoogleSansFlex.ttf", "Google Sans Flex"],
  // Legacy conservées en fallback (anciennes cartes / accents).
  ["Inter-Medium.ttf", "Inter"],
  ["Inter-SemiBold.ttf", "Inter SemiBold"],
  ["Inter-Bold.ttf", "Inter Bold"],
  ["Inter-ExtraBold.ttf", "Inter ExtraBold"],
  ["InterDisplay-Black.ttf", "Inter Display Black"],
  ["Teko-SemiBold.ttf", "Teko SemiBold"],
  ["Teko-Bold.ttf", "Teko Bold"],
  ["SaiyanSans.ttf", "Saiyan Sans"],
  ["SaiyanSans-LeftOblique.ttf", "Saiyan Sans Oblique"],
  ["DBSScouter.ttf", "DBS Scouter"],
];

/**
 * Familles de repli, glyphe par glyphe : Skia passe à la suivante quand la
 * police principale n'a pas le caractère (emoji des badges, kanji, pseudos
 * CJK). Linux : paquets `fonts-noto-color-emoji` et `fonts-wqy-microhei` de
 * l'image ; Windows : polices système.
 */
const FALLBACK_FAMILIES = [
  "'Noto Color Emoji'",
  "'Segoe UI Emoji'",
  "'WenQuanYi Micro Hei'",
  "'Yu Gothic'",
  "sans-serif",
].join(", ");

/** Pile de polices de l'interface des canvases. */
export const FONT_STACK = `'Google Sans Flex', ${FALLBACK_FAMILIES}`;

/** Font string complète : `font("800 48px")`. */
export const font = (spec: string): string => `${spec} ${FONT_STACK}`;
