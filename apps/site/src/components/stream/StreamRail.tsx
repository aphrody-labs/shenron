"use client";

/**
 * StreamRail — rail horizontal façon plateforme de streaming (Netflix-like).
 *
 * Conteneur scroll-snap horizontal + flèches gauche/droite qui n'apparaissent
 * qu'au survol ET quand il reste du contenu à défiler, + dégradés de bord pour
 * signaler l'overflow. Les CARTES (children) sont rendues côté SERVEUR (SEO +
 * cache CDN) et passées ici : seul le contrôle de défilement est client. Aucun
 * cookie/session → cache préservé.
 *
 * Le défilement clavier/tactile natif marche déjà (overflow-x-auto) ; les flèches
 * ne sont qu'un confort souris. `scrollBy` d'environ 85 % de la largeur visible.
 */
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDroite, ChevronGauche } from "@aphrody/shenron-ui/icones";

export function StreamRail({
  children,
  ariaLabel,
  className = "",
  listClassName = "",
  previousLabel = "Défiler vers la gauche",
  nextLabel = "Défiler vers la droite",
  controls = "hover",
}: {
  children: React.ReactNode;
  ariaLabel?: string;
  className?: string;
  listClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
  /** Keep the controls above the cards for touch and keyboard discovery. */
  controls?: "hover" | "always";
}) {
  const ref = useRef<HTMLUListElement>(null);
  const gaucheRef = useRef<HTMLButtonElement>(null);
  const droiteRef = useRef<HTMLButtonElement>(null);
  // Direction de la dernière flèche pressée : elle seule peut se désactiver
  // sous le focus, en atteignant l'extrémité vers laquelle elle défile.
  const flechePressee = useRef<-1 | 1 | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const itemCount = Children.count(children);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft >= max - 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    // Re-mesure quand la LARGEUR VISIBLE du rail change (redimensionnement de
    // la fenêtre, rotation, ouverture d'un panneau) : `clientWidth` bouge, donc
    // la marge de défilement restante aussi. La croissance du contenu, elle, ne
    // déclenche rien ici — l'observateur ne voit que la boîte du conteneur — et
    // n'a pas à le faire : les cartes ont une largeur fixe, `scrollWidth` est
    // donc déjà juste avant que les vignettes n'aient peint.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- content changes can alter scrollWidth without resizing the rail viewport
  }, [update, itemCount]);

  // Atteindre une extrémité DÉSACTIVE la flèche qu'on vient de presser : le
  // navigateur rend alors le focus à `<body>`, et la tabulation suivante repart
  // du haut du document — au milieu d'une page qui aligne quatre rails, on perd
  // complètement sa place. On le rattrape sur la flèche opposée, restée active.
  useEffect(() => {
    const dir = flechePressee.current;
    if (dir === null) return;
    // La flèche pressée est toujours active : rien à rattraper (encore).
    if (dir === -1 ? !atStart : !atEnd) return;
    flechePressee.current = null;
    const actif = document.activeElement;
    if (actif && actif !== document.body) return;
    (dir === -1 ? droiteRef : gaucheRef).current?.focus({ preventScroll: true });
  }, [atStart, atEnd]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    flechePressee.current = dir;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={`group/rail relative ${className}`}>
      {/* Dégradés de bord (masqués aux extrémités) */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-dbz-bg to-transparent transition-opacity duration-300 ${
          atStart ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-dbz-bg to-transparent transition-opacity duration-300 ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />

      <div className={controls === "always" ? "mb-3 flex justify-end gap-2" : "contents"}>
        <button
          ref={gaucheRef}
          type="button"
          aria-label={previousLabel}
          onClick={() => scrollByPage(-1)}
          disabled={atStart}
          className={
            controls === "always"
              ? "grid size-11 place-items-center rounded-xl border border-dbz-border bg-dbz-card text-os transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-gold disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"
              : `absolute left-1 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/70 text-white backdrop-blur transition-all duration-200 hover:border-dbz-orange hover:bg-dbz-orange hover:text-black ${
                  atStart
                    ? "pointer-events-none opacity-0"
                    : "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/rail:pointer-events-auto group-hover/rail:opacity-100"
                }`
          }
        >
          <ChevronGauche className="h-6 w-6" aria-hidden="true" />
        </button>
        {/* Flèche droite */}
        <button
          ref={droiteRef}
          type="button"
          aria-label={nextLabel}
          onClick={() => scrollByPage(1)}
          disabled={atEnd}
          className={
            controls === "always"
              ? "grid size-11 place-items-center rounded-xl border border-dbz-border bg-dbz-card text-os transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-gold disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none"
              : `absolute right-1 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/70 text-white backdrop-blur transition-all duration-200 hover:border-dbz-orange hover:bg-dbz-orange hover:text-black ${
                  atEnd
                    ? "pointer-events-none opacity-0"
                    : "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/rail:pointer-events-auto group-hover/rail:opacity-100"
                }`
          }
        >
          <ChevronDroite className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>

      <ul
        ref={ref}
        onScroll={update}
        // Le preflight Tailwind pose `list-style: none`, ce qui fait perdre le
        // rôle `list` sous VoiceOver/Safari : l'`aria-label` du rail se
        // retrouverait sur un élément générique, donc jamais annoncé.

        aria-label={ariaLabel}
        className={`no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${listClassName}`}
      >
        {Children.map(children, (child) => (
          <li className="shrink-0 snap-start">{child}</li>
        ))}
      </ul>
    </div>
  );
}
