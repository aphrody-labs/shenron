/**
 * WikiArticle — rendu d'un article wiki long-format encyclopédique + ses sources.
 *
 * Article = corps markdown riche (sections, listes, tableaux, HTML mis en page)
 * rendu via <WikiMarkdown/> (sanitize owner-trust). Le bloc « Sources » liste les
 * références citées dans l'article (`articleSources`) en pied façon encyclopédie,
 * avec lien externe quand l'URL est connue. RSC pur (aucun "use client").
 *
 * Drop-in sur toute page détail wiki (personnage, planète, saga, arc, technique).
 */
import type { WikiSource } from "@/lib/shenron";
import {
  normalizeSectionAccent,
  sectionAccentStyle,
  type SectionAccent,
} from "@/lib/wiki-section-accents";
import { WikiMarkdown } from "./WikiMarkdown";

/** Libellé court du type de source (kind RAG → étiquette FR). */
function kindLabel(kind: string): string {
  switch (kind) {
    case "manga_chapter":
    case "manga_volume":
      return "Manga";
    case "character":
    case "technique":
    case "transformation":
    case "planet":
    case "saga":
    case "arc":
    case "race":
      return "Base DBFR";
    case "episode":
      return "Épisode";
    case "movie":
      return "Film";
    case "game":
      return "Jeu";
    case "databook":
    case "databooks":
      return "Databook";
    default:
      return "Source";
  }
}

export function WikiArticle({
  article,
  sources,
  heading = "Article",
  accent = "orange",
}: {
  article: string;
  sources?: WikiSource[] | null;
  heading?: string;
  /** Couleur d'accent du bandeau (orange par défaut, varie par type d'entité). */
  accent?: SectionAccent;
}) {
  const style = sectionAccentStyle(normalizeSectionAccent(accent));
  const cited = (sources ?? []).filter((s) => s && s.label);

  return (
    <section className="reveal-up" style={{ animationDelay: "0.45s" }}>
      <div className="wiki-content-card relative overflow-hidden rounded-xl border border-dbz-border bg-dbz-card/95 p-6 sm:p-8 lg:p-10">
        <div className={`absolute top-0 left-0 w-1.5 h-full ${style.bar}`} />
        <div className="flex items-center gap-6 mb-8">
          <h2
            className={`${style.text} font-sans font-extrabold text-2xl sm:text-3xl md:text-4xl uppercase tracking-wider`}
          >
            {heading}
          </h2>
          <div className={`h-0.5 flex-1 bg-gradient-to-r ${style.line} to-transparent`} />
        </div>

        <div className="prose prose-invert max-w-none wiki-content wiki-lore text-gray-100 text-base md:text-[17px] leading-relaxed selection:bg-dbz-orange selection:text-black">
          <WikiMarkdown body={article} />
        </div>

        {cited.length > 0 && (
          <footer className="mt-10 pt-6 border-t-2 border-black/80">
            <h3 className="text-xs font-black text-dbz-orange uppercase tracking-widest mb-4 font-mono">
              SOURCES & RÉFÉRENCES //
            </h3>
            <SourceList cited={cited} accentClass={style.text} />
          </footer>
        )}
      </div>
    </section>
  );
}

/** Liste `<ol>` des références citées (partagée footer / bloc autonome). */
function SourceList({ cited, accentClass }: { cited: WikiSource[]; accentClass: string }) {
  return (
    <ol className="grid gap-2 text-sm sm:grid-cols-2">
      {cited.map((s) => (
        <li
          key={s.n}
          id={`ref-${s.n}`}
          className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-white/70 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]"
        >
          <span
            className={`mt-0.5 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${accentClass}`}
          >
            [{s.n}]
          </span>
          <div className="min-w-0 flex-1">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-white transition-colors link-underline break-words font-medium text-white/85"
              >
                {s.label}
              </a>
            ) : (
              <span className="break-words font-medium text-white/80">{s.label}</span>
            )}
            <span className="ml-2 inline-block rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/50">
              {kindLabel(s.kind)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Bloc « Sources & références » autonome (panneau propre), à rendre **une seule
 * fois** sous le sélecteur de catégories quand l'article a été éclaté en
 * plusieurs panneaux (les [n] cités restent répartis dans les sections, mais la
 * bibliographie s'affiche en pied de fiche). Se masque si aucune source.
 */
export function WikiSources({
  sources,
  accent = "orange",
}: {
  sources?: WikiSource[] | null;
  accent?: SectionAccent;
}) {
  const cited = (sources ?? []).filter((s) => s && s.label);
  if (cited.length === 0) return null;
  const style = sectionAccentStyle(normalizeSectionAccent(accent));
  return (
    <section className="dbz-panel p-6 sm:p-8">
      {/* `h2` et non `h3` : ce panneau est autonome, posé en pied de fiche à
			    côté des rubriques (Transformations, Personnages affiliés…) qui
			    titrent toutes en `h2`. En `h3`, il se donnait pour une sous-partie
			    de la dernière rubrique affichée, avec laquelle il n'a rien à voir.
			    Le `h3` de `WikiArticle` reste juste, lui : il vit dans le `<footer>`
			    d'une section qui porte déjà son `h2`. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs font-bold text-white/65 uppercase tracking-[0.24em]">
          Sources & références
        </h2>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-white/55">
          {cited.length} réf.
        </span>
      </div>
      <SourceList cited={cited} accentClass={style.text} />
    </section>
  );
}
