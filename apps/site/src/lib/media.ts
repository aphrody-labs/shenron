/**
 * Helpers médias PURS et client-safe (aucun import server) — partagés par les
 * pages films/épisodes/chronologie et leurs modales d'aperçu.
 */

/**
 * Retire les mentions de source du dataset (« (Source : ANN) », « [Écrit par
 * MAL Rewrite] », « (Sources: Wikipédia) »…) en fin de synopsis. Boucle pour les
 * balises empilées. À appliquer AUSSI aux épisodes (pas seulement aux films).
 */
export function stripSourceTags(s: string | null | undefined): string | null {
  if (!s) return s ?? null;
  let out = s;
  // Retire les sections markdown de galerie/extrait ajoutées en fin de fiche
  // (« ## Images officielles… », « ## Extrait animé… ») et les images markdown.
  out = out.replace(/\n+##\s+[\s\S]*$/m, "");
  out = out.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  // Retire les paragraphes de pied de source éditoriale (« [Synopsis et images officiels…](…) », « [Netflix — …](…) »).
  out = out.replace(
    /\n+\[(?:Synopsis et images officiels|Netflix\s*[—-]|Regards sur|Réserves sur|Discussion sur)[^\n]*$/gi,
    "",
  );
  // Déplie les liens et emphases markdown inline pour un rendu texte propre en carte/bannière.
  out = out.replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]+\)/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/(^|[\s(«"'])([*_])([^*\n_]+)\2(?=[\s).,;:!?»"']|$)/g, "$1$3");
  let prev: string;
  do {
    prev = out;
    // Emphase markdown optionnelle autour du parenthétique : `_(Source : Kitsu.)_`,
    // `*(…)*`, `**(…)**` ou nu `(…)`. Ancré en fin de chaîne.
    out = out.replace(
      /\s*[_*]{0,2}\s*[([]\s*(?:sources?|écrit par)[^)\]]*[)\]]\s*[_*]{0,2}\s*$/i,
      "",
    );
  } while (out !== prev);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

type Player = { lang?: "vf" | "vostfr" | "vost" };

/**
 * Disponibilité VF/VOSTFR depuis la colonne jsonb `players`. **Garde
 * `Array.isArray`** : `players` peut être un scalaire corrompu (piège jsonb
 * documenté) — `(x ?? []).some` planterait alors tout le rendu (500 films,
 * notFound chronologie, erreur streamée post-shell épisodes). Ici : dégradation
 * silencieuse (pas de badge) plutôt que crash.
 */
export function langBadges(players: unknown): {
  hasVf: boolean;
  hasVostfr: boolean;
  hasVost: boolean;
} {
  const arr = Array.isArray(players) ? (players as Player[]) : [];
  return {
    hasVf: arr.some((p) => p?.lang === "vf"),
    hasVostfr: arr.some((p) => p?.lang === "vostfr"),
    hasVost: arr.some((p) => p?.lang === "vost"),
  };
}
