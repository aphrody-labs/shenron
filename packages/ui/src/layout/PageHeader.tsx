import type { ReactNode } from "react";
import { HeroTitles } from "./HeroTitles";

/**
 * En-tête de page **interne** — celui qui vit à l'intérieur d'un conteneur,
 * là où `PageHero` (bandeau pleine largeur) ne peut pas aller : jeux, boutique,
 * classements, commandes, tierlists, statistiques, bureau.
 *
 * Il partage la grammaire de `PageHero` via `<HeroTitles>` : accent orange, titre
 * `font-title`, alignement à gauche, filet de séparation. Le shell porte le fil
 * d'Ariane et la navigation globale : l'en-tête ne porte que le titre, son chapô
 * et, à droite sur desktop (dessous sur mobile), les actions propres à la page.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  size = "lg",
  className = "mb-8 md:mb-12",
}: {
  /** Surtitre orange. Omis, l'en-tête garde le filet mais pas la ligne d'accent. */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Boutons ou liens propres à la page (créer, filtrer, exporter). */
  actions?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <header className={`border-b border-white/[0.08] pb-6 ${className}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <HeroTitles
            eyebrow={eyebrow}
            title={title}
            lead={subtitle}
            regime={size === "md" ? "compact" : "plain"}
          />
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
