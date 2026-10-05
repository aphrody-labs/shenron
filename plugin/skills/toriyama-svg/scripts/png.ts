/**
 * PNG sans dépendance : décodage en RGBA 8 bits et encodage RGBA.
 *
 * Les scripts de la skill (`mesurer.ts`, `rendu.ts`, `icones.ts`) n'emportent
 * ni `sharp` ni Pillow : un PNG n'est qu'une suite de blocs zlib filtrés ligne
 * par ligne, et `node:zlib` (fourni par Bun) suffit à le lire et l'écrire.
 *
 * Couvre : profondeurs 1, 2, 4, 8 et 16 bits ; gris, RVB, palette (avec
 * `tRNS`), gris + alpha, RVBA ; les cinq filtres. L'entrelacement Adam7 n'est
 * pas pris en charge : convertir d'abord l'image (voir `versPng`).
 */
import { deflateSync, inflateSync } from "node:zlib";

export interface ImageRGBA {
  largeur: number;
  hauteur: number;
  /** Pixels RVBA, 4 octets par pixel, ligne par ligne. */
  pixels: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function estPng(octets: Uint8Array): boolean {
  return SIGNATURE.every((v, i) => octets[i] === v);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Décode un PNG non entrelacé en RVBA 8 bits. */
export function decoderPng(octets: Uint8Array): ImageRGBA {
  if (!estPng(octets)) throw new Error("pas un fichier PNG (signature absente)");
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let pos = 8;
  let largeur = 0;
  let hauteur = 0;
  let profondeur = 8;
  let type = 0;
  let entrelace = 0;
  let palette: Uint8Array | null = null;
  let transparence: Uint8Array | null = null;
  const donnees: Uint8Array[] = [];
  while (pos + 8 <= octets.length) {
    const longueur = vue.getUint32(pos);
    const nom = String.fromCharCode(...octets.subarray(pos + 4, pos + 8));
    const corps = octets.subarray(pos + 8, pos + 8 + longueur);
    pos += 12 + longueur;
    if (nom === "IHDR") {
      const v = new DataView(corps.buffer, corps.byteOffset, corps.byteLength);
      largeur = v.getUint32(0);
      hauteur = v.getUint32(4);
      profondeur = corps[8]!;
      type = corps[9]!;
      entrelace = corps[12]!;
    } else if (nom === "PLTE") palette = corps.slice();
    else if (nom === "tRNS") transparence = corps.slice();
    else if (nom === "IDAT") donnees.push(corps);
    else if (nom === "IEND") break;
  }
  if (!largeur || !hauteur) throw new Error("PNG sans en-tête IHDR");
  if (entrelace) {
    throw new Error("PNG entrelacé (Adam7) non pris en charge : le réenregistrer non entrelacé");
  }
  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!canaux) throw new Error(`type de couleur PNG inconnu : ${type}`);
  const total = donnees.reduce((n, d) => n + d.length, 0);
  const zlib = new Uint8Array(total);
  let k = 0;
  for (const d of donnees) {
    zlib.set(d, k);
    k += d.length;
  }
  const brut = new Uint8Array(inflateSync(zlib));
  const bitsParPixel = canaux * profondeur;
  const octetsParLigne = Math.ceil((largeur * bitsParPixel) / 8);
  const pas = Math.max(1, bitsParPixel >> 3);
  const lignes = new Uint8Array(octetsParLigne * hauteur);
  let precedente = new Uint8Array(octetsParLigne);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (octetsParLigne + 1)]!;
    const source = brut.subarray(y * (octetsParLigne + 1) + 1, (y + 1) * (octetsParLigne + 1));
    const ligne = lignes.subarray(y * octetsParLigne, (y + 1) * octetsParLigne);
    for (let x = 0; x < octetsParLigne; x++) {
      const a = x >= pas ? ligne[x - pas]! : 0;
      const b = precedente[x]!;
      const c = x >= pas ? precedente[x - pas]! : 0;
      const v = source[x]!;
      ligne[x] =
        filtre === 0
          ? v
          : filtre === 1
            ? v + a
            : filtre === 2
              ? v + b
              : filtre === 3
                ? v + ((a + b) >> 1)
                : v + paeth(a, b, c);
    }
    precedente = ligne;
  }

  const pixels = new Uint8Array(largeur * hauteur * 4);
  const echantillon = (ligne: Uint8Array, indice: number): number => {
    if (profondeur === 8) return ligne[indice]!;
    if (profondeur === 16) return ligne[indice * 2]!;
    const parOctet = 8 / profondeur;
    const octet = ligne[Math.floor(indice / parOctet)]!;
    const decalage = 8 - profondeur * ((indice % parOctet) + 1);
    return (octet >> decalage) & ((1 << profondeur) - 1);
  };
  const echelle = profondeur < 8 ? 255 / ((1 << profondeur) - 1) : 1;
  const trnsGris = transparence && type === 0 ? (transparence[0]! << 8) | transparence[1]! : -1;
  for (let y = 0; y < hauteur; y++) {
    const ligne = lignes.subarray(y * octetsParLigne, (y + 1) * octetsParLigne);
    for (let x = 0; x < largeur; x++) {
      const o = (y * largeur + x) * 4;
      if (type === 3) {
        const i = echantillon(ligne, x);
        pixels[o] = palette?.[i * 3] ?? 0;
        pixels[o + 1] = palette?.[i * 3 + 1] ?? 0;
        pixels[o + 2] = palette?.[i * 3 + 2] ?? 0;
        pixels[o + 3] = transparence && i < transparence.length ? transparence[i]! : 255;
      } else if (type === 0 || type === 4) {
        const brutGris = echantillon(ligne, x * canaux);
        const g = Math.round(brutGris * echelle);
        pixels[o] = pixels[o + 1] = pixels[o + 2] = g;
        pixels[o + 3] =
          type === 4
            ? echantillon(ligne, x * canaux + 1)
            : profondeur <= 8 && brutGris === trnsGris
              ? 0
              : 255;
      } else {
        pixels[o] = echantillon(ligne, x * canaux);
        pixels[o + 1] = echantillon(ligne, x * canaux + 1);
        pixels[o + 2] = echantillon(ligne, x * canaux + 2);
        pixels[o + 3] = type === 6 ? echantillon(ligne, x * canaux + 3) : 255;
      }
    }
  }
  return { largeur, hauteur, pixels };
}

function bloc(nom: string, corps: Uint8Array): Uint8Array {
  const sortie = new Uint8Array(12 + corps.length);
  const vue = new DataView(sortie.buffer);
  vue.setUint32(0, corps.length);
  for (let i = 0; i < 4; i++) sortie[4 + i] = nom.charCodeAt(i);
  sortie.set(corps, 8);
  vue.setUint32(8 + corps.length, Bun.hash.crc32(sortie.subarray(4, 8 + corps.length)));
  return sortie;
}

/** Encode une image RVBA 8 bits en PNG (filtre « Sub » sur chaque ligne). */
export function encoderPng(image: ImageRGBA): Uint8Array {
  const { largeur, hauteur, pixels } = image;
  const ligne = largeur * 4;
  const filtre = new Uint8Array((ligne + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const base = y * (ligne + 1);
    filtre[base] = 1;
    for (let x = 0; x < ligne; x++) {
      const v = pixels[y * ligne + x]!;
      const a = x >= 4 ? pixels[y * ligne + x - 4]! : 0;
      filtre[base + 1 + x] = (v - a) & 0xff;
    }
  }
  const entete = new Uint8Array(13);
  const v = new DataView(entete.buffer);
  v.setUint32(0, largeur);
  v.setUint32(4, hauteur);
  entete[8] = 8;
  entete[9] = 6;
  const morceaux = [
    new Uint8Array(SIGNATURE),
    bloc("IHDR", entete),
    bloc("IDAT", new Uint8Array(deflateSync(filtre, { level: 9 }))),
    bloc("IEND", new Uint8Array(0)),
  ];
  const sortie = new Uint8Array(morceaux.reduce((n, m) => n + m.length, 0));
  let k = 0;
  for (const m of morceaux) {
    sortie.set(m, k);
    k += m.length;
  }
  return sortie;
}

/** Image unie (fond de planche). Couleur `#rrggbb` ou `#rrggbbaa`. */
export function imageUnie(largeur: number, hauteur: number, couleur: string): ImageRGBA {
  const hex = couleur.replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255;
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
  return { largeur, hauteur, pixels };
}

/** Agrandissement au plus proche voisin : on voit les pixels réels. */
export function agrandir(image: ImageRGBA, facteur: number): ImageRGBA {
  const f = Math.max(1, Math.floor(facteur));
  if (f === 1) return image;
  const largeur = image.largeur * f;
  const hauteur = image.hauteur * f;
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y++) {
    const sy = Math.floor(y / f);
    for (let x = 0; x < largeur; x++) {
      const s = (sy * image.largeur + Math.floor(x / f)) * 4;
      const d = (y * largeur + x) * 4;
      pixels.set(image.pixels.subarray(s, s + 4), d);
    }
  }
  return { largeur, hauteur, pixels };
}

/** Pose `dessus` sur `fond` en (x, y), composition alpha « source-over ». */
export function poser(fond: ImageRGBA, dessus: ImageRGBA, x0: number, y0: number): void {
  for (let y = 0; y < dessus.hauteur; y++) {
    const fy = y + y0;
    if (fy < 0 || fy >= fond.hauteur) continue;
    for (let x = 0; x < dessus.largeur; x++) {
      const fx = x + x0;
      if (fx < 0 || fx >= fond.largeur) continue;
      const s = (y * dessus.largeur + x) * 4;
      const d = (fy * fond.largeur + fx) * 4;
      const a = dessus.pixels[s + 3]! / 255;
      if (a === 0) continue;
      const ad = fond.pixels[d + 3]! / 255;
      const ao = a + ad * (1 - a);
      for (let c = 0; c < 3; c++) {
        const v = (dessus.pixels[s + c]! * a + fond.pixels[d + c]! * ad * (1 - a)) / (ao || 1);
        fond.pixels[d + c] = Math.round(v);
      }
      fond.pixels[d + 3] = Math.round(ao * 255);
    }
  }
}

/** Redimensionne à la hauteur voulue (moyenne de boîte), largeur proportionnelle. */
export function aHauteur(image: ImageRGBA, hauteur: number): ImageRGBA {
  const ratio = hauteur / image.hauteur;
  const largeur = Math.max(1, Math.round(image.largeur * ratio));
  const pixels = new Uint8Array(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y++) {
    const y0 = Math.floor(y / ratio);
    const y1 = Math.max(y0 + 1, Math.min(image.hauteur, Math.floor((y + 1) / ratio)));
    for (let x = 0; x < largeur; x++) {
      const x0 = Math.floor(x / ratio);
      const x1 = Math.max(x0 + 1, Math.min(image.largeur, Math.floor((x + 1) / ratio)));
      const somme = [0, 0, 0, 0];
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * image.largeur + sx) * 4;
          for (let c = 0; c < 4; c++) somme[c] = somme[c]! + image.pixels[s + c]!;
          n++;
        }
      }
      const d = (y * largeur + x) * 4;
      for (let c = 0; c < 4; c++) pixels[d + c] = Math.round(somme[c]! / Math.max(1, n));
    }
  }
  return { largeur, hauteur, pixels };
}
