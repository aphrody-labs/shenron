#!/usr/bin/env bun
/**
 * Mesure une forme dans une image de référence : boîte, ratio, palette, tons,
 * profil de silhouette, épaisseur du trait. C'est l'étape qui remplace « à peu
 * près comme ça » par des nombres qu'on peut citer et rejouer.
 *
 * Bun seul : le PNG est décodé par `png.ts` ; un JPEG ou un WebP passe par
 * ImageMagick ou ffmpeg s'ils sont installés (sinon, convertir l'image en PNG).
 * Reprend l'algorithme de l'ancien `mesurer.py` : masque HSV (ou d'encre),
 * plus grande composante connexe, trous rebouchés depuis le bord, k-means.
 *
 * Usage :
 *   bun mesurer.ts IMAGE --teinte 40 70 --sat 0.35 --val 0.45
 *   bun mesurer.ts IMAGE --boite 405 638 1229 1079      # zone connue
 *   bun mesurer.ts IMAGE --sombre                        # trait d'encre
 * Options :
 *   --k N              couleurs de la palette (défaut 5)
 *   --seuil-sombre V   luminance maximale de l'encre (défaut 0.30)
 *   --sortie DIR       masque.png, decoupe.png, mesures.json (défaut : dossier temporaire)
 *   --json             n'imprime que le JSON
 */
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { encoderPng, type ImageRGBA } from "./png";
import { lireImage } from "./raster";

export interface OptionsMesure {
  teinte: [number, number];
  sat: number;
  val: number;
  sombre: boolean;
  seuilSombre: number;
  boite: [number, number, number, number] | null;
  k: number;
}

export const OPTIONS_DEFAUT: OptionsMesure = {
  teinte: [0, 360],
  sat: 0.3,
  val: 0.4,
  sombre: false,
  seuilSombre: 0.3,
  boite: null,
  k: 5,
};

type RVB = [number, number, number];

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Masque brut : pixels dans la plage HSV, ou pixels d'encre (`sombre`). */
export function masqueBrut(image: ImageRGBA, o: OptionsMesure): Uint8Array {
  const { largeur, hauteur, pixels } = image;
  const m = new Uint8Array(largeur * hauteur);
  const [h0, h1] = o.teinte;
  for (let i = 0; i < largeur * hauteur; i++) {
    const x = i % largeur;
    const y = Math.floor(i / largeur);
    if (o.boite && (x < o.boite[0] || x >= o.boite[2] || y < o.boite[1] || y >= o.boite[3])) {
      continue;
    }
    if (pixels[i * 4 + 3]! < 128) continue;
    const r = pixels[i * 4]! / 255;
    const g = pixels[i * 4 + 1]! / 255;
    const b = pixels[i * 4 + 2]! / 255;
    if (o.sombre) {
      if (luminance(r, g, b) <= o.seuilSombre) m[i] = 1;
      continue;
    }
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = Math.max(mx - mn, 1e-9);
    const sat = mx > 0 ? (mx - mn) / Math.max(mx, 1e-9) : 0;
    let h = 0;
    if (mx === r) h = ((((g - b) / d) % 6) + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    const dans = h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1;
    if (dans && sat >= o.sat && mx >= o.val) m[i] = 1;
  }
  return m;
}

/** Plus grande composante connexe (4-voisinage), parcours itératif. */
export function plusGrandeComposante(m: Uint8Array, largeur: number, hauteur: number): Uint8Array {
  const etiquette = new Int32Array(m.length);
  const pile = new Int32Array(m.length);
  let meilleure = 0;
  let tailleMax = 0;
  let courante = 0;
  for (let depart = 0; depart < m.length; depart++) {
    if (!m[depart] || etiquette[depart]) continue;
    courante += 1;
    let haut = 0;
    let taille = 0;
    pile[haut++] = depart;
    etiquette[depart] = courante;
    while (haut > 0) {
      const p = pile[--haut]!;
      taille += 1;
      const x = p % largeur;
      const voisins = [
        x > 0 ? p - 1 : -1,
        x < largeur - 1 ? p + 1 : -1,
        p >= largeur ? p - largeur : -1,
        p < largeur * (hauteur - 1) ? p + largeur : -1,
      ];
      for (const v of voisins) {
        if (v >= 0 && m[v] && !etiquette[v]) {
          etiquette[v] = courante;
          pile[haut++] = v;
        }
      }
    }
    if (taille > tailleMax) {
      tailleMax = taille;
      meilleure = courante;
    }
  }
  const sortie = new Uint8Array(m.length);
  if (meilleure) for (let i = 0; i < m.length; i++) if (etiquette[i] === meilleure) sortie[i] = 1;
  return sortie;
}

/** Rebouche les trous : tout ce que l'extérieur n'atteint pas est intérieur. */
export function boucherTrous(m: Uint8Array, largeur: number, hauteur: number): Uint8Array {
  const dehors = new Uint8Array(m.length);
  const pile = new Int32Array(m.length);
  let haut = 0;
  const semer = (p: number) => {
    if (!m[p] && !dehors[p]) {
      dehors[p] = 1;
      pile[haut++] = p;
    }
  };
  for (let x = 0; x < largeur; x++) {
    semer(x);
    semer((hauteur - 1) * largeur + x);
  }
  for (let y = 0; y < hauteur; y++) {
    semer(y * largeur);
    semer(y * largeur + largeur - 1);
  }
  while (haut > 0) {
    const p = pile[--haut]!;
    const x = p % largeur;
    if (x > 0) semer(p - 1);
    if (x < largeur - 1) semer(p + 1);
    if (p >= largeur) semer(p - largeur);
    if (p < largeur * (hauteur - 1)) semer(p + largeur);
  }
  const sortie = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) sortie[i] = dehors[i] ? 0 : 1;
  return sortie;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** k-means sur un échantillon déterministe (graine 7, 30 000 pixels au plus). */
export function kmeans(points: RVB[], k: number, iterations = 40): { centre: RVB; part: number }[] {
  const tirage = aleatoire(7);
  const indices = points.map((_, i) => i);
  const n = Math.min(points.length, 30000);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(tirage() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  const echantillon = indices.slice(0, n).map((i) => points[i]!);
  const kk = Math.min(k, echantillon.length);
  const centres: RVB[] = echantillon.slice(0, kk).map((p) => [...p] as RVB);
  const affectation = new Int32Array(echantillon.length);
  const affecter = () => {
    for (let i = 0; i < echantillon.length; i++) {
      const p = echantillon[i]!;
      let meilleur = 0;
      let distance = Infinity;
      for (let c = 0; c < kk; c++) {
        const q = centres[c]!;
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < distance) {
          distance = d;
          meilleur = c;
        }
      }
      affectation[i] = meilleur;
    }
  };
  for (let it = 0; it < iterations; it++) {
    affecter();
    const somme = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < echantillon.length; i++) {
      const s = somme[affectation[i]!]!;
      const p = echantillon[i]!;
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      s[3] += 1;
    }
    for (let c = 0; c < kk; c++) {
      const s = somme[c]!;
      if (s[3]) centres[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    }
  }
  affecter();
  const parts = centres.map(() => 0);
  for (const a of affectation) parts[a] = parts[a]! + 1;
  return centres
    .map((centre, c) => ({ centre, part: parts[c]! / Math.max(1, echantillon.length) }))
    .toSorted((a, b) => b.part - a.part);
}

const arrondi = (v: number, n: number) => Math.round(v * 10 ** n) / 10 ** n;

function hexa(c: RVB): string {
  return `#${c
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

function hsl([r, g, b]: RVB) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: arrondi(h * 360, 1), s: arrondi(s * 100, 1), l: arrondi(l * 100, 1) };
}

/** sRGB → linéaire → OKLab → OKLCH : la clarté perceptuelle qui dit si deux aplats se distinguent. */
function oklch(c: RVB) {
  const [r, g, b] = c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as RVB;
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return {
    L: arrondi(L, 3),
    C: arrondi(Math.hypot(a, bb), 3),
    h: arrondi(((((Math.atan2(bb, a) * 180) / Math.PI) % 360) + 360) % 360, 1),
  };
}

function couleur(c: RVB) {
  return { hex: hexa(c), rgb: c.map((v) => Math.round(v * 255)), hsl: hsl(c), oklch: oklch(c) };
}

/** Creux du bord inférieur (maxima locaux du profil), en % de la largeur. */
function creuxDuBas(
  m: Uint8Array,
  largeur: number,
  boite: [number, number, number, number],
  n = 400,
): number[] {
  const [x0, y0, x1, y1] = boite;
  const l = x1 - x0;
  const profil: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor((i * (l - 1)) / (n - 1));
    let bas = -1;
    for (let y = y0; y < y1; y++) if (m[y * largeur + x]) bas = y - y0;
    profil.push(bas);
  }
  const creux: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    const f = profil[i]!;
    if (f < 0) continue;
    const a = profil[i - 2]!;
    const b = profil[i + 2]!;
    if (f <= a && f <= b && (f < a || f < b)) creux.push(i);
  }
  const groupes: number[][] = [];
  for (const i of creux) {
    const dernier = groupes.at(-1);
    if (dernier && i - dernier.at(-1)! < n * 0.02) dernier.push(i);
    else groupes.push([i]);
  }
  return groupes.map((g) =>
    arrondi((100 * (g.reduce((s, v) => s + v, 0) / g.length)) / (n - 1), 1),
  );
}

/** Mesure complète d'une image déjà décodée. */
export function mesurer(image: ImageRGBA, o: OptionsMesure = OPTIONS_DEFAUT) {
  const { largeur: W, hauteur: H, pixels } = image;
  const brut = masqueBrut(image, o);
  if (!brut.some((v) => v)) {
    throw new Error("Aucun pixel retenu : élargir --teinte, baisser --sat et --val.");
  }
  const composante = plusGrandeComposante(brut, W, H);
  const m = boucherTrous(composante, W, H);
  let bx0 = W;
  let by0 = H;
  let bx1 = 0;
  let by1 = 0;
  const points: RVB[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    bx0 = Math.min(bx0, x);
    bx1 = Math.max(bx1, x + 1);
    by0 = Math.min(by0, y);
    by1 = Math.max(by1, y + 1);
    points.push([pixels[i * 4]! / 255, pixels[i * 4 + 1]! / 255, pixels[i * 4 + 2]! / 255]);
  }
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const tries = points.toSorted((a, b) => luminance(...a) - luminance(...b));
  const tranche = Math.max(1, Math.floor(tries.length / 50));
  const ton = (q: number): RVB => {
    const debut = Math.floor(tries.length * q);
    const part = tries.slice(debut, debut + tranche);
    return [0, 1, 2].map((c) => part.reduce((s, p) => s + p[c]!, 0) / part.length) as RVB;
  };
  const mesures: Record<string, unknown> = {
    dimensions: { largeur: W, hauteur: H },
    boite: { x0: bx0, y0: by0, x1: bx1, y1: by1, largeur: bw, hauteur: bh },
    ratio: arrondi(bw / bh, 3),
    pixels_pleins: points.length,
    remplissage_boite_pct: arrondi((100 * points.length) / (bw * bh), 1),
    part_image_pct: arrondi((100 * points.length) / (W * H), 2),
    palette: kmeans(points, o.k)
      .filter((p) => p.part > 0)
      .map(({ centre, part }) => ({
        part_pct: arrondi(part * 100, 1),
        ...couleur(centre),
      })),
    tons: {
      ombre: couleur(ton(0.02)),
      demi_ton: couleur(ton(0.25)),
      base: couleur(ton(0.5)),
      clair: couleur(ton(0.75)),
      lumiere: couleur(ton(0.97)),
    },
    creux_du_bas_pct_largeur: creuxDuBas(m, W, [bx0, by0, bx1, by1]),
  };
  if (o.sombre) {
    const epaisseurs: number[] = [];
    for (let y = by0; y < by1; y += Math.max(1, Math.floor(bh / 60))) {
      let n = 0;
      for (let x = bx0; x < bx1; x++) {
        // Le trait se mesure sur l'encre elle-même, pas sur la forme rebouchée :
        // un contour fermé deviendrait sinon un aplat plein.
        if (composante[y * W + x]) n++;
        else if (n) {
          epaisseurs.push(n);
          n = 0;
        }
      }
      if (n) epaisseurs.push(n);
    }
    if (epaisseurs.length) {
      const t = epaisseurs.toSorted((a, b) => a - b);
      const mediane =
        t.length % 2 ? t[(t.length - 1) / 2]! : (t[t.length / 2 - 1]! + t[t.length / 2]!) / 2;
      mesures.trait = {
        epaisseur_px_mediane: mediane,
        epaisseur_pct_largeur_forme: arrondi((100 * mediane) / bw, 2),
      };
    }
  }
  return { mesures, masque: m, boite: [bx0, by0, bx1, by1] as const };
}

function lireOptions(args: string[]): {
  image: string;
  o: OptionsMesure;
  sortie: string;
  json: boolean;
} {
  const o: OptionsMesure = structuredClone(OPTIONS_DEFAUT);
  let image = "";
  let sortie = join(tmpdir(), "mesures");
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    const nombre = (k: number) => Number(args[i + k]);
    if (a === "--teinte") {
      o.teinte = [nombre(1), nombre(2)];
      i += 2;
    } else if (a === "--sat") o.sat = Number(args[++i]);
    else if (a === "--val") o.val = Number(args[++i]);
    else if (a === "--sombre") o.sombre = true;
    else if (a === "--seuil-sombre") o.seuilSombre = Number(args[++i]);
    else if (a === "--boite") {
      o.boite = [nombre(1), nombre(2), nombre(3), nombre(4)];
      i += 4;
    } else if (a === "--k") o.k = Math.max(1, Number(args[++i]));
    else if (a === "--sortie") sortie = args[++i]!;
    else if (a === "--json") json = true;
    else if (!a.startsWith("--")) image = a;
  }
  return { image, o, sortie, json };
}

if (import.meta.main) {
  const { image, o, sortie, json } = lireOptions(Bun.argv.slice(2));
  if (!image) {
    console.error(
      "usage : bun mesurer.ts IMAGE [--teinte MIN MAX] [--sat S] [--val V] [--sombre] [--boite X0 Y0 X1 Y1] [--k N] [--sortie DIR] [--json]",
    );
    process.exit(1);
  }
  const img = await lireImage(image);
  let resultat;
  try {
    resultat = mesurer(img, o);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const { mesures, masque, boite } = resultat;
  const complet = { image: resolve(image), ...mesures };
  await mkdir(sortie, { recursive: true });
  const m = new Uint8Array(img.largeur * img.hauteur * 4);
  for (let i = 0; i < masque.length; i++) {
    const v = masque[i] ? 255 : 0;
    m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = v;
    m[i * 4 + 3] = 255;
  }
  await Bun.write(
    join(sortie, "masque.png"),
    encoderPng({ largeur: img.largeur, hauteur: img.hauteur, pixels: m }),
  );
  const [x0, y0, x1, y1] = boite;
  const decoupe = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
  for (let y = y0; y < y1; y++) {
    decoupe.set(
      img.pixels.subarray((y * img.largeur + x0) * 4, (y * img.largeur + x1) * 4),
      (y - y0) * (x1 - x0) * 4,
    );
  }
  await Bun.write(
    join(sortie, "decoupe.png"),
    encoderPng({ largeur: x1 - x0, hauteur: y1 - y0, pixels: decoupe }),
  );
  await Bun.write(join(sortie, "mesures.json"), `${JSON.stringify(complet, null, 2)}\n`);
  if (json) console.log(JSON.stringify(complet));
  else {
    console.log(JSON.stringify(complet, null, 2));
    console.error(`\n→ ${sortie}/masque.png · decoupe.png · mesures.json`);
  }
}
