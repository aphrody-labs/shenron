/** Horloge et identifiants aléatoires hors du rendu : appelés depuis un événement ou un rendu serveur dynamique. */

/** Instant courant en millisecondes. */
export function nowMs(): number {
  return Date.now();
}

/** Date courante. */
export function nowDate(): Date {
  return new Date();
}

/** Identifiant court aléatoire (non cryptographique). */
export function randomId(): string {
  return Math.random().toString(36).slice(2);
}

/** Vrai si la date saisie (chaîne parsable) est postérieure à l'instant courant. */
export function isFuture(value: string): boolean {
  return new Date(value) > new Date();
}
