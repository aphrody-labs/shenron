// SPDX-License-Identifier: Apache-2.0

/**
 * Slugs — source canonique du domaine Shenron (module pur, aucune dépendance).
 *
 * Normalise un texte libre en slug URL standardisé : minuscules, accents dépliés,
 * tout ce qui n'est pas `[a-z0-9]` remplacé par un tiret, tirets de bord supprimés.
 */

/** Longueur max par défaut d'un slug (garde les URL lisibles et partageables). */
const SLUG_MAX_LENGTH = 80;

/**
 * Retire les diacritiques latins (bloc « Combining Diacritical Marks ») :
 * é→e, ç→c, ñ→n. Le texte est recomposé (NFC) ensuite, si bien que les
 * marques sonores japonaises (が, ぱ) restent intactes.
 */
export function stripDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/**
 * Forme de comparaison d'un texte libre : sans diacritiques, en minuscules,
 * espaces (y compris l'espace idéographique) compactés et rognés. La
 * ponctuation et les écritures non latines sont conservées.
 */
export function foldText(input: string): string {
  return stripDiacritics(input).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Clé d'appariement ASCII : sans diacritiques, en minuscules, chaque suite de
 * caractères hors `[a-z0-9]` remplacée par `separator` (espace par défaut),
 * séparateurs de bord retirés. `foldKey("Kaméhaméha !", "")` → `"kamehameha"`.
 * Un texte sans lettre latine ni chiffre donne `""`.
 */
export function foldKey(input: string, separator = " "): string {
  const key = stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator);
  if (!separator) return key;
  // Les suites sont déjà compactées : au plus un séparateur à chaque bord.
  const start = key.startsWith(separator) ? separator.length : 0;
  const end =
    key.length > start && key.endsWith(separator) ? key.length - separator.length : key.length;
  return key.slice(start, end);
}

/**
 * Normalise un texte libre en slug URL : minuscules, accents dépliés, tout ce
 * qui n'est pas `[a-z0-9]` remplacé par un tiret, tirets de bord supprimés.
 *
 * La coupe finale se fait **sur un tiret** quand c'est possible, pour ne pas
 * tronquer un mot au milieu (`.../transformation-du-super-saiy` → `.../transformation-du-super`).
 */
export function slugify(input: string, maxLength: number = SLUG_MAX_LENGTH): string {
  // Les apostrophes ne deviennent PAS un tiret : « l'aube » → « laube », pas « l-aube ».
  const base = foldKey(input.replace(/['’]/g, ""), "-");

  if (base.length <= maxLength) return base;
  const cut = base.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  // On ne coupe sur le tiret que s'il reste un slug substantiel (> 60 % du max),
  // sinon on garde la troncature brute plutôt que de produire un slug trop court.
  return (lastDash > maxLength * 0.6 ? cut.slice(0, lastDash) : cut).replace(/-+$/g, "");
}

/**
 * Vérifie qu'un slug saisi à la main est utilisable tel quel (l'admin peut
 * vouloir un slug court et maîtrisé, différent du titre).
 */
export function isValidSlug(slug: string, maxLength: number = SLUG_MAX_LENGTH): boolean {
  return slug.length > 0 && slug.length <= maxLength && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Rend un slug unique au sein d'un ensemble déjà pris, en suffixant `-2`, `-3`…
 *
 * `taken` contient les slugs existants ; il doit EXCLURE celui de l'entité en
 * cours d'édition, sinon renommer un article incrémenterait son propre suffixe
 * à chaque sauvegarde.
 */
export function uniqueSlug(
  desired: string,
  taken: Iterable<string>,
  maxLength: number = SLUG_MAX_LENGTH,
): string {
  const used = new Set(taken);
  const base = slugify(desired, maxLength) || "article";
  if (!used.has(base)) return base;

  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    // On tronque la base pour que `base+suffix` tienne dans maxLength.
    const candidate = `${base.slice(0, maxLength - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  // Repli improbable : horodatage (unique par construction).
  return `${base.slice(0, maxLength - 7)}-${Date.now().toString(36)}`;
}
