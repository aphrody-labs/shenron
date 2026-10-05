/**
 * Commandes du 2048 — fonctions pures, partagées par le balayage (Pointer Events),
 * le clavier et les boutons directionnels, et testées sans DOM.
 */

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export const DIRECTIONS: readonly Direction[] = ["UP", "LEFT", "DOWN", "RIGHT"];

/** Distance minimale (px) d'un balayage : en dessous, c'est un appui, pas un coup. */
export const SWIPE_THRESHOLD = 30;

const KEYS: Record<string, Direction> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
};

/** Flèche du clavier → direction ; toute autre touche → `null`. */
export function directionFromKey(key: string): Direction | null {
  return KEYS[key] ?? null;
}

/**
 * Déplacement du pointeur entre l'appui et le relâchement → direction dominante,
 * ou `null` si le geste reste sous le seuil (simple toucher, tremblement du doigt).
 */
export function directionFromSwipe(
  dx: number,
  dy: number,
  threshold = SWIPE_THRESHOLD,
): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "RIGHT" : "LEFT";
  return dy > 0 ? "DOWN" : "UP";
}
