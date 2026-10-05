import "server-only";

/**
 * Japonais — point d'entrée.
 *
 * Trois usages, tous adossés aux mêmes ressources :
 *   - **relire** : signaler les fautes de lecture d'une transcription ;
 *   - **lire** : poser un furigana sur les kanji ;
 *   - **chercher** : découper une requête japonaise en mots réels.
 */
export { type Suggestion } from "./anomalies";

import { graphiesJmdict, segmenter } from "./dictionnaire";
import { retenirParFrequence, suggerer, type Suggestion } from "./anomalies";
import { indexLexiqueDomaine, lexiqueDomaine } from "./lexique";
import { contientJaponais, normaliserJa } from "./normalisation";

/**
 * Analyse un ouvrage entier en UNE passe.
 *
 * `anomaliesJaponais` est conçue pour un texte isolé : elle recharge le corpus
 * de référence, le normalise et repart d'un cache d'occurrences vide. L'appeler
 * planche par planche sur un ouvrage de 362 planches refaisait 362 fois le même
 * travail sur les mêmes 325 Kio de texte.
 *
 * Ici le corpus est normalisé une fois, le cache d'occurrences est partagé, et
 * chaque graphie douteuse n'est jugée qu'une seule fois pour tout l'ouvrage —
 * ce qui est de toute façon la bonne granularité : c'est en comparant les
 * fréquences sur l'ensemble que l'on décide si une graphie est fautive.
 */
export async function anomaliesOuvrage(
  pages: { number: number; text: string | null }[],
): Promise<{ total: number; planches: Record<number, Suggestion[]> }> {
  const [jmdict, lex, index] = await Promise.all([
    graphiesJmdict(),
    lexiqueDomaine(),
    indexLexiqueDomaine(),
  ]);

  const corpus = normaliserJa(pages.map((p) => p.text ?? "").join("\n"));
  const cacheOcc = new Map<string, number>();
  const occurrences = (graphie: string): number => {
    const cle = normaliserJa(graphie);
    const vu = cacheOcc.get(cle);
    if (vu !== undefined) return vu;
    const n = cle ? corpus.split(cle).length - 1 : 0;
    cacheOcc.set(cle, n);
    return n;
  };

  // Verdict mémorisé par graphie : la même faute revient d'une planche à
  // l'autre, et la décision ne dépend pas de la planche où on la rencontre.
  const verdicts = new Map<string, Suggestion | null>();
  const planches: Record<number, Suggestion[]> = {};
  let total = 0;

  for (const page of pages) {
    const texte = page.text?.trim();
    if (!texte || !contientJaponais(texte)) continue;
    const trouvees: Suggestion[] = [];
    const vues = new Set<string>();
    for (const t of await segmenter(texte)) {
      if (!t.inconnu || !contientJaponais(t.surface) || vues.has(t.surface)) continue;
      vues.add(t.surface);
      if (jmdict.has(t.surface)) continue;
      let verdict = verdicts.get(t.surface);
      if (verdict === undefined) {
        const s = suggerer(t.surface, lex, index, occurrences);
        verdict = s && retenirParFrequence(s, occurrences) ? s : null;
        verdicts.set(t.surface, verdict);
      }
      if (verdict) trouvees.push(verdict);
    }
    if (trouvees.length > 0) {
      planches[page.number] = trouvees;
      total += trouvees.length;
    }
  }
  return { total, planches };
}
