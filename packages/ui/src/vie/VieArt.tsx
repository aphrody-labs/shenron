/**
 * VieArt — les scènes décoratives des pages (en-têtes, états vides, 404).
 *
 * Aucune forme nouvelle : chaque scène assemble des objets dont la géométrie est
 * déjà mesurée et maintenue dans `toriyama-svg/` (cf. `docs/design/vie-illustrations.md`) :
 *  - `spheres` : les sept boules de cristal (couverture du tome 1, `sphere.ts`) ;
 *  - `kinto`   : le Kinto-Un (`kinto-un.ts`) sur une gerbe de lignes de vitesse ;
 *  - `senzu`   : trois senzu (`senzu.ts`) ;
 *  - `ki`      : l'étoile de couverture (`couverture.ts`) dans une gerbe radiale.
 * La gerbe est `radialSpeedlines` (`geometry.ts`), des segments à trait fin : aucun
 * objet inventé (radar, capsule, tampon… refusés faute de relevé).
 *
 * Décor pur : `aria-hidden`, jamais d'information portée. Les animations
 * (`.vie-float`, `.vie-twinkle`) ne tournent qu'à l'écran et sont coupées sous
 * `prefers-reduced-motion` (cf. `vie.css`, `Reveal`).
 */
import { KintoUnCloud } from "../toriyama/KintoUnCloud";
import { DragonBall } from "../toriyama/DragonBall";
import { SenzuBean } from "../toriyama/SenzuBean";
import { Etoile } from "../toriyama/MotifsCouverture";
import { radialSpeedlines } from "../toriyama-svg/geometry";
import { Reveal } from "./Reveal";

export type VieArtKind = "spheres" | "kinto" | "senzu" | "ki";

export const VIE_ART_KINDS: readonly VieArtKind[] = ["spheres", "kinto", "senzu", "ki"];

/** Gerbe de lignes de vitesse : segments à trait fin, couleur du texte porteur. */
function Burst({ size, count = 28 }: { size: number; count?: number }) {
  const c = size / 2;
  const d = radialSpeedlines(c, c, size * 0.2, size * 0.48, count).join(" ");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden
      className="absolute inset-0 m-auto opacity-30"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  );
}

const SPHERES = [1, 2, 3, 4, 5, 6, 7] as const;
const SPHERE_LIFT: Record<number, number> = { 1: 10, 2: 4, 3: 0, 4: -2, 5: 0, 6: 4, 7: 10 };
const FLOAT: Record<number, string> = {
  1: "vie-float",
  3: "vie-float vie-d2",
  5: "vie-float vie-d3",
  7: "vie-float",
};

export function VieArt({
  kind,
  className = "",
}: {
  kind: VieArtKind;
  /** Gabarit externe : placer la scène (absolu à droite d'un en-tête, centré…). */
  className?: string;
}) {
  return (
    <Reveal
      aria-hidden
      data-vie-art={kind}
      className={`vie-art pointer-events-none select-none text-dbz-gold/70 ${className}`}
    >
      {kind === "spheres" && (
        <div className="flex items-end gap-1.5">
          {SPHERES.map((n) => (
            <span
              key={n}
              className={`inline-flex ${FLOAT[n] ?? ""}`}
              style={{ marginBottom: SPHERE_LIFT[n] }}
            >
              <DragonBall stars={n} size={n === 4 ? 44 : 36} decorative />
            </span>
          ))}
        </div>
      )}
      {kind === "kinto" && (
        <div className="relative grid h-[190px] w-[190px] place-items-center">
          <Burst size={190} />
          <KintoUnCloud width={150} height={85} decorative className="vie-float relative" />
        </div>
      )}
      {kind === "senzu" && (
        <div className="flex items-end">
          <SenzuBean size={56} decorative className="vie-float -mr-2 -rotate-12" />
          <SenzuBean size={76} decorative className="vie-float vie-d2 relative z-10" />
          <SenzuBean size={56} decorative className="vie-float vie-d3 -ml-2 rotate-12" />
        </div>
      )}
      {kind === "ki" && (
        <div className="relative grid h-[170px] w-[170px] place-items-center">
          <Burst size={170} count={32} />
          <Etoile taille={44} className="vie-twinkle relative text-dbz-gold" />
        </div>
      )}
    </Reveal>
  );
}
