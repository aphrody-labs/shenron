// SPDX-License-Identifier: Apache-2.0
/**
 * Squelettes des pages du wiki (`loading.tsx`).
 *
 * Les pièces (grille, liste de cartes, barre d'outils, bandeau) viennent de
 * `@aphrody/shenron-ui/public/WikiSkeleton`. L'assemblage de page se fait ici, dans la
 * même colonne que la page qui va s'afficher (`PageShell`) : le squelette du
 * paquet refaisait sa propre largeur (1 400 px, gouttière de 24 px) et le
 * contenu sautait de côté à l'arrivée de la page.
 */
import type { ReactNode } from "react";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { GridSkeleton, ToolbarSkeleton } from "@aphrody/shenron-ui/public/WikiSkeleton";
import { FICHE_GRID } from "@/components/wiki/fiche-layout";

export {
  CardListSkeleton,
  GridSkeleton,
  HeroSkeleton,
  ToolbarSkeleton,
} from "@aphrody/shenron-ui/public/WikiSkeleton";

/** En-tête de page (`PageHeader`) en attente. */
function HeaderSkeleton() {
  return (
    <div className="mb-8 border-b border-white/[0.08] pb-6">
      <div className="mb-3 h-3 w-28 animate-pulse rounded bg-white/10" />
      <div className="mb-3 h-10 w-2/3 max-w-xl animate-pulse rounded bg-white/15" />
      <div className="h-4 w-full max-w-lg animate-pulse rounded bg-white/10" />
    </div>
  );
}

/** Page d'index complète : en-tête, barre d'outils, grille. */
export function IndexSkeleton({ children }: { children?: ReactNode }) {
  return (
    <PageShell rhythm="tight">
      <div aria-busy="true" aria-live="polite">
        <HeaderSkeleton />
        <div className="space-y-8">
          <ToolbarSkeleton />
          {children ?? <GridSkeleton />}
        </div>
      </div>
    </PageShell>
  );
}

/** Fiche : en-tête, puis contenu et colonne latérale (infobox). */
export function FicheSkeleton() {
  return (
    <PageShell rhythm="tight">
      <div aria-busy="true" aria-live="polite">
        <HeaderSkeleton />
        <div className={FICHE_GRID}>
          <div className="aspect-[3/4] max-h-80 animate-pulse rounded-xl bg-white/[0.06] lg:col-start-2 lg:row-start-1 lg:max-h-none" />
          <div className="space-y-3 lg:col-start-1 lg:row-start-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-white/[0.06]"
                style={{ width: `${70 + ((i * 13) % 30)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
