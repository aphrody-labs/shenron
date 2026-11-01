import type { ReactNode } from "react";
import { KintoUn } from "../toriyama/KintoUn";
import { HeroTitles } from "./HeroTitles";

/**
 * Hero d'en-tête de page (Sagas/Films/Jeux/Episodes/News).
 *
 * Deux régimes :
 *  - **avec image** — une illustration qui parle DE la page (l'affiche du film,
 *    la bannière de la série). Cover animé (Ken Burns) + étagement d'overlays.
 *  - **sans image** (`image` omis) — hero typographique sur fond sobre. C'est
 *    le régime des index de l'encyclopédie : ils partageaient tous la même
 *    bannière promotionnelle d'un événement e-sport (`battle2026`), une image
 *    de 770 px étirée en pleine largeur, donc floue, sans rapport avec la
 *    rubrique et posée sous le titre — quatre défauts pour zéro information.
 *    Les couvertures officielles (Daizenshuu) font exactement l'inverse :
 *    fond neutre, grand titre, un seul accent.
 */
export function PageHero({
  eyebrow,
  title,
  lead,
  image,
  imageAlt,
  right,
  height = "md",
  imagePosition = "center",
  renderImage,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Omis = hero typographique (aucune image de fond). */
  image?: string;
  imageAlt?: string;
  right?: ReactNode;
  height?: "sm" | "md" | "lg";
  /** Cadrage vertical du cover (utile pour un visuel portrait recadré en bandeau). */
  imagePosition?: "center" | "top" | "bottom";
  renderImage?: (image: { src: string; alt: string; className: string }) => ReactNode;
}) {
  const h = image
    ? height === "sm"
      ? "min-h-[160px] md:min-h-[180px] py-4 md:py-5"
      : height === "lg"
        ? "min-h-[200px] md:min-h-[240px] py-5 md:py-6"
        : "min-h-[180px] md:min-h-[220px] py-4 md:py-5"
    : "min-h-[140px] md:min-h-[160px] py-5 md:py-6";
  const objPos =
    imagePosition === "top"
      ? "object-top"
      : imagePosition === "bottom"
        ? "object-bottom"
        : "object-center";
  return (
    <section
      className={`relative flex flex-col justify-center ${h} w-full overflow-hidden border-b-2 border-black/80 shadow-[0_2px_0px_rgba(231,130,32,0.3)] ${
        image ? "vignette film-grain" : ""
      }`}
    >
      {image && (
        <>
          {renderImage?.({
            src: image,
            alt: imageAlt ?? "",
            className: `object-cover ${objPos} ken-burns`,
          }) ?? (
            <img
              src={image}
              alt={imageAlt ?? ""}
              className={`absolute inset-0 size-full object-cover ${objPos} ken-burns`}
            />
          )}
          {/* Étagement des dégradés : verticale (lisibilité texte) + horizontale + halo bas */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/25" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-transparent to-black/45" />
          {/* Nappe d'énergie ki en haut, discrète */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1/2 aurora opacity-40 pointer-events-none"
          />
          {/* Trame demi-teinte façon planche manga */}
          <div className="absolute inset-0 halftone opacity-[0.07] mix-blend-overlay pointer-events-none" />
          {/* Lignes de vitesse — focus action façon planche Toriyama */}
          <div
            aria-hidden
            className="absolute inset-0 speed-lines opacity-[0.05] pointer-events-none"
          />
        </>
      )}
      {!image && (
        /*
         * Les fiches de détail n'ont pas toujours une illustration éditoriale
         * fiable. On garde néanmoins un repère visuel DBFR, issu des assets
         * locaux, sans faire passer une image générique pour le sujet de la fiche.
         */
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_85%_at_18%_0%,rgba(231,130,32,0.11),transparent_70%)]"
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 screentone opacity-40" />
          <KintoUn
            decorative
            hauteur={170}
            className="pointer-events-none absolute right-[-2rem] top-1/2 hidden -translate-y-1/2 opacity-[0.16] saturate-[0.8] md:block"
          />
        </>
      )}

      <div
        className={`relative mx-auto max-w-[1280px] px-6 lg:px-10 flex ${
          image ? "items-end" : "items-center"
        }`}
      >
        <div className="min-w-0 flex-1 max-w-2xl reveal-up">
          <HeroTitles eyebrow={eyebrow} title={title} lead={lead} regime="compact" />
        </div>
        {right && <div className="shrink-0 ml-6 hidden md:block">{right}</div>}
      </div>

      <div
        className={`absolute bottom-0 inset-x-0 h-[2px] ${
          image
            ? "bg-gradient-to-r from-transparent via-dbz-orange to-transparent"
            : "bg-white/[0.08]"
        }`}
      />
    </section>
  );
}
