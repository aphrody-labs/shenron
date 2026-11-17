"use client";

/**
 * ResponsiveSections — des sections en accordéon sur mobile, toutes ouvertes en
 * deux colonnes sur desktop.
 *
 * Sur un téléphone, une page de réglages ou un profil empile cinq ou six blocs
 * hauts : le lecteur fait défiler trois écrans pour atteindre « Sessions ». Ici
 * chaque bloc se replie derrière son titre (le premier reste ouvert). Sur un
 * écran large, replier n'a plus de sens : tout est visible, sur deux colonnes.
 *
 * Accordéon de `@aphrody/shenron-ui/accordion` (Base UI), avec deux réglages :
 *  - `hidden={false}` sur le panneau. Base UI pose l'attribut `hidden` sur un
 *    panneau fermé, et le préambule de Tailwind v4 le verrouille par un
 *    `display: none !important` de la couche `base` — qu'aucun utilitaire
 *    `!important` ne peut défaire (les déclarations importantes d'une couche
 *    antérieure l'emportent). Le masquage passe donc par `max-lg:data-closed:hidden` :
 *    un panneau fermé n'est caché QUE sous `lg`, dès le HTML serveur, sans
 *    attendre l'hydratation et sans saut de mise en page sur desktop.
 *  - après hydratation, une requête média ouvre toutes les valeurs sur desktop
 *    et désactive les déclencheurs : `aria-expanded` dit alors la vérité, et un
 *    clic ne peut pas replier un panneau que le CSS garde visible.
 *
 * Les titres sont des `h3` (Base UI) : l'appelant pose au-dessus un `h2`
 * (visible ou `sr-only`) pour garder une hiérarchie de titres continue.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@aphrody/shenron-ui/accordion";

export interface ResponsiveSection {
  /** Identifiant stable (valeur de l'accordéon, ancre). */
  id: string;
  title: ReactNode;
  /** Précision alignée à droite du titre (compteur, statut). */
  meta?: ReactNode;
  content: ReactNode;
  /** Occupe les deux colonnes sur desktop (tableaux, zone de suppression). */
  wide?: boolean;
  /** Ton du cadre : `danger` pour une zone destructive. */
  tone?: "default" | "danger";
}

/** Point de rupture `lg` de Tailwind v4 (64rem). */
const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Vrai sur desktop après hydratation ; faux côté serveur (rendu mobile d'abord). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export function ResponsiveSections({
  sections,
  defaultOpen,
  className = "",
}: {
  sections: readonly ResponsiveSection[];
  /** Sections ouvertes au départ sur mobile. Par défaut : la première. */
  defaultOpen?: readonly string[];
  className?: string;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState<string[]>(() => [
    ...(defaultOpen ?? (sections[0] ? [sections[0].id] : [])),
  ]);
  const value = isDesktop ? sections.map((s) => s.id) : open;

  return (
    <Accordion
      multiple
      keepMounted
      value={value}
      disabled={isDesktop}
      onValueChange={(next) => {
        if (!isDesktop) setOpen(next.map(String));
      }}
      className={`grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-5 ${className}`}
    >
      {sections.map((section) => (
        <AccordionItem
          key={section.id}
          value={section.id}
          id={section.id}
          className={`scroll-mt-24 rounded-lg border bg-dbz-card/80 ${
            section.tone === "danger"
              ? "border-dbz-red/40 data-open:border-dbz-red/40"
              : "border-white/12 data-open:border-white/12"
          } ${section.wide ? "lg:col-span-2" : ""}`}
        >
          <AccordionTrigger
            className={`min-h-12 gap-3 rounded-lg px-4 py-3 font-semibold normal-case tracking-normal focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kinto-lumiere sm:px-5 lg:cursor-default lg:pb-0 lg:pt-5 lg:hover:text-white lg:[&>svg]:hidden ${
              section.tone === "danger" ? "text-red-100" : "text-white"
            } text-base`}
          >
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="min-w-0">{section.title}</span>
              {section.meta && (
                <span className="shrink-0 text-sm font-normal tabular-nums text-white/55">
                  {section.meta}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionPanel
            hidden={false}
            className="px-4 pb-5 text-[0.9375rem] text-white/80 max-lg:data-closed:hidden sm:px-5 lg:pt-0 [&>div]:border-white/12 lg:[&>div]:border-t-0 lg:[&>div]:pt-3"
          >
            {section.content}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
