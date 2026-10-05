// SPDX-License-Identifier: Apache-2.0
/**
 * Moteur de masquage canonique et protection du vocabulaire Dragon Ball.
 *
 * Adaptateur historique de `@shenron/lexicon` (règles partagées avec le crate Rust
 * `shenron-lexicon`). Implémente la doctrine de `dragon-ball-japonais/SKILL.md` :
 * 1. Détection des termes canoniques triés du plus long au plus court.
 * 2. Substitution par des marqueurs neutres latins (`Zeta001`, `Yuni002`...).
 * 3. Traduction par le modèle / agent.
 * 4. Réinjection des formes officielles françaises du wiki / canon.
 * 5. Contrôle qualité de conformité (anti-régression, seuil de japonais, absence de glose).
 */

import { LEGACY_KIND, type LegacyEntry, type Term } from "@shenron/lexicon";
import { lexicon } from "@shenron/lexicon/data";
import { intraduisible, refus } from "../databooks-traduction";
import { masquerTermes, PREFIXE_JETON, restaurerJetons } from "./traduction";

/** Ligne du lexique historique (`data/lexique-db-canonique.json`, dérivé de `data/lexicon/terms.json`). */
export type LexiqueEntry = LegacyEntry;

export interface MasquageResult {
  texteMasque: string;
  termesTrouves: Array<{
    token: string;
    ja: string;
    fr: string;
    kind: string;
  }>;
  tokenMap: Map<string, { ja: string; fr: string; kind: string }>;
}

/**
 * Le lexique canonique (`@shenron/lexicon/data`) sous sa forme historique : une ligne par
 * graphie japonaise, du plus long au plus court.
 */
export function chargerLexiqueCanonique(): LexiqueEntry[] {
  return lexicon().legacyEntries();
}

const asLegacy = (term: Term) => ({ ja: term.ja, fr: term.fr, kind: LEGACY_KIND[term.kind] });

/**
 * Masque les entités Dragon Ball dans un texte japonais avec des jetons neutres : le plus long
 * d'abord, en une passe, sans chevauchement, aux frontières de mot pour le katakana (« セル » ne
 * mord plus dans « カプセルコーポレーション »). Sans `lexique`, le lexique canonique entier
 * (graphies et alias japonais) vers le français.
 */
export function masquerVocabulaire(
  texteJa: string,
  options?: {
    lexique?: LexiqueEntry[];
    prefixeToken?: string;
  },
): MasquageResult {
  const prefixe = options?.prefixeToken ?? PREFIXE_JETON;
  const jetons = new Map<string, { ja: string; fr: string; kind: string }>();
  let masque: string;
  if (options?.lexique) {
    const r = masquerTermes(texteJa, options.lexique, { prefixe });
    masque = r.masque;
    for (const [token, entry] of r.jetons)
      jetons.set(token, { ja: entry.ja, fr: entry.fr, kind: entry.kind });
  } else {
    const r = lexicon().mask(texteJa, "fr", { prefix: prefixe });
    masque = r.text;
    for (const t of r.tokens) jetons.set(t.token, asLegacy(t.entry.value));
  }
  const termesTrouves = [...jetons].map(([token, e]) => ({ token, ...e }));
  return { texteMasque: masque, termesTrouves, tokenMap: jetons };
}

/**
 * Démasque en rendant aussi les jetons non restaurés. Une planche dont
 * `residuels` n'est pas vide ne doit JAMAIS être déposée (« Zêta010 »).
 */
export function demasquerVocabulaireStrict(
  texteTraduit: string,
  tokenMap: Map<string, { ja: string; fr: string; kind: string }>,
  prefixe = PREFIXE_JETON,
): { texte: string; residuels: string[] } {
  const table = new Map<string, string>();
  for (const [token, info] of tokenMap) table.set(token, info.fr);
  const { texte, residuels } = restaurerJetons(texteTraduit, table, prefixe);
  return { texte: texte.trim(), residuels };
}

/**
 * Démasque le texte traduit en réinjectant les termes officiels français.
 *
 * Tolère la casse, les accents et un séparateur (« Zêta010 », « ZETA 010 »).
 * Les jetons inconnus restent en clair : le juge de dépôt
 * (`jugerTraduction`, `_databooks-base.ts`) refuse alors la planche.
 */
export function demasquerVocabulaire(
  texteTraduit: string,
  tokenMap: Map<string, { ja: string; fr: string; kind: string }>,
): string {
  return demasquerVocabulaireStrict(texteTraduit, tokenMap).texte;
}

/**
 * Vérifie l'éligibilité d'un texte japonais à être traduit.
 */
export function verifierTexteSource(texteJa: string): { traduisible: boolean; raison?: string } {
  const anomalie = intraduisible(texteJa);
  if (anomalie) {
    return { traduisible: false, raison: anomalie };
  }
  return { traduisible: true };
}

/**
 * Vérifie la qualité et conformité de la traduction finale française.
 */
export function verifierConformiteTraduction(
  texteFr: string,
  texteJa: string,
): { valide: boolean; rejet?: string } {
  const defaut = refus(texteFr, texteJa);
  if (defaut) {
    return { valide: false, rejet: defaut };
  }
  return { valide: true };
}
