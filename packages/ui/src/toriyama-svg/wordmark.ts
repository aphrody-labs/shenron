import { corpsNuage, KINTO_UN_ILLUSTRATION } from "./kinto-un";

/** Hand-constructed outlines inspected against the owner's 273 × 126 reference. */
export const WORDMARK_VIEWBOX = "0 0 272 102";
export const WORDMARK_COLORS = {
  ink: "#080808",
  yellow: "#fef102",
  red: "#e50113",
  blue: "#087cb2",
  paper: "#ffffff",
} as const;

export const WORDMARK_LETTERS = [
  {
    name: "D",
    fill: "yellow",
    d: "M8 26C29 26 42 41 40 55C39 69 30 79 19 84L13 56L17 54ZM20 39L23 65C34 54 32 44 20 39Z",
  },
  {
    name: "R",
    fill: "yellow",
    d: "M31 32C46 33 56 42 55 51C55 57 51 61 48 63L57 76L45 82L39 65L40 83L30 85L30 60L34 56ZM41 43L41 55C49 52 48 47 41 43Z",
  },
  {
    name: "A",
    fill: "yellow",
    d: "M53 39L66 44L76 79L65 83L63 72L57 71L55 82L44 84ZM59 54L57 63L63 64Z",
  },
  {
    name: "G",
    fill: "yellow",
    d: "M95 49L90 59C79 50 74 58 77 67C79 74 84 75 87 72L85 68L81 69L80 60L99 62L99 77C88 87 71 84 67 70C62 53 78 39 95 49Z",
  },
  {
    name: "N",
    fill: "yellow",
    d: "M118 45L128 46L134 61L134 44L144 45L143 80L133 80L126 64L127 81L117 82Z",
  },
  {
    name: "B",
    fill: "red",
    d: "M139 45L153 45C166 44 171 55 163 62C174 71 163 82 149 81L140 82ZM150 53L151 59C159 59 159 52 150 53ZM151 67L152 74C161 75 160 66 151 67Z",
  },
  {
    name: "A",
    fill: "red",
    d: "M168 43L180 40L186 79L175 81L174 71L167 73L165 82L154 83ZM170 53L168 64L173 63Z",
  },
  { name: "L", fill: "red", d: "M183 40L195 37L191 70L199 68L198 79L179 82Z" },
  { name: "L", fill: "red", d: "M198 36L210 33L203 68L211 66L209 78L191 82Z" },
] as const;

/** Original France lettering, with a constant cap height and open counters. */
export const WORDMARK_FRANCE_GLYPHS = [
  "M0 0H9V3H3V5H8V8H3V12H0Z",
  "M12 0H18L21 3V6L18 8L22 12H18L15 8V12H12ZM15 3V5H18V3Z",
  "M26 0H30L34 12H31L30 9H26L25 12H22ZM28 3L27 6H29Z",
  "M36 0H39L43 7V0H46V12H43L39 5V12H36Z",
  "M51 0H58V3H52V9H58V12H51L49 10V2Z",
  "M61 0H70V3H64V5H69V8H64V9H70V12H61Z",
] as const;
export const WORDMARK_LIGHTNING = "M239 13L220 48L233 46L215 80L261 38L241 41L255 19Z";
export const WORDMARK_FRANCE_RIBBON = "M183 81L266 78L260 99L176 101Z";
export const WORDMARK_FRANCE_TRANSFORM = "translate(187 84) skewX(-12)";
export const WORDMARK_CLOUD_TRANSFORM = "translate(86 51) scale(.031)";

export function renderWordmarkCloud(prefix: string): string {
  return corpsNuage(KINTO_UN_ILLUSTRATION, prefix);
}

/** Asset and React component share these outlines; no embedded image or font dependency. */
export function renderDragonBallWordmark(): string {
  const letters = WORDMARK_LETTERS.map(
    (letter) => `<path fill="${WORDMARK_COLORS[letter.fill]}" d="${letter.d}"/>`,
  ).join("");
  const franceLetters = WORDMARK_FRANCE_GLYPHS.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}" role="img" aria-labelledby="title"><title id="title">Dragon Ball France</title><g stroke="${WORDMARK_COLORS.ink}" stroke-width="3.2" stroke-linejoin="round" fill-rule="evenodd">${letters}<path d="${WORDMARK_LIGHTNING}" fill="${WORDMARK_COLORS.yellow}" stroke-width="4"/></g><g transform="${WORDMARK_CLOUD_TRANSFORM}">${renderWordmarkCloud("dragon-wordmark-cloud")}</g><path d="${WORDMARK_FRANCE_RIBBON}" fill="${WORDMARK_COLORS.yellow}" stroke="${WORDMARK_COLORS.ink}" stroke-width="2.5"/><g transform="${WORDMARK_FRANCE_TRANSFORM}" fill="${WORDMARK_COLORS.ink}" fill-rule="evenodd">${franceLetters}</g></svg>\n`;
}
