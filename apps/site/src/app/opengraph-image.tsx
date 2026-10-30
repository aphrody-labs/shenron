import { ImageResponse } from "next/og";
import { svgIllustration } from "@/lib/kinto-un";
import { DRAGONBALLFR_LOGO_SIZE, DRAGONBALLFR_LOGO_SVG } from "@/lib/dragonballfr-logo.generated";

export const alt = "DragonBall.fr — le portail francophone";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OG image de marque par défaut (1200×630), générée à la volée par `next/og`.
 * Héritée par toutes les routes qui ne définissent pas leur propre image OG.
 * Styles inline uniquement, police système (latin) → aucun fetch externe.
 *
 * Le logo DRAGONBALL.FR (`dragonballfr-logo.generated.ts`) est passé en SVG encodé.
 */
export default function OpengraphImage() {
  // Le Kinto-Un est passé en image encodée : Satori accepte un SVG en URL de
  // données et le rend tel quel, ce qui évite de redessiner la géométrie ici.
  const nuage = `data:image/svg+xml;base64,${Buffer.from(svgIllustration()).toString("base64")}`;
  const logo = `data:image/svg+xml;base64,${Buffer.from(DRAGONBALLFR_LOGO_SVG).toString("base64")}`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background:
          "radial-gradient(circle at 78% 26%, rgba(82,197,239,0.22), transparent 55%), radial-gradient(circle at 18% 88%, rgba(255,178,0,0.16), transparent 55%), #0a0a0a",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      {/* Le nuage, en filigrane haut-droite : c'est le repère de marque du site
			    (barre, favicons, chargements), il doit être sur la carte de partage. */}
      <img
        src={nuage}
        width={520}
        height={293}
        alt=""
        style={{ position: "absolute", top: 54, right: -40, opacity: 0.5 }}
      />

      <div
        style={{
          display: "flex",
          fontSize: 28,
          letterSpacing: 8,
          textTransform: "uppercase",
          color: "#e78220",
          fontWeight: 700,
          marginBottom: 22,
        }}
      >
        Le portail francophone
      </div>

      <img
        src={logo}
        width={880}
        height={Math.round((880 * DRAGONBALLFR_LOGO_SIZE.height) / DRAGONBALLFR_LOGO_SIZE.width)}
        alt=""
      />

      <div
        style={{
          display: "flex",
          marginTop: 36,
          fontSize: 32,
          color: "rgba(255,255,255,0.82)",
          maxWidth: 760,
        }}
      >
        Épisodes, films, manga &amp; actualités — l&apos;univers Dragon Ball en français.
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 26,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: 2,
        }}
      >
        dragonballfr.com
      </div>
    </div>,
    size,
  );
}
