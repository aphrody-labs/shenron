"use client";

/**
 * Effets des mini-jeux du site. Seuls restent ceux qui RÉPONDENT à un coup joué
 * (onde de choc d'une fusion ou d'un duel, flash de victoire, pop du compteur qui
 * monte) : les auras qui respiraient en boucle et le réacteur décoratif ont été
 * retirés avec la direction artistique « Planche couleur » — aucune animation
 * non déclenchée par le joueur. Tout est neutralisé sous `prefers-reduced-motion`
 * (cf. games.module.css).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./games.module.css";

type ShockColor = "orange" | "yellow" | "blue" | "red" | "green" | "purple";

const SHOCK_RGBA: Record<ShockColor, string> = {
  orange: "rgba(231, 130, 32, 0.6)",
  yellow: "rgba(252, 240, 58, 0.6)",
  blue: "rgba(75, 168, 255, 0.55)",
  red: "rgba(186, 21, 28, 0.6)",
  green: "rgba(46, 155, 65, 0.6)",
  purple: "rgba(168, 85, 247, 0.5)",
};

const FLASH_RGBA: Record<ShockColor, string> = {
  orange: "rgba(231, 130, 32, 0.8)",
  yellow: "rgba(252, 240, 58, 0.8)",
  blue: "rgba(120, 190, 255, 0.8)",
  red: "rgba(186, 21, 28, 0.8)",
  green: "rgba(66, 177, 71, 0.8)",
  purple: "rgba(210, 160, 255, 0.8)",
};

/** Onde de choc + flash déclenchés par changement de `trigger` (clé unique). */
export function KiShock({
  trigger,
  color = "yellow",
  flash = false,
}: {
  trigger: number | string | null;
  color?: ShockColor;
  flash?: boolean;
}) {
  if (trigger === null) return null;
  return (
    <>
      <span
        key={`shock-${trigger}`}
        className={styles.shockwave}
        style={{ "--shock": SHOCK_RGBA[color] } as CSSProperties}
        aria-hidden
      />
      {flash && (
        <span
          key={`flash-${trigger}`}
          className={styles.flash}
          style={{ "--flash": FLASH_RGBA[color] } as CSSProperties}
          aria-hidden
        />
      )}
    </>
  );
}

/**
 * Compteur de puissance : anime un comptage rapide vers `value` et marque d'un
 * pop chaque hausse. Chiffres tabulaires dans la famille du corps (la police
 * « scouter » rendait des glyphes illisibles).
 */
export function PowerLevel({
  value,
  label = "Power level",
  className = "",
}: {
  value: number;
  label?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const [charging, setCharging] = useState(false);
  const prev = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    // Pas de décompte animé pour qui a demandé moins de mouvement : la valeur
    // finale s'affiche d'emblée (le pop `.charge` est neutralisé par le CSS).
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (from === to || reduce) {
      setDisplay(to);
      return;
    }
    setCharging(true);
    const start = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      // easeOutCubic
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        setCharging(false);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);

  return (
    <div className={`px-4 py-2 ${className}`}>
      <p className="mb-0.5 text-[0.75rem] text-white/60">{label}</p>
      <p
        className={`text-2xl font-bold leading-none tabular-nums text-white ${charging ? styles.charge : ""}`}
      >
        {display.toLocaleString("fr-FR")}
      </p>
    </div>
  );
}
