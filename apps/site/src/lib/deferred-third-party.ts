"use client";

/**
 * Déclencheur partagé pour les scripts tiers (GTM, AdSense, CMP).
 *
 * Ces scripts pesaient ~250 Kio de JS inutilisé et gonflaient le TBT sur le
 * chemin critique. Ils démarrent maintenant à la première interaction réelle
 * (pointeur, clavier, tactile, défilement) ou, à défaut, quand le navigateur est
 * au repos après `load` (plafond `IDLE_FALLBACK_MS`). Le consentement n'est pas
 * contourné : le Consent Mode v2 reste initialisé à `denied` dans `<head>` et le
 * CMP certifié d'AdSense, chargé avec le script, garde la main sur le recueil.
 *
 * Un seul déclencheur par page : tous les appelants partagent la même promesse,
 * donc GTM, AdSense et la bannière de repli (`ConsentGate`) restent synchronisés.
 */

export const IDLE_FALLBACK_MS = 4000;

const INTERACTION_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const;

let trigger: Promise<void> | null = null;

/** Résout à la première interaction, ou au repos après `load`. Jamais côté serveur. */
export function afterInteractionOrIdle(): Promise<void> {
  if (typeof window === "undefined") return new Promise(() => {});
  if (trigger) return trigger;
  trigger = new Promise<void>((resolve) => {
    let done = false;
    const timers: number[] = [];
    const finish = () => {
      if (done) return;
      done = true;
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, finish);
      for (const id of timers) window.clearTimeout(id);
      resolve();
    };
    for (const type of INTERACTION_EVENTS) {
      window.addEventListener(type, finish, { once: true, passive: true });
    }
    const scheduleIdle = () => {
      timers.push(
        window.setTimeout(() => {
          if ("requestIdleCallback" in window) {
            window.requestIdleCallback(finish, { timeout: 1500 });
          } else {
            finish();
          }
        }, IDLE_FALLBACK_MS),
      );
    };
    if (document.readyState === "complete") scheduleIdle();
    else window.addEventListener("load", scheduleIdle, { once: true });
  });
  return trigger;
}
