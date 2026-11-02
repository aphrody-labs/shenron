/**
 * VieStage — enveloppe un en-tête de page qui n'utilise pas `PageHeader` (titre
 * de section, hero maison) : lignes de vitesse en fond et scène décorative à droite
 * (desktop seulement). Le contenu passe au-dessus (`z-10`), le contraste du texte
 * ne dépend jamais du décor.
 */
import type { ReactNode } from "react";
import { VieArt, type VieArtKind } from "./VieArt";

export function VieStage({
  art,
  children,
  className = "",
}: {
  art: VieArtKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`vie-speed relative overflow-hidden ${className}`}>
      <VieArt
        kind={art}
        className="absolute bottom-0 right-2 origin-bottom-right scale-[.8] opacity-60 max-lg:invisible xl:right-10"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
