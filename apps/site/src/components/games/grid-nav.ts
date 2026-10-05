/**
 * Navigation clavier d'un plateau carré (morpion 3×3) en `tabIndex` tournant :
 * un seul arrêt de tabulation pour tout le plateau, les flèches déplacent le
 * focus de case en case, `Début`/`Fin` vont aux bords de la ligne. Pas de
 * bouclage : au bord, la case reste la même (comportement d'une grille ARIA).
 *
 * Fonction pure : renvoie l'index cible, ou `null` si la touche ne concerne pas
 * la navigation (l'appelant laisse alors l'événement suivre son cours).
 */
export function nextGridIndex(current: number, key: string, size = 3): number | null {
  const row = Math.floor(current / size);
  const col = current % size;
  switch (key) {
    case "ArrowRight":
      return row * size + Math.min(size - 1, col + 1);
    case "ArrowLeft":
      return row * size + Math.max(0, col - 1);
    case "ArrowDown":
      return Math.min(size - 1, row + 1) * size + col;
    case "ArrowUp":
      return Math.max(0, row - 1) * size + col;
    case "Home":
      return row * size;
    case "End":
      return row * size + size - 1;
    default:
      return null;
  }
}
