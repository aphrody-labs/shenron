#!/usr/bin/env bun
/**
 * Décline un SVG carré en jeu complet de favicons, sans dépendance npm.
 *
 * Les variantes (fond opaque, zone sûre « maskable » à 80 %) sont composées en
 * SVG pur ; la rastérisation passe par l'outil local disponible (`raster.ts` :
 * resvg, rsvg-convert, ImageMagick, Inkscape). L'ICO n'est qu'un conteneur de
 * PNG, écrit ici octet par octet. Sans rastériseur, le script écrit les
 * variantes SVG et signale que les PNG et l'ICO n'ont pas été produits.
 *
 * Usage :
 *   bun icones.ts icone.svg --sortie public/
 *   bun icones.ts icone.svg --sortie public --sortie autre/public --fond "#0a0a0a"
 *
 * Le SVG d'entrée doit être CARRÉ et déjà pensé pour les petites tailles
 * (silhouette simplifiée, trait épais, pastille de fond) : un downscale
 * d'illustration large donne une lentille illisible à 16 px.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { dimensionsSvg, fermerRaster, imbriquable, outilSvg, svgVersPng } from "./raster";
import { encoderPng } from "./png";

/** Variante carrée : fond optionnel, dessin mis à l'échelle autour du centre. */
export function variante(
  svg: string,
  cote: number,
  { fond = null as string | null, echelle = 1 } = {},
): string {
  const { viewBox, interieur } = imbriquable(svg);
  const interne = cote * echelle;
  const marge = (cote - interne) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}" width="${cote}" height="${cote}">
${fond ? `<rect width="${cote}" height="${cote}" fill="${fond}"/>\n` : ""}<svg x="${marge}" y="${marge}" width="${interne}" height="${interne}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${interieur}</svg>
</svg>
`;
}

/** ICO = en-tête (6 o) + une entrée de 16 o par image + les PNG bout à bout. */
export function ico(images: { cote: number; png: Uint8Array }[]): Uint8Array {
  const entetes = 6 + 16 * images.length;
  const sortie = new Uint8Array(entetes + images.reduce((n, i) => n + i.png.length, 0));
  const vue = new DataView(sortie.buffer);
  vue.setUint16(0, 0, true);
  vue.setUint16(2, 1, true);
  vue.setUint16(4, images.length, true);
  let decalage = entetes;
  images.forEach(({ cote, png }, rang) => {
    const e = 6 + 16 * rang;
    vue.setUint8(e, cote >= 256 ? 0 : cote);
    vue.setUint8(e + 1, cote >= 256 ? 0 : cote);
    vue.setUint16(e + 4, 1, true);
    vue.setUint16(e + 6, 32, true);
    vue.setUint32(e + 8, png.length, true);
    vue.setUint32(e + 12, decalage, true);
    sortie.set(png, decalage);
    decalage += png.length;
  });
  return sortie;
}

/** Le jeu de fichiers : nom → { cote, fond?, echelle? }. */
export const JEU: Record<string, { cote: number; opaque?: boolean; echelle?: number }> = {
  "favicon-16.png": { cote: 16 },
  "favicon-32.png": { cote: 32 },
  "favicon-48.png": { cote: 48 },
  "favicon-96.png": { cote: 96 },
  // iOS compose l'icône Apple sur du noir : transparente, elle sort sale.
  "apple-touch-icon.png": { cote: 180, opaque: true },
  "icon-192.png": { cote: 192 },
  "icon-512.png": { cote: 512 },
  // Android rogne l'icône maskable en cercle : le dessin doit tenir dans 80 %.
  "icon-maskable-512.png": { cote: 512, opaque: true, echelle: 0.8 },
  "mstile-150.png": { cote: 150, opaque: true },
};

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const source = args.find((a) => !a.startsWith("--") && a.endsWith(".svg"));
  const dossiers = args.flatMap((a, i) => (a === "--sortie" && args[i + 1] ? [args[i + 1]!] : []));
  if (!source || !dossiers.length) {
    console.error(
      "usage : bun icones.ts <icone.svg> --sortie DIR [--sortie DIR2] [--fond #0a0a0a]",
    );
    process.exit(1);
  }
  const iF = args.indexOf("--fond");
  const fond = iF >= 0 && args[iF + 1] ? args[iF + 1]! : "#0a0a0a";
  const svg = await Bun.file(source).text();
  const { largeur, hauteur } = dimensionsSvg(svg);
  if (largeur !== hauteur) {
    console.warn(
      `⚠ ${source} n'est pas carré (${largeur}×${hauteur}) : les icônes seront marginées.`,
    );
  }

  const variantes: Record<string, string> = {};
  for (const [nom, v] of Object.entries(JEU)) {
    variantes[nom.replace(/\.png$/, ".svg")] = variante(svg, v.cote, {
      fond: v.opaque ? fond : null,
      echelle: v.echelle ?? 1,
    });
  }
  const outil = await outilSvg();
  const fichiers: Record<string, Uint8Array> = {};
  if (outil) {
    for (const [nom, v] of Object.entries(JEU)) {
      const png = await svgVersPng(
        variantes[nom.replace(/\.png$/, ".svg")]!,
        v.cote,
        v.cote,
        outil,
      );
      fichiers[nom] = encoderPng(png);
    }
    fichiers["favicon.ico"] = ico(
      [16, 32, 48].map((cote) => ({ cote, png: fichiers[`favicon-${cote}.png`]! })),
    );
    await fermerRaster();
  }
  fichiers["favicon.svg"] = new TextEncoder().encode(svg);

  for (const dossier of dossiers) {
    await mkdir(dossier, { recursive: true });
    for (const [nom, contenu] of Object.entries(fichiers))
      await Bun.write(join(dossier, nom), contenu);
    if (!outil) {
      for (const [nom, contenu] of Object.entries(variantes))
        await Bun.write(join(dossier, nom), contenu);
    }
    console.log(
      `${dossier} — ${Object.keys(fichiers).length + (outil ? 0 : Object.keys(variantes).length)} fichiers`,
    );
  }
  for (const [nom, contenu] of Object.entries(fichiers))
    console.log(`  ${nom.padEnd(24)} ${contenu.length} o`);
  if (!outil) {
    console.log(
      "⚠ aucun rastériseur (Bun.WebView avec Chrome/Edge, resvg, rsvg-convert, magick/convert, inkscape) : PNG et ICO NON produits.\n" +
        "  Les variantes SVG (opaque, maskable 80 %) sont écrites ; les rastériser ailleurs avant livraison.",
    );
  } else console.log(`rastériseur : ${outil}`);

  console.log(`
À câbler côté page (Next : \`metadata.icons\`) :
  icon      /favicon.ico (sizes any) + favicon-16/32/48/96.png (+ /favicon.svg)
  apple     /apple-touch-icon.png (180×180)
  meta      msapplication-TileColor ${fond} · msapplication-TileImage /mstile-150.png
Dans le manifest, séparer icon-512 (purpose "any") de icon-maskable-512 (purpose
"maskable") : un même fichier ne peut pas être les deux.

Vérifier ensuite favicon.ico : octets 0-3 = 00 00 01 00 (icône), octets 4-5 = 03 00
(trois images 16, 32, 48).`);
}
