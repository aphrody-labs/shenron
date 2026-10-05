/**
 * FeedStream — le rendu du fil d'actualité unifié.
 *
 * Quatre natures d'événements cohabitent (article, modification du wiki,
 * contribution acceptée, discussion) et elles n'ont ni le même poids ni la même
 * forme : un article mérite sa vignette et son chapô, une révision de fiche tient
 * en une ligne. Les afficher toutes avec la même carte donnerait un mur plat où
 * l'éditorial se noie ; leur donner quatre mises en page étrangères casserait la
 * lecture. Compromis tenu ici : **une seule colonne, une seule grammaire
 * visuelle** (badge de nature + titre + acteur + date), et seul l'article gagne
 * une vignette et un chapô.
 *
 * Trois usages, un seul composant :
 *  - `FeedStream` — le fil du journal (`/news`, `/news/fil`) ;
 *  - `FeedStream compact` — la colonne « nouveautés » de l'accueil : une ligne
 *    par événement, toute la ligne cliquable (cible tactile pleine largeur) ;
 *  - `FeedLead` — l'article mis en avant en tête de l'accueil.
 *
 * Server component : aucune interaction, donc aucun JavaScript envoyé.
 */
import Image from "next/image";
import Link from "next/link";
import { Chip, ChipRow, SocialCounts } from "@/components/kit";
import type { FeedEntry, FeedKind } from "@/lib/feed";

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Date courte relative pour l'immédiat, absolue au-delà — lisible dans un fil. */
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const minutes = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 60 * 24) return `il y a ${Math.round(minutes / 60)} h`;
  return dateFormat.format(d);
}

/** Couleur du liseré gauche par nature — le repère qu'on attrape en défilant. */
const KIND_ACCENT: Record<FeedKind, string> = {
  article: "border-l-dbz-orange",
  wiki: "border-l-[color:var(--color-toriyama-capsule,#00bcd4)]",
  contribution: "border-l-[color:var(--color-toriyama-shenron,#1b7340)]",
  discussion: "border-l-white/30",
};

export function FeedStream({
  entries,
  compact = false,
}: {
  entries: readonly FeedEntry[];
  /** Une ligne par événement, sans chapô ni étiquettes (colonne de l'accueil). */
  compact?: boolean;
}) {
  return (
    <ol className={compact ? "space-y-2" : "space-y-4"}>
      {entries.map((entry) => (
        <li key={entry.id}>{compact ? <FeedLine entry={entry} /> : <FeedRow entry={entry} />}</li>
      ))}
    </ol>
  );
}

/** En-tête commun : nature, acteur, date, temps de lecture. */
function FeedMeta({ entry }: { entry: FeedEntry }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-[0.625rem] font-bold uppercase tracking-[0.12em]">
      <span className="text-dbz-orange">{entry.badge}</span>
      {entry.actor && <span className="text-white/50">{entry.actor}</span>}
      <time dateTime={entry.at} className="text-white/45">
        {when(entry.at)}
      </time>
      {entry.readingMinutes !== null && (
        <span className="text-white/45">{entry.readingMinutes} min</span>
      )}
    </p>
  );
}

function FeedRow({ entry }: { entry: FeedEntry }) {
  const isArticle = entry.kind === "article";
  const Title = entry.href ? (
    <Link href={entry.href} className="transition-colors hover:text-dbz-orange">
      {entry.title}
    </Link>
  ) : (
    <>{entry.title}</>
  );

  return (
    <article
      className={`flex gap-4 rounded-xl border border-white/[0.08] border-l-[3px] bg-dbz-card/80 p-4 transition-colors hover:border-dbz-gold/50 sm:gap-5 sm:p-5 ${KIND_ACCENT[entry.kind]}`}
    >
      {/* La vignette n'apparaît que pour l'éditorial : une révision de fiche n'a
			    pas d'image propre, et en inventer une serait décoratif. */}
      {isArticle && entry.image && (
        <Link
          href={entry.href ?? "#"}
          tabIndex={-1}
          aria-hidden
          className="relative hidden w-[160px] shrink-0 overflow-hidden rounded-lg border border-white/[0.08] sm:block"
        >
          <Image
            src={entry.image}
            alt=""
            width={160}
            height={100}
            sizes="160px"
            quality={70}
            className="h-full w-full object-cover"
          />
        </Link>
      )}

      <div className="min-w-0 flex-1">
        <FeedMeta entry={entry} />

        <h3
          className={`mt-1.5 font-display font-bold leading-[1.22] tracking-[-0.012em] text-white ${
            isArticle
              ? "text-[1.0625rem] sm:text-[1.25rem]"
              : "text-[0.9375rem] sm:text-[1.0625rem]"
          }`}
        >
          {Title}
        </h3>

        {entry.summary && (
          <p className="mt-1.5 line-clamp-2 text-[0.875rem] leading-relaxed text-white/60">
            {entry.summary}
          </p>
        )}

        {(entry.fields.length > 0 || entry.tags.length > 0) && (
          <ChipRow className="mt-2.5">
            {entry.fields.map((f) => (
              <Chip key={f} tone="quiet">
                {f}
              </Chip>
            ))}
            {entry.tags.slice(0, 3).map((t) => (
              <Chip
                key={t}
                tone="neutral"
                href={`/news/theme/${encodeURIComponent(t.toLowerCase())}`}
              >
                {t}
              </Chip>
            ))}
          </ChipRow>
        )}

        {/* Glyphes du jeu maison, pas d'emoji : DESIGN.md les exclut de
				    l'interface, et « 💬 » se dessine différemment par système. */}
        <SocialCounts className="mt-2.5" likes={entry.likes} comments={entry.comments} />
      </div>
    </article>
  );
}

/**
 * Une ligne de fil : toute la carte est la cible (lien étiré sur le titre),
 * aucun autre élément interactif dedans — donc rien à rater au pouce.
 */
function FeedLine({ entry }: { entry: FeedEntry }) {
  return (
    <article
      className={`relative min-h-14 rounded-xl border border-white/[0.08] border-l-[3px] bg-dbz-card/80 px-3.5 py-2.5 transition-colors focus-within:border-dbz-gold hover:border-dbz-gold/60 ${KIND_ACCENT[entry.kind]}`}
    >
      <FeedMeta entry={entry} />
      <h3 className="mt-1 line-clamp-2 font-display text-[0.9375rem] font-bold leading-snug text-white">
        {entry.href ? (
          <Link
            href={entry.href}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-dbz-orange"
          >
            {entry.title}
          </Link>
        ) : (
          entry.title
        )}
      </h3>
    </article>
  );
}

/** L'article mis en avant : image 16:9, titre, chapô. */
export function FeedLead({ entry, priority = false }: { entry: FeedEntry; priority?: boolean }) {
  const body = (
    <>
      {entry.image && (
        <span className="relative block aspect-video overflow-hidden bg-dbz-bg">
          <Image
            src={entry.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 40vw, (min-width: 768px) 50vw, 100vw"
            quality={70}
            priority={priority}
            className="object-cover"
          />
        </span>
      )}
      <span className="block p-4 sm:p-5">
        <FeedMeta entry={entry} />
        <span className="mt-1.5 block font-display text-[1.125rem] font-bold leading-snug text-white transition-colors group-hover:text-dbz-gold sm:text-[1.3125rem]">
          {entry.title}
        </span>
        {entry.summary && (
          <span className="mt-2 line-clamp-3 block text-sm leading-relaxed text-white/65">
            {entry.summary}
          </span>
        )}
      </span>
    </>
  );
  const frame =
    "group block h-full overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card/80 transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";
  return entry.href ? (
    <Link href={entry.href} className={frame}>
      {body}
    </Link>
  ) : (
    <article className={frame}>{body}</article>
  );
}
