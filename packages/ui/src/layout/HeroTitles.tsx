import type { ReactNode } from "react";

/**
 * Le bloc titre du site — **une seule source** pour les deux en-têtes.
 *
 * `PageHero` (bandeau pleine largeur, encyclopédie) et `PageHeader` (en-tête
 * interne, rubriques communautaires) rendaient jusqu'ici deux typographies
 * sans rapport : d'un côté l'accent orange + titre d'affichage des couvertures
 * Daizenshuu, de l'autre un titre jaune centré avec ombre portée décalée de
 * 4 px et halo bleu — le style des habillages de fan-site des années 2000.
 * Deux identités sur un même site, c'est zéro identité.
 *
 * Trois régimes, et un seul choix à faire à l'appel :
 *  - `plain` — `font-title` (corps à wght 850, ROND 100), casse normale, blanc. Le régime par défaut.
 *  - `image` — capitales dorées : elles ne servent qu'à tenir la lisibilité
 *    par-dessus une photo. Hors de ce cas, elles ne font que crier.
 *  - `compact` — même grammaire, une taille en dessous (pages de jeu, vues
 *    imbriquées).
 */
export function HeroTitles({
  eyebrow,
  title,
  titleJa,
  titleRomaji,
  lead,
  regime = "plain",
}: {
  /** Nœud, pas chaîne : un sur-titre peut venir du dictionnaire (`<T>`). */
  eyebrow?: ReactNode;
  title: ReactNode;
  titleJa?: ReactNode;
  titleRomaji?: ReactNode;
  lead?: ReactNode;
  regime?: "plain" | "image" | "compact";
}) {
  return (
    <>
      {eyebrow && (
        <p className="font-display font-semibold text-[12px] tracking-[0.18em] uppercase text-dbz-orange mb-3 inline-flex items-center gap-3">
          <span aria-hidden className="w-7 h-px bg-dbz-orange/70" />
          {eyebrow}
        </p>
      )}
      <h1
        className={
          regime === "image"
            ? "font-saiyan font-bold uppercase text-[clamp(2.125rem,1.5rem+3.2vw,3.625rem)] leading-[1.02] tracking-[0.01em] title-gold mb-3 text-balance"
            : regime === "compact"
              ? "font-title text-[clamp(1.625rem,1.3rem+1.6vw,2.375rem)] leading-[1.1] text-white mb-2 text-balance"
              : "font-title text-[clamp(2rem,1.35rem+3.2vw,3.5rem)] leading-[1.05] text-white mb-3 text-balance break-words"
        }
      >
        {title}
      </h1>
      {(titleJa || titleRomaji) && (
        <div className="flex items-center flex-wrap gap-2.5 mb-3 text-white/70">
          {titleJa && (
            <span
              lang="ja"
              className="font-jp text-sm md:text-base font-semibold tracking-wider text-dbz-orange"
            >
              {titleJa}
            </span>
          )}
          {titleJa && titleRomaji && <span className="text-white/30 text-xs select-none">·</span>}
          {titleRomaji && (
            <span className="font-scouter text-[11px] uppercase tracking-[0.16em] text-white/60">
              {titleRomaji}
            </span>
          )}
        </div>
      )}
      {lead && (
        <p
          className={`leading-relaxed text-white/85 max-w-xl ${
            regime === "compact" ? "text-[15px]" : "text-[16px] md:text-[17px]"
          }`}
        >
          {lead}
        </p>
      )}
    </>
  );
}
