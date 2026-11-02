/**
 * SectionDivider — séparateur de sections : un filet fin, et au centre trois
 * étoiles (l'étoile de couverture mesurée, `couverture.ts`). Décor pur.
 */
import { Etoile } from "../toriyama/MotifsCouverture";

export function SectionDivider({ className = "my-10" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`vie-divider flex items-center gap-3 text-dbz-gold/60 ${className}`}
    >
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <Etoile key={i} taille={i === 1 ? 12 : 8} />
        ))}
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}
