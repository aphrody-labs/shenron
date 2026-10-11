"use client";

/**
 * Hôte de la palette ⌘K du shell.
 *
 * Le shell (`@aphrody/shenron-ui/navigation/AppShell`) porte le bouton de recherche et les
 * raccourcis ⌘K / Ctrl+K ; ce module ne fait que charger la palette (`CommandPalette`, avec
 * `cmdk` et ses groupes de résultats) à la demande : au premier survol ou focus du bouton,
 * ou à la première ouverture. Un visiteur qui ne cherche jamais ne télécharge jamais ce code.
 */
import dynamic from "next/dynamic";

// `ssr: false` : la palette n'a rien à rendre côté serveur (elle est fermée) et n'existe
// que suite à une interaction.
const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });

export function CommandMenu({
  open,
  onOpenChange,
  armed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le code est demandé dès l'intention (survol, focus) : rouvrir est instantané. */
  armed: boolean;
}) {
  if (!open && !armed) return null;
  return <CommandPalette open={open} onOpenChange={onOpenChange} />;
}
