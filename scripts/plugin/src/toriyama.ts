/**
 * Géométrie Toriyama hors ligne du plugin « shenron ».
 *
 * Point d'entrée empaqueté par `scripts/plugin/build-references.ts` dans
 * `plugin/skills/toriyama-svg/scripts/toriyama.js` : la géométrie unique de
 * `packages/ui/src/toriyama-svg/` (arcs, volutes, mèches, sphère, Kinto-Un,
 * motifs de couverture) voyage avec la skill, sans dépôt ni dépendance.
 *
 * Bibliothèque : `import { arcs, volute, kintoUn, svgSphere } from "./toriyama.js"`.
 * Ligne de commande (SVG sur la sortie standard, ou `--sortie fichier.svg`) :
 *   bun toriyama.js sphere 4
 *   bun toriyama.js kinto-un [illustration|icone|icone-petite|maskable|monochrome]
 *   bun toriyama.js banc-nuage
 *   bun toriyama.js etoile [R]
 *   bun toriyama.js mesures            constantes mesurées (JSON)
 */
import {
  SPHERE_BOITE,
  SPHERE_DEGRADE,
  SPHERE_ENCRE,
  SPHERE_FOYER,
  SPHERE_R_EXT,
  SPHERE_R_INT,
  SPHERE_ROUGE_ETOILE,
  SPHERE_R_ETOILE,
  couverture,
  etoilesSphere,
  kintoUn,
  nombreEtoiles,
} from "../../../packages/ui/src/toriyama-svg/index";

export * from "../../../packages/ui/src/toriyama-svg/index";

/** SVG complet d'une Dragon Ball à `n` étoiles (même balisage que `<DragonBall>`). */
export function svgSphere(n: number): string {
  const k = nombreEtoiles(n);
  const gid = `db-sphere-${k}`;
  const arrets = SPHERE_DEGRADE.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  const etoiles = etoilesSphere(k)
    .map((p) => `<polygon points="${p}" fill="${SPHERE_ROUGE_ETOILE}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SPHERE_BOITE} ${SPHERE_BOITE}" role="img" aria-labelledby="${gid}-t">
<title id="${gid}-t">Dragon Ball à ${k} étoile${k > 1 ? "s" : ""}</title>
<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_INT}" fx="${SPHERE_FOYER.x}" fy="${SPHERE_FOYER.y}">${arrets}</radialGradient></defs>
<circle cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_EXT}" fill="${SPHERE_ENCRE}"/>
<circle cx="${SPHERE_R_EXT}" cy="${SPHERE_R_EXT}" r="${SPHERE_R_INT}" fill="url(#${gid})"/>
${etoiles}
</svg>
`;
}

/** Étoile de couverture (r/R = 0,45 mesuré), viewBox au plus juste de l'encre. */
export function svgEtoile(R = 50, couleur = SPHERE_ROUGE_ETOILE): string {
  const { viewBox, cx, cy } = couverture.etoileViewBox(R);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${couverture.etoilePath(cx, cy, R)}" fill="${couleur}"/></svg>
`;
}

/** Constantes mesurées (pas les choix de mise en page non sourcés). */
export function mesures() {
  return {
    sphere: {
      boite: SPHERE_BOITE,
      rayonExterieur: SPHERE_R_EXT,
      rayonInterieur: SPHERE_R_INT,
      foyer: SPHERE_FOYER,
      degrade: SPHERE_DEGRADE,
      rougeEtoile: SPHERE_ROUGE_ETOILE,
      rayonEtoileUnique: SPHERE_R_ETOILE[1],
      note: "Seule la boule à une étoile est mesurée ; la disposition des étoiles 2 à 7 est une mise en page non sourcée.",
    },
    kintoUn: {
      couleurs: kintoUn.KINTO_UN_COULEURS,
      illustration: {
        largeur: kintoUn.KINTO_UN_ILLUSTRATION.largeur,
        hauteur: kintoUn.KINTO_UN_ILLUSTRATION.hauteur,
        traits: kintoUn.KINTO_UN_ILLUSTRATION.traits,
      },
      icone: {
        largeur: kintoUn.KINTO_UN_ICONE.largeur,
        hauteur: kintoUn.KINTO_UN_ICONE.hauteur,
        traits: kintoUn.KINTO_UN_ICONE.traits,
      },
    },
    couverture: {
      cadreCase: couverture.CADRE_CASE,
      nuage: couverture.NUAGE_MESURES,
      pastille: couverture.PASTILLE,
      etoileInterieur: couverture.ETOILE_INTERIEUR,
    },
  };
}

function dessiner(args: string[]): string | null {
  const [commande, variante] = args;
  switch (commande) {
    case "sphere":
      return svgSphere(Number(variante ?? 1));
    case "kinto-un":
      switch (variante ?? "illustration") {
        case "illustration":
          return kintoUn.svgIllustration();
        case "icone":
          return kintoUn.svgIcone();
        case "icone-petite":
          return kintoUn.svgIcone({ volutes: false });
        case "maskable":
          return kintoUn.svgIcone({ coins: 0, echelle: 0.8 });
        case "monochrome":
          return kintoUn.svgMonochrome();
        default:
          return null;
      }
    case "banc-nuage":
      return couverture.svgBancNuage();
    case "etoile":
      return svgEtoile(Number(variante ?? 50));
    case "mesures":
      return `${JSON.stringify(mesures(), null, 2)}\n`;
    default:
      return null;
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const iS = args.indexOf("--sortie");
  const sortie = iS >= 0 ? args[iS + 1] : undefined;
  const reste = iS >= 0 ? args.filter((_, i) => i !== iS && i !== iS + 1) : args;
  const contenu = dessiner(reste);
  if (!contenu) {
    console.error(
      "usage : bun toriyama.js sphere <1-7> | kinto-un [illustration|icone|icone-petite|maskable|monochrome] | banc-nuage | etoile [R] | mesures [--sortie fichier]",
    );
    process.exit(1);
  }
  if (sortie) {
    await Bun.write(sortie, contenu);
    console.error(`${sortie} — ${contenu.length} o`);
  } else process.stdout.write(contenu);
}
