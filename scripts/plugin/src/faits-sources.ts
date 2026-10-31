/**
 * Modules purs du dépôt dont `scripts/plugin/faits.ts` tire la référence
 * publique sourcée du plugin. Empaqueté puis importé par le générateur (jamais
 * livré tel quel) : aucun de ces modules n'ouvre de base ni de réseau.
 */
export {
  BOOK_LABELS,
  DIVERGENCES,
  TECHNIQUES,
} from "../../../apps/site/scripts/_technique-lexicon";
export {
  DEFAULT_CANON_CONFIG,
  DEFAULT_POWER_SCALING_CONFIG,
} from "../../../apps/site/src/lib/canon-engine";
export {
  CANON_INFLATION_FACTOR,
  CANON_PRICES,
  ZENI_YEN_PARITY,
} from "@aphrody/shenron-config/economy-canon";
export { DOCUMENTS, REFUSÉ } from "@aphrody/shenron-config/aphrody-corpus";
