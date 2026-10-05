"use client";

import { useEffect, useState } from "react";

/**
 * Filet de progression de lecture, en haut de l'article.
 *
 * Mouvement réduit respecté (`motion-reduce`) : la barre suit le défilement
 * sans animation intermédiaire. Elle ne capte aucun clic (`pointer-events-none`)
 * et se pose sous la zone sûre du haut sur les écrans à encoche.
 *
 * Îlot client volontairement minuscule : il ne lit ni session ni cookie, donc la
 * page article reste entièrement cacheable côté CDN (cf. la règle « pas de
 * session dans le rendu » de CLAUDE.md).
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      // Hauteur réellement défilable : sur un article court, elle peut être
      // nulle — on évite alors la division par zéro (barre laissée à 0).
      const scrollable = doc.scrollHeight - doc.clientHeight;
      setProgress(scrollable > 0 ? Math.min(1, doc.scrollTop / scrollable) : 0);
    };

    update();
    // `passive` : le handler ne fait que lire, il ne doit pas retarder le scroll.
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      className="ed-no-print pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top,0px)] z-50 h-[3px] bg-transparent"
      role="progressbar"
      aria-label="Progression de lecture"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full origin-left bg-[color:var(--ed-accent)] transition-transform duration-75 ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
