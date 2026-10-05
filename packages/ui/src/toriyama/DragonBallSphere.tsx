/**
 * DragonBallSphere — variante interactive de `<DragonBall>` (halo, survol).
 * Même géométrie, même palette : tout vient de `toriyama-svg/sphere`.
 */

import { useId, type SVGProps } from "react";
import {
  SPHERE_DEGRADE,
  SPHERE_ENCRE,
  SPHERE_FOYER,
  SPHERE_R_EXT,
  SPHERE_R_INT,
  SPHERE_ROUGE_ETOILE,
  etoilesSphere,
  nombreEtoiles,
  type DragonBallStars,
} from "../toriyama-svg/sphere";

export type DragonBallStarsCount = DragonBallStars;

export interface DragonBallSphereProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  stars?: DragonBallStarsCount;
  size?: number | string;
  glow?: boolean;
  interactive?: boolean;
  title?: string;
  decorative?: boolean;
}

export function DragonBallSphere({
  stars = 4,
  size = 64,
  glow = false,
  interactive = false,
  className = "",
  title,
  decorative = false,
  ...props
}: DragonBallSphereProps) {
  const n = nombreEtoiles(stars);
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : {
        role: "img" as const,
        "aria-label": title ?? `Dragon Ball à ${n} étoile${n > 1 ? "s" : ""}`,
      };

  const id = useId().replace(/:/g, "");
  const gradId = `dbs-grad-${n}-${id}`;
  const glowFilterId = `dbs-glow-${id}`;

  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={`inline-block shrink-0 transition-transform select-none ${
        interactive ? "hover:scale-105 active:scale-95 cursor-pointer" : ""
      } ${className}`}
      style={{
        filter: glow
          ? `url(#${glowFilterId}) drop-shadow(0 0 12px rgba(255,183,3,0.6))`
          : undefined,
      }}
      {...a11y}
      {...props}
    >
      <defs>
        <radialGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          cx={SPHERE_R_EXT}
          cy={SPHERE_R_EXT}
          r={SPHERE_R_INT}
          fx={SPHERE_FOYER.x}
          fy={SPHERE_FOYER.y}
        >
          {SPHERE_DEGRADE.map(([offset, couleur]) => (
            <stop key={offset} offset={offset} stopColor={couleur} />
          ))}
        </radialGradient>
        {glow && (
          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        )}
      </defs>

      {/* Black ink border disk */}
      <circle cx={SPHERE_R_EXT} cy={SPHERE_R_EXT} r={SPHERE_R_EXT} fill={SPHERE_ENCRE} />
      {/* Amber gradient crystal core */}
      <circle cx={SPHERE_R_EXT} cy={SPHERE_R_EXT} r={SPHERE_R_INT} fill={`url(#${gradId})`} />

      {/* Crimson sharp stars */}
      {etoilesSphere(n).map((points, i) => (
        <polygon key={i} points={points} fill={SPHERE_ROUGE_ETOILE} />
      ))}
    </svg>
  );
}
