import type { ReactNode } from "react";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";

/**
 * Squelettes des rubriques médias (manga, databooks, épisodes, films, jeux) — dans la même
 * colonne `PageShell` que la page qu'ils annoncent, pour que rien ne saute quand elle arrive.
 * Ils remplacent les squelettes à conteneur propre (`IndexSkeleton`, `BillboardSkeleton`,
 * gabarits recopiés dans chaque `loading.tsx`).
 */
function HeaderSkeleton() {
  return (
    <div className="mb-8 border-b border-white/[0.08] pb-6" aria-hidden>
      <div className="mb-3 h-3 w-28 animate-pulse rounded bg-dbz-orange/25" />
      <div className="mb-3 h-10 w-3/4 max-w-xl animate-pulse rounded bg-white/15" />
      <div className="h-4 w-full max-w-lg animate-pulse rounded bg-white/10" />
    </div>
  );
}

/** Index de rubrique : en-tête, bannière, puis le contenu propre à la rubrique. */
export function MediaIndexSkeleton({
  children,
  banner = true,
}: {
  children?: ReactNode;
  banner?: boolean;
}) {
  return (
    <PageShell rhythm="tight">
      <div role="status" aria-label="Chargement de la rubrique">
        <HeaderSkeleton />
        {banner ? (
          <div className="mb-8 aspect-[2/1] w-full animate-pulse rounded-xl bg-dbz-card sm:aspect-[3/1] lg:aspect-[4/1]" />
        ) : null}
        {children ?? <GridSkeleton />}
      </div>
    </PageShell>
  );
}

/** Grille de vignettes (couvertures 2:3 par défaut, `video` pour des épisodes). */
export function GridSkeleton({
  count = 12,
  ratio = "poster",
}: {
  count?: number;
  ratio?: "poster" | "video";
}) {
  return (
    <div
      className={`grid gap-4 ${
        ratio === "video"
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
      }`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-xl bg-dbz-card ring-1 ring-white/[0.06] ${
            ratio === "video" ? "aspect-video" : "aspect-[2/3]"
          }`}
        />
      ))}
    </div>
  );
}

/** Fiche d'œuvre : couverture à gauche (desktop), titre, lecteur ou texte. */
export function MediaDetailSkeleton({ player = false }: { player?: boolean }) {
  return (
    <PageShell rhythm="tight">
      <div role="status" aria-label="Chargement de la fiche">
        <HeaderSkeleton />
        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <div className="mx-auto aspect-[2/3] w-48 animate-pulse rounded-xl bg-dbz-card ring-1 ring-white/[0.06] lg:w-full" />
          <div className="space-y-4">
            {player ? (
              <div className="aspect-video w-full animate-pulse rounded-xl bg-dbz-card ring-1 ring-white/[0.06]" />
            ) : null}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.06]" />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`h-3 animate-pulse rounded bg-white/[0.07] ${i === 3 ? "w-2/3" : "w-full"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
