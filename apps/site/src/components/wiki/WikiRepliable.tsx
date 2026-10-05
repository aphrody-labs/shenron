"use client";

/**
 * Bloc repliable au téléphone, toujours ouvert sur grand écran — l'infobox
 * d'une fiche. Au téléphone, l'en-tête est un bouton (`aria-expanded`) ; à
 * partir de 1024 px, c'est un simple titre et le contenu reste affiché.
 *
 * Ouvert par défaut : le rendu serveur montre la fiche complète, le lecteur la
 * replie s'il veut aller droit au texte.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronBas } from "@shenron/ui/icones";

export function WikiRepliable({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <>
      <h2 className="lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left font-display text-sm font-semibold text-os focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kinto-lumiere"
        >
          {title}
          <ChevronBas
            size={16}
            className={`text-os/60 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <h2 className="hidden px-4 pb-1 pt-3 font-display text-sm font-semibold text-os lg:block">
        {title}
      </h2>
      <div id={id} className={open ? "" : "hidden lg:block"}>
        {children}
      </div>
    </>
  );
}
