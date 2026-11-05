/**
 * Titres de page : le gabarit du layout racine ajoute ` — DBFR` (7 caracteres).
 * Au-dela de 70 caracteres au total, les moteurs tronquent eux-memes, souvent
 * en plein mot. On tronque donc ici, proprement, la partie variable (`head`) et
 * on conserve le suffixe d'identification (`tail`, ex. ` — Dragon Ball Z`).
 */
export const TITLE_MAX = 70;
const TEMPLATE_SUFFIX_LENGTH = " — DBFR".length;
const MIN_HEAD = 20;

export function clampTitle(head: string, tail = ""): string {
  const budget = TITLE_MAX - TEMPLATE_SUFFIX_LENGTH;
  const clean = head.replace(/\s+/g, " ").trim();
  if (clean.length + tail.length <= budget) return `${clean}${tail}`;
  // Suffixe trop long pour laisser une tete lisible : on le sacrifie.
  const room = budget - tail.length >= MIN_HEAD ? budget - tail.length : budget;
  const keptTail = room === budget ? "" : tail;
  if (clean.length <= room) return `${clean}${keptTail}`;
  const slice = clean.slice(0, room - 1);
  const space = slice.lastIndexOf(" ");
  const cut = space >= MIN_HEAD / 2 ? slice.slice(0, space) : slice;
  return `${cut.replace(/[\s,;:.!?\-–—(（「«]+$/u, "")}…${keptTail}`;
}
