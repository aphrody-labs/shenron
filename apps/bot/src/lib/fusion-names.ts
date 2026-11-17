// SPDX-License-Identifier: Apache-2.0
/**
 * Façade de compatibilité vers @aphrody/shenron-config/fusion-names.
 */
export {
  findCanonicalFusion,
  generateFusionName,
  fusionName,
} from "@aphrody/shenron-config/fusion-names";

/** `0.1` → `+10 %` */
function percentBonus(ratio: number): string {
  return `+${(ratio * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/**
 * Parts de fusion réellement versées au partenaire (réglages
 * `xp.fusion.bonus_ratio` et `zeni.fusion.bonus_ratio`), au lieu du
 * « +10 % » écrit en dur dans chaque écran.
 */
export function fusionBonusLabel(r: { xp: number; zeni: number }): string {
  return r.xp === r.zeni
    ? `${percentBonus(r.xp)} XP & Zénis partagés`
    : `${percentBonus(r.xp)} XP · ${percentBonus(r.zeni)} Zénis partagés`;
}
