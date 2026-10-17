/**
 * Paramètres plats des modèles 3D Toriyama (`render::toriyama3d` de shenron-engine).
 *
 * Le moteur wgpu ne porte aucune mesure : il reçoit ici, dans l'ordre exact de
 * `DragonBallUniforms::from_params` et `KintoUnUniforms::from_params`, les valeurs des
 * propriétaires uniques — `./sphere` (couverture du tome 1) et `./kinto-un` (manga couleur
 * t901 pl. 81). Un test croise les longueurs avec les constantes Rust.
 */
import { KINTO_UN_COULEURS, lobesIcone } from "./kinto-un";
import {
  SPHERE_BOITE,
  SPHERE_CERNE,
  SPHERE_DEGRADE,
  SPHERE_ETOILES,
  SPHERE_FOYER,
  SPHERE_R_ETOILE,
  SPHERE_R_EXT,
  SPHERE_R_INT,
  SPHERE_ROUGE_ETOILE,
  type DragonBallStars,
} from "./sphere";

export type ToriyamaModelName = "dragon-ball" | "kinto-un";

/** `render::dragon_ball::PARAM_LEN`. */
export const DRAGON_BALL_PARAM_LEN = 31;
/** `render::kinto_un::PARAM_LEN`. */
export const KINTO_UN_PARAM_LEN = 66;

const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Boule à `stars` étoiles : cerne, rayon d'étoile, foyer du dégradé, couleurs, étoiles. */
export function dragonBallParams(stars: DragonBallStars): Float32Array {
  const scale = SPHERE_BOITE / SPHERE_R_INT;
  const positions = SPHERE_ETOILES[stars].flatMap(([x, y]) => [x * scale, -y * scale]);
  const p = [
    SPHERE_CERNE / SPHERE_R_EXT,
    SPHERE_R_ETOILE[stars],
    SPHERE_ETOILES[stars].length,
    (SPHERE_FOYER.x - SPHERE_R_EXT) / SPHERE_R_INT,
    -(SPHERE_FOYER.y - SPHERE_R_EXT) / SPHERE_R_INT,
    ...rgb(SPHERE_DEGRADE[0]![1]),
    ...rgb(SPHERE_DEGRADE[5]![1]),
    ...rgb(SPHERE_DEGRADE.at(-1)![1]),
    ...rgb(SPHERE_ROUGE_ETOILE),
    ...positions,
  ];
  while (p.length < DRAGON_BALL_PARAM_LEN) p.push(0);
  return Float32Array.from(p);
}

/**
 * Kinto-Un de l'icône : un lobe par arc du contour mesuré, un noyau ellipsoïdal qui remplit
 * l'intérieur (boîte des centres de lobes), les deux jaunes mesurés et l'encre.
 */
export function kintoUnParams(): Float32Array {
  const lobes = lobesIcone();
  const xs = lobes.map((l) => l.x);
  const ys = lobes.map((l) => l.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const rx = (Math.max(...xs) - Math.min(...xs)) / 2;
  const ry = (Math.max(...ys) - Math.min(...ys)) / 2;
  const p = [
    // Cerne : 12 unités de trait de l'icône sur un demi-côté de 256.
    12 / 256,
    lobes.length,
    0.035,
    cx,
    cy,
    rx,
    ry,
    Math.min(rx, ry) * 0.55,
    0.12,
    ...rgb(KINTO_UN_COULEURS.lumiere),
    ...rgb(KINTO_UN_COULEURS.ombre),
    ...rgb(KINTO_UN_COULEURS.encre),
    ...lobes.flatMap((l) => [l.x, l.y, l.r]),
  ];
  while (p.length < KINTO_UN_PARAM_LEN) p.push(0);
  return Float32Array.from(p);
}

export function modelParams(model: ToriyamaModelName, stars: DragonBallStars = 4): Float32Array {
  return model === "dragon-ball" ? dragonBallParams(stars) : kintoUnParams();
}
