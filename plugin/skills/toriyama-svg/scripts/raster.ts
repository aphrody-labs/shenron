/**
 * Rastérisation optionnelle : SVG → PNG et image quelconque → PNG, par l'outil
 * local disponible. Aucun appel réseau, aucune dépendance npm.
 *
 * Ordre de préférence : `resvg` (Rust), `rsvg-convert`, `magick`/`convert`
 * (ImageMagick), `inkscape`. Pour une référence JPEG/WebP : ImageMagick, puis
 * `ffmpeg`. Si rien n'est installé, `outilSvg()` rend `null` et l'appelant
 * se replie sur une planche SVG pure en signalant le contrôle non effectué.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decoderPng, estPng, type ImageRGBA } from "./png";

export type OutilSvg = "resvg" | "rsvg-convert" | "magick" | "convert" | "inkscape";

let sonde: Promise<OutilSvg | null> | null = null;

/**
 * Premier rastériseur installé QUI SAIT lire un SVG : ImageMagick sans
 * délégué librsvg, par exemple, est présent mais échoue. Chaque candidat
 * convertit un SVG de 4 × 4 px avant d'être retenu.
 */
export function outilSvg(): Promise<OutilSvg | null> {
  sonde ??= (async () => {
    const force = process.env.TORIYAMA_RASTER;
    if (force === "aucun") return null;
    const ordre: OutilSvg[] = ["resvg", "rsvg-convert", "magick", "convert", "inkscape"];
    const essai = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#f00"/></svg>`;
    for (const outil of force ? ordre.filter((o) => o === force) : ordre) {
      if (!Bun.which(outil)) continue;
      try {
        const image = await svgVersPng(essai, 4, 4, outil);
        if (image.largeur === 4 && image.pixels[0] === 255) return outil;
      } catch {
        // outil présent mais incapable de lire un SVG : candidat suivant
      }
    }
    return null;
  })();
  return sonde;
}

function executer(cmd: string[]): void {
  const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`${cmd[0]} a échoué (${r.exitCode}) : ${r.stderr.toString().trim()}`);
  }
}

let compteur = 0;
function temporaire(extension: string): string {
  compteur += 1;
  return join(tmpdir(), `toriyama-${process.pid}-${compteur}.${extension}`);
}

/** Rend `svg` (texte) en PNG de `largeur` × `hauteur` px avec l'outil donné. */
export async function svgVersPng(
  svg: string,
  largeur: number,
  hauteur: number,
  outil: OutilSvg,
): Promise<ImageRGBA> {
  const entree = temporaire("svg");
  const sortie = temporaire("png");
  await Bun.write(entree, svg);
  try {
    const l = String(largeur);
    const h = String(hauteur);
    if (outil === "resvg") executer(["resvg", "-w", l, "-h", h, entree, sortie]);
    else if (outil === "rsvg-convert")
      executer(["rsvg-convert", "-w", l, "-h", h, "-o", sortie, entree]);
    else if (outil === "inkscape") {
      executer([
        "inkscape",
        entree,
        "-w",
        l,
        "-h",
        h,
        "--export-type=png",
        `--export-filename=${sortie}`,
      ]);
    } else {
      // ImageMagick : densité suffisante pour ne pas agrandir un rendu flou.
      executer([
        outil,
        "-background",
        "none",
        "-density",
        "384",
        entree,
        "-resize",
        `${l}x${h}!`,
        `PNG32:${sortie}`,
      ]);
    }
    return decoderPng(await Bun.file(sortie).bytes());
  } finally {
    await Bun.file(entree)
      .delete()
      .catch(() => {});
    await Bun.file(sortie)
      .delete()
      .catch(() => {});
  }
}

/** Lit une image en RVBA : PNG directement, autre format via ImageMagick ou ffmpeg. */
export async function lireImage(chemin: string): Promise<ImageRGBA> {
  const octets = await Bun.file(chemin).bytes();
  if (estPng(octets)) {
    try {
      return decoderPng(octets);
    } catch (e) {
      // PNG entrelacé : on le fait réécrire par le convertisseur, s'il existe.
      if (!Bun.which("magick") && !Bun.which("convert") && !Bun.which("ffmpeg")) throw e;
    }
  }
  const sortie = temporaire("png");
  try {
    const magick = Bun.which("magick") ?? Bun.which("convert");
    if (magick) executer([magick, chemin, "-strip", "-interlace", "none", `PNG32:${sortie}`]);
    else if (Bun.which("ffmpeg")) {
      executer([
        "ffmpeg",
        "-loglevel",
        "error",
        "-y",
        "-i",
        chemin,
        "-frames:v",
        "1",
        "-pix_fmt",
        "rgba",
        sortie,
      ]);
    } else {
      throw new Error(
        `${chemin} n'est pas un PNG et aucun convertisseur (magick, convert, ffmpeg) n'est installé : convertir l'image en PNG`,
      );
    }
    return decoderPng(await Bun.file(sortie).bytes());
  } finally {
    await Bun.file(sortie)
      .delete()
      .catch(() => {});
  }
}

/** Dimensions d'un SVG : `viewBox`, sinon `width`/`height`, sinon 512 × 512. */
export function dimensionsSvg(svg: string): { largeur: number; hauteur: number } {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg);
  if (vb) return { largeur: Number(vb[1]), hauteur: Number(vb[2]) };
  const l = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  return { largeur: l ? Number(l[1]) : 512, hauteur: h ? Number(h[1]) : 512 };
}

/** Contenu interne d'un SVG (sans la balise racine) et son viewBox, pour l'imbriquer. */
export function imbriquable(svg: string): { viewBox: string; interieur: string } {
  const { largeur, hauteur } = dimensionsSvg(svg);
  const vb = /viewBox\s*=\s*["']([^"']+)["']/i.exec(svg)?.[1] ?? `0 0 ${largeur} ${hauteur}`;
  const debut = svg.indexOf(">", svg.search(/<svg[\s>]/i)) + 1;
  const fin = svg.lastIndexOf("</svg>");
  return { viewBox: vb, interieur: svg.slice(debut, fin) };
}
