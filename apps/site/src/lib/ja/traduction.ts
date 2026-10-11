/**
 * Japonais — protection du vocabulaire du domaine avant traduction. Règles pures.
 *
 * Mesuré avec NLLB-200 en local : la grammaire japonaise est correctement
 * rendue, **le vocabulaire de la série est massacré**. `孫悟空は界王拳を使った`
 * devient « Son-gu a utilisé le poing du roi » : le modèle translittère les noms
 * propres au son et traduit les techniques littéralement, parce qu'il ne les a
 * jamais vus. `ベジータ` ressort en « Végitta », `フリーザ` en « Frézza ».
 *
 * Or la forme française de ces termes, nous l'avons — dans la même ligne de base
 * que leur graphie japonaise. On masque donc chaque terme connu par un jeton
 * avant de traduire, puis on réinjecte la forme officielle. Le modèle ne traduit
 * plus que ce qu'il sait traduire : la phrase autour.
 *
 * Résultat sur les mêmes phrases : « **Son Goku** a utilisé… », « **Vegeta** est
 * le prince des **Saiyans** », « **Piccolo** et **Krilin** protègent la Terre ».
 *
 * Les règles (masquage le plus long d'abord, frontières de mot, jetons `Zeta001`, restauration
 * tolérante) appartiennent à `@aphrody/shenron-lexicon`, identique au crate Rust `shenron-lexicon`
 * (fixtures partagées `data/lexicon/fixtures/`). Ce module garde les noms historiques de ses
 * appelants ; le code nouveau importe `@aphrody/shenron-lexicon` directement.
 *
 * Ce module ne charge aucun modèle : il prépare le texte et recompose la
 * sortie. L'inférence vit dans `scripts/ja-traduire.ts`, parce qu'elle demande
 * 87 s de chargement et ~3 s par phrase — un traitement par lot, pas une
 * fonctionnalité de page.
 */
import {
  codePoints,
  DEFAULT_TOKEN_PREFIX,
  findOccurrences,
  findTokens,
  maskText,
  restoreTokens,
  wordEdges,
  type MaskEntry,
} from "@aphrody/shenron-lexicon";
import type { TermeLexique } from "./anomalies";

/**
 * Jetons de substitution : `Zeta001`, `Zeta002`… Un nom latin court suivi d'un numéro traverse
 * le moteur, qui le prend pour un nom à recopier ; la restauration tolère la casse, les accents et
 * un séparateur (`Zêta010`, `ZETA 001`), et tout jeton qui survit fait échouer la planche.
 */
export const PREFIXE_JETON = DEFAULT_TOKEN_PREFIX;

/** Borne du nombre de termes distincts masqués par segment (`protegerTermes`). */
const MAX_TOKENS = 16;

const tokenOptions = (prefix?: string, width?: number) => ({
  ...(prefix ? { prefix } : {}),
  ...(width === undefined ? {} : { width }),
});

/** Jetons encore présents dans un texte (vide = restauration complète). */
export function jetonsResiduels(
  texte: string,
  prefixe = PREFIXE_JETON,
  largeur?: number,
): string[] {
  return findTokens(texte, tokenOptions(prefixe, largeur));
}

/** UTF-16 offset → code point offset in `text`. */
function codePointIndex(text: string, utf16: number): number {
  return codePoints(text.slice(0, utf16));
}

/** Vrai si `texte.slice(debut, fin)` n'est pas un morceau d'un mot plus long (katakana, latin). */
export function bordsDeMot(texte: string, debut: number, fin: number): boolean {
  return wordEdges([...texte], codePointIndex(texte, debut), codePointIndex(texte, fin));
}

export interface Occurrence<T> {
  /** Offsets UTF-16 dans le texte. */
  debut: number;
  fin: number;
  terme: T;
}

function utf16Offsets(text: string): number[] {
  const offsets = [0];
  let offset = 0;
  for (const c of text) {
    offset += c.length;
    offsets.push(offset);
  }
  return offsets;
}

/** Occurrences retenues : le plus long d'abord, sans chevauchement, aux frontières de mot. */
export function occurrencesDuLexique<T extends { ja: string }>(
  texte: string,
  termes: readonly T[],
): Occurrence<T>[] {
  const entries: MaskEntry<T>[] = termes.map((t) => ({ sources: [t.ja], target: t.ja, value: t }));
  const offsets = utf16Offsets(texte);
  return findOccurrences(texte, entries).map((o) => ({
    debut: offsets[o.start]!,
    fin: offsets[o.end]!,
    terme: o.entry.value,
  }));
}

/**
 * Masque les termes du lexique, en une passe, par des jetons numérotés. Un même terme reçoit un
 * même jeton ; au-delà de `max` termes distincts, les suivants restent en clair (`debordement`).
 * Un terme sans forme française n'est pas masqué.
 */
export function masquerTermes<T extends { ja: string; fr?: string }>(
  texte: string,
  termes: readonly T[],
  options: { max?: number; prefixe?: string; largeur?: number } = {},
): { masque: string; jetons: Map<string, T>; debordement: number } {
  const entries: MaskEntry<T>[] = termes.map((t) => ({
    sources: [t.ja],
    target: t.fr ?? "",
    value: t,
  }));
  const masked = maskText(texte, entries, {
    ...tokenOptions(options.prefixe, options.largeur),
    ...(options.max === undefined ? {} : { maxTokens: options.max }),
  });
  return {
    masque: masked.text,
    jetons: new Map(masked.tokens.map((t) => [t.token, t.entry.value])),
    debordement: masked.overflow,
  };
}

/**
 * Réinjecte les formes françaises à la place des jetons, quelle que soit leur graphie ; un
 * doublon immédiat (« la Terre Zeta003 ») est absorbé. `residuels` liste les jetons restés en
 * clair : l'appelant DOIT faire échouer la planche s'il n'est pas vide.
 */
export function restaurerJetons(
  traduction: string,
  table: Map<string, string>,
  prefixe = PREFIXE_JETON,
  largeur?: number,
): { texte: string; residuels: string[] } {
  const options = tokenOptions(prefixe, largeur);
  const { text } = restoreTokens(traduction, table, options);
  return { texte: text, residuels: findTokens(text, options) };
}

export interface TexteProtege {
  /** Texte à soumettre au modèle, termes du domaine masqués. */
  masque: string;
  /** Jeton → forme française officielle. */
  table: Map<string, string>;
  /** Termes du lexique présents mais non masqués, faute de jetons libres. */
  debordement: number;
}

/** Masque les termes du lexique présents dans le texte (au plus `MAX_TOKENS` termes distincts). */
export function protegerTermes(
  texte: string,
  lexTrie: TermeLexique[],
  options: { prefixe?: string; largeur?: number } = {},
): TexteProtege {
  const { masque, jetons, debordement } = masquerTermes(texte, lexTrie, {
    max: MAX_TOKENS,
    ...options,
  });
  const table = new Map<string, string>();
  for (const [j, t] of jetons) table.set(j, t.fr);
  return { masque, table, debordement };
}

/** Réinjecte les formes françaises (forme simple ; les dépôts préfèrent `restaurerJetons`). */
export function restaurerTermes(traduction: string, table: Map<string, string>): string {
  return restaurerJetons(traduction, table).texte;
}

/**
 * Découpe un texte japonais en segments traduisibles.
 *
 * Les modèles de traduction tronquent au-delà de quelques centaines de tokens,
 * et une planche peut faire 8 171 signes. On coupe aux fins de phrase japonaises
 * (`。`, `！`, `？`) et aux sauts de ligne, jamais au milieu d'une phrase : un
 * segment tronqué se traduit en contresens plutôt qu'en phrase incomplète.
 */
export function segmentsTraduisibles(texte: string, maxSignes = 300): string[] {
  const out: string[] = [];
  let courant = "";
  // Le séparateur est conservé avec le segment qui le précède.
  for (const morceau of texte.split(/(?<=[。！？\n])/)) {
    if (courant.length + morceau.length > maxSignes && courant.trim()) {
      out.push(courant.trim());
      courant = "";
    }
    courant += morceau;
  }
  if (courant.trim()) out.push(courant.trim());
  return out;
}
