"use client";

/**
 * Reveal — apparition au scroll et mise en pause hors écran, en un seul observateur.
 *
 * Deux effets, une seule `IntersectionObserver` par élément :
 *  - `data-vie-seen="true"` : posé UNE fois quand l'élément entre dans l'écran ;
 *    les classes `.vie-reveal` (opacity + translate) s'y accrochent ;
 *  - `data-vie-live="true|false"` : suit la visibilité ; les animations infinies
 *    des décors (`.vie-art`) restent en pause tant qu'il vaut `false`.
 *
 * Sans JavaScript, le contenu reste visible et statique : rien n'est masqué tant
 * que l'attribut `data-vie-armed` n'a pas été posé après l'hydratation, et un
 * élément déjà à l'écran n'est jamais masqué (pas de clignotement, pas de CLS :
 * seuls opacity et transform bougent).
 */
import { useEffect, useRef, type ElementType, type HTMLAttributes, type ReactNode } from "react";

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  /** Retard d'apparition en ms (échelonner une grille). */
  delay?: number;
  children?: ReactNode;
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  style,
  children,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      el.dataset.vieSeen = "true";
      el.dataset.vieLive = "false";
      return;
    }
    const rect = el.getBoundingClientRect();
    const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
    if (onScreen) el.dataset.vieSeen = "true";
    el.dataset.vieArmed = "true";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          el.dataset.vieLive = e.isIntersecting ? "true" : "false";
          if (e.isIntersecting) el.dataset.vieSeen = "true";
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`vie-reveal ${className}`}
      style={delay ? { ...style, transitionDelay: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
