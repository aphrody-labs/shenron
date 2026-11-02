// Calcul WCAG 2.x des paires texte/fond réelles de dragonballfr.com (valeurs lues dans
// packages/ui/src/styles.css et les classes Tailwind du site). Usage : bun contrast.ts
// Sortie : tableau + code retour 1 si une paire échoue son seuil AA.
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const over = (fg: RGB, a: number, bg: RGB): RGB =>
  fg.map((c, i) => c * a + bg[i]! * (1 - a)) as RGB;
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const BG = hex("#0a0a0a"); // --color-dbz-bg
const CARD = hex("#141410"); // --color-dbz-card
const FG = hex("#fff7e0"); // --foreground
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const ORANGE = hex("#e78220"); // --color-dbz-orange
const ORANGE_DARK = hex("#c46f1b");
const YELLOW = hex("#fefd03");
const RED = hex("#f10c3b");
const BORDER = hex("#2a2a26");

interface Pair {
  name: string;
  fg: RGB;
  bg: RGB;
  min: number;
  kind: "texte" | "texte-gras-grand" | "non-texte";
}
const t = (name: string, fg: RGB, bg: RGB, min = 4.5, kind: Pair["kind"] = "texte"): Pair => ({
  name,
  fg,
  bg,
  min,
  kind,
});

const pairs: Pair[] = [
  t("texte courant (foreground) sur fond", FG, BG),
  t("texte courant sur carte", FG, CARD),
  t("blanc/85 sur fond", over(WHITE, 0.85, BG), BG),
  t("blanc/80 sur fond", over(WHITE, 0.8, BG), BG),
  t("blanc/75 sur fond (barre d'outils liste de suivi)", over(WHITE, 0.75, BG), BG),
  t("blanc/70 sur carte", over(WHITE, 0.7, CARD), CARD),
  t("blanc/60 sur fond (métadonnées)", over(WHITE, 0.6, BG), BG),
  t("blanc/60 sur carte", over(WHITE, 0.6, CARD), CARD),
  t("blanc/55 sur fond", over(WHITE, 0.55, BG), BG),
  t("blanc/50 sur fond (placeholder, étiquette série)", over(WHITE, 0.5, BG), BG),
  t("blanc/50 sur carte", over(WHITE, 0.5, CARD), CARD),
  t("accent orange en texte sur fond", ORANGE, BG),
  t("accent orange en texte sur carte", ORANGE, CARD),
  t("accent sombre en texte sur fond", ORANGE_DARK, BG),
  t("jaune doré en texte sur fond", YELLOW, BG),
  t("noir sur accent (bouton primaire)", BLACK, ORANGE),
  t("blanc sur rouge (bouton danger)", WHITE, RED),
  t(
    "blanc sur noir/70 sur vignette claire (pastille durée, pire cas blanc)",
    WHITE,
    over(BLACK, 0.7, WHITE),
  ),
  t("anneau de focus accent sur fond (non-texte 3:1)", ORANGE, BG, 3, "non-texte"),
  t(
    "barre de progression accent sur piste blanc/20 (non-texte 3:1)",
    ORANGE,
    over(WHITE, 0.2, CARD),
    3,
    "non-texte",
  ),
  t("bordure 1 px sur fond (décorative, hors critère)", BORDER, BG, 1, "non-texte"),
];

let fails = 0;
console.log("paire".padEnd(78), "ratio".padStart(7), "seuil".padStart(6), "AA");
for (const p of pairs) {
  const r = ratio(p.fg, p.bg);
  const ok = r >= p.min;
  if (!ok) fails++;
  console.log(
    p.name.padEnd(78),
    r.toFixed(2).padStart(7),
    String(p.min).padStart(6),
    ok ? "ok" : "ECHEC",
  );
}
console.log(`\n${pairs.length - fails}/${pairs.length} conformes, ${fails} échec(s)`);
process.exit(fails ? 1 : 0);
