// SPDX-License-Identifier: Apache-2.0
/** Client-safe palette editor metadata; shared values come from config. */
import type { ThemeColorKey } from "@shenron/config/site-theme";
export * from "@shenron/config/site-theme";

export interface ThemeColorMeta {
  key: ThemeColorKey;
  label: string;
  hint: string;
}

/** Métadonnées d'édition (libellés FR + aide). */
export const THEME_COLORS: readonly ThemeColorMeta[] = [
  { key: "orange", label: "Accent doré", hint: "Couleur signature (boutons, liens, titres)" },
  { key: "yellow", label: "Accent secondaire", hint: "Alias doré (HUD, eyebrows)" },
  { key: "red", label: "Rouge énergie", hint: "Accents ki / alertes" },
  { key: "bg", label: "Fond", hint: "Arrière-plan profond du site" },
  { key: "card", label: "Surface", hint: "Cartes et panneaux élevés" },
  { key: "border", label: "Bordure", hint: "Filets et séparateurs" },
  { key: "blue", label: "Bleu profond", hint: "Navy secondaire" },
  { key: "blueLight", label: "Gris clair", hint: "Texte secondaire clair" },
  { key: "orangeDark", label: "Doré foncé", hint: "État pressé des boutons" },
  { key: "ember", label: "Orange braise", hint: "Halos, sunburst, dégradé galactique" },
  { key: "ki", label: "Bleu ki", hint: "LED, halos de planètes, effets d'énergie" },
  { key: "amber", label: "Ambre", hint: "Dégradés et texte des boutons fantômes" },
];
