#!/usr/bin/env bun
/**
 * Planche de contrôle d'un SVG à plusieurs tailles, sur fond clair et sombre :
 * l'image qu'on ouvre ensuite pour REGARDER le dessin.
 *
 * Un SVG qui semble juste dans le code peut s'effondrer à 32 px, perdre son
 * trait ou révéler une ombre qui flotte. Chaque taille est rendue nativement
 * puis agrandie au plus proche voisin : on voit les pixels réels.
 *
 * Rastérisation optionnelle (`raster.ts`) : resvg, rsvg-convert, ImageMagick
 * ou Inkscape s'il en existe un. Sans aucun de ces outils, le script écrit une
 * planche SVG pure (`planche.svg`, rendu vectoriel à chaque taille) et signale
 * que le contrôle des pixels n'a pas été fait.
 *
 * Usage :
 *   bun rendu.ts dessin.svg                       # 512, 128, 64, 32, 16
 *   bun rendu.ts dessin.svg --tailles 1200 256 64
 *   bun rendu.ts dessin.svg --compare reference.png
 *   bun rendu.ts dessin.svg --sortie /tmp/controle
 */
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agrandir, aHauteur, encoderPng, imageUnie, poser, type ImageRGBA } from "./png";
import {
  dimensionsSvg,
  fermerRaster,
  imbriquable,
  lireImage,
  outilSvg,
  svgVersPng,
} from "./raster";

const CIBLE = 220;
const MARGE = 12;

/** Planche SVG pure : le dessin imbriqué à chaque taille, sur les deux fonds. */
export function plancheSvg(svg: string, tailles: number[]): string {
  const { largeur, hauteur } = dimensionsSvg(svg);
  const ratio = largeur / hauteur;
  const { viewBox, interieur } = imbriquable(svg);
  const cases = tailles.map((t) => {
    const facteur = Math.max(1, Math.floor(CIBLE / t));
    return { t, l: t * facteur, h: Math.max(1, Math.round(t / ratio)) * facteur };
  });
  const H = Math.max(...cases.map((c) => c.h)) + MARGE * 2;
  const W = cases.reduce((s, c) => s + c.l + MARGE, MARGE);
  const rangee = (fond: string, y: number) => {
    let x = MARGE;
    const items = cases.map((c) => {
      const s = `<svg x="${x}" y="${y + Math.round((H - c.h) / 2)}" width="${c.l}" height="${c.h}" viewBox="${viewBox}">${interieur}</svg>`;
      x += c.l + MARGE;
      return s;
    });
    return `<rect x="0" y="${y}" width="${W}" height="${H}" fill="${fond}"/>\n${items.join("\n")}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H * 2}" width="${W}" height="${H * 2}">
${rangee("#ffffff", 0)}
${rangee("#0a0a0a", H)}
</svg>
`;
}

function planche(vignettes: ImageRGBA[], fond: string): ImageRGBA {
  const H = Math.max(...vignettes.map((v) => v.hauteur)) + MARGE * 2;
  const W = vignettes.reduce((s, v) => s + v.largeur + MARGE, MARGE);
  const image = imageUnie(W, H, fond);
  let x = MARGE;
  for (const v of vignettes) {
    poser(image, v, x, Math.round((H - v.hauteur) / 2));
    x += v.largeur + MARGE;
  }
  return image;
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const source = args.find(
    (a, i) =>
      !a.startsWith("--") &&
      !/^\d+$/.test(a) &&
      args[i - 1] !== "--compare" &&
      args[i - 1] !== "--sortie",
  );
  if (!source) {
    console.error(
      "usage : bun rendu.ts <fichier.svg> [--tailles …] [--compare ref.png] [--sortie DIR]",
    );
    process.exit(1);
  }
  const option = (nom: string) => {
    const i = args.indexOf(nom);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const sortie = option("--sortie") ?? join(tmpdir(), "rendu");
  const iT = args.indexOf("--tailles");
  const tailles =
    iT >= 0
      ? args
          .slice(iT + 1)
          .filter((a) => /^\d+$/.test(a))
          .map(Number)
      : [512, 128, 64, 32, 16];
  const comparaison = option("--compare");
  const svg = await Bun.file(source).text();
  const { largeur, hauteur } = dimensionsSvg(svg);
  const ratio = largeur / hauteur;
  await mkdir(sortie, { recursive: true });

  await Bun.write(join(sortie, "planche.svg"), plancheSvg(svg, tailles));
  const outil = await outilSvg();
  console.log(`viewBox ${largeur}×${hauteur} — ratio ${ratio.toFixed(3)}`);
  console.log(`tailles : ${tailles.join(", ")}`);
  console.log(`${sortie}/planche.svg (vectorielle, clair puis sombre)`);
  if (!outil) {
    console.log(
      "⚠ aucun rastériseur (Bun.WebView avec Chrome/Edge, resvg, rsvg-convert, magick/convert, inkscape) : contrôle des pixels NON effectué.\n" +
        "  Ouvrir planche.svg dans un navigateur, ou installer Chrome/Edge ou resvg puis relancer.",
    );
    process.exit(0);
  }

  const vignettes: ImageRGBA[] = [];
  for (const t of tailles) {
    const h = Math.max(1, Math.round(t / ratio));
    const rendu = await svgVersPng(svg, t, h, outil);
    await Bun.write(join(sortie, `rendu-${t}.png`), encoderPng(rendu));
    vignettes.push(agrandir(rendu, Math.max(1, Math.floor(CIBLE / t))));
  }
  await Bun.write(join(sortie, "planche-clair.png"), encoderPng(planche(vignettes, "#ffffff")));
  await Bun.write(join(sortie, "planche-sombre.png"), encoderPng(planche(vignettes, "#0a0a0a")));
  console.log(`rastériseur : ${outil}`);
  console.log(`${sortie}/planche-clair.png`);
  console.log(`${sortie}/planche-sombre.png`);

  if (comparaison) {
    // Côte à côte à hauteur égale : l'œil ne corrige pas une différence d'échelle.
    const h = 420;
    const a = await svgVersPng(svg, Math.round(h * ratio), h, outil);
    const b = aHauteur(await lireImage(comparaison), h);
    const image = imageUnie(a.largeur + b.largeur + 24, h + 16, "#ffffff");
    poser(image, a, 8, 8);
    poser(image, b, a.largeur + 16, 8);
    await Bun.write(join(sortie, "comparaison.png"), encoderPng(image));
    console.log(`${sortie}/comparaison.png`);
  }
  await fermerRaster();
  console.log(
    "→ ouvrir ces planches avec l'outil de lecture d'image AVANT de conclure quoi que ce soit.",
  );
}
