/**
 * Sommaire d'un article, en deux présentations d'une même liste :
 *
 *  - **mobile et tablette** (`ArticleTocDisclosure`) : un `<details>` natif posé
 *    au-dessus du corps. Il était jusqu'ici simplement masqué sous `lg` : sur
 *    téléphone, le lecteur d'un long dossier n'avait aucun moyen de sauter à une
 *    partie. Le `<details>` s'ouvre au toucher comme au clavier (Entrée, Espace)
 *    sans une ligne de JavaScript, et le contenu reste dans le HTML caché du CDN ;
 *  - **desktop** (`ArticleTocRail`) : la colonne collante à côté du texte, le
 *    schéma liste-détail des grands écrans.
 *
 * Server component.
 */
import type { PostHeading } from "@/lib/posts";
import { T } from "@/components/T";

function TocList({ headings }: { headings: readonly PostHeading[] }) {
  return (
    <ol className="space-y-1">
      {headings.map((h) => (
        <li key={h.id} style={{ paddingInlineStart: `${(h.level - 2) * 0.85}rem` }}>
          {/* 44 px de haut : une entrée de sommaire se vise au pouce. */}
          <a
            href={`#${h.id}`}
            className="flex min-h-11 items-center rounded-sm text-[0.875rem] leading-snug text-[color:var(--ed-ink-muted)] hover:text-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
          >
            {h.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Sommaire repliable, au-dessus du corps — masqué à partir de `lg`. */
export function ArticleTocDisclosure({ headings }: { headings: readonly PostHeading[] }) {
  return (
    <details className="ed-no-print group mb-10 rounded-lg border border-white/12 px-4 lg:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-3 text-[0.9375rem] font-semibold text-[color:var(--ed-ink)]">
          <T k="communaute.news.toc" />
          <span className="text-[0.8125rem] font-normal tabular-nums text-[color:var(--ed-ink-muted)]">
            {headings.length}
          </span>
        </span>
        <span
          aria-hidden
          className="text-dbz-orange transition-transform group-open:rotate-180 motion-reduce:transition-none"
        >
          ▾
        </span>
      </summary>
      <nav aria-label="Sommaire de l'article" className="pb-4">
        <TocList headings={headings} />
      </nav>
    </details>
  );
}

/** Colonne collante du sommaire — visible à partir de `lg`. */
export function ArticleTocRail({ headings }: { headings: readonly PostHeading[] }) {
  return (
    <aside className="ed-no-print hidden lg:block">
      <div className="sticky top-24">
        <p className="border-b border-[color:var(--ed-rule)] pb-2 text-[0.9375rem] font-semibold text-[color:var(--ed-ink)]">
          <T k="communaute.news.toc" />
        </p>
        <nav aria-label="Sommaire de l'article" className="mt-3">
          <TocList headings={headings} />
        </nav>
      </div>
    </aside>
  );
}
