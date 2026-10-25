"use client";

/**
 * Resume rail for saved reading visits and actual unfinished native playback.
 * Episode/movie visits require measured progress and exclude completed playback.
 * Their direct anchors open the full player instead of the catalogue quick look.
 *
 * Deux journaux locaux l'alimentent, et ce rail est le seul endroit qui les
 * réunit :
 *  - `lib/history` — épisodes, films, chapitres et databooks (`TrackHistory`) ;
 *  - `lib/historique-local` — les fiches du wiki (`noterVisite`), avec `wiki`
 *    activé. L'accueil et le sommaire du wiki l'activent : c'est là qu'un
 *    lecteur qui revient cherche où il s'était arrêté, quelle que soit la
 *    nature de la page.
 *
 * Rend `null` tant qu'il n'y a rien : un nouveau visiteur ne doit pas voir un
 * bloc vide. Le premier rendu est donc TOUJOURS `null` côté serveur ET au
 * montage client, puis l'état arrive après l'effet — c'est ce qui évite une
 * divergence d'hydratation (le serveur n'a aucun accès à `localStorage`).
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Croix } from "@aphrody/shenron-ui/icones";
import { WikiImg } from "@/components/wiki/WikiImg";
import { forgetHistory, readHistory, HISTORY_EVENT, type HistoryEntry } from "@/lib/history";
import { reprises } from "@/lib/historique-local";
import { useT } from "@/components/T";
import {
  readPlaybackProgress,
  PLAYBACK_PROGRESS_EVENT,
  playbackTimeLabel,
  type PlaybackProgress,
} from "@/lib/playback-progress";

/** Le type d'entrée, nommé par le dictionnaire : c'est une étiquette d'interface. */
const KIND_KEY: Record<HistoryEntry["kind"], string> = {
  episode: "history.kind.episode",
  movie: "history.kind.movie",
  chapter: "history.kind.chapter",
  databook: "history.kind.databook",
};

/** Une entrée affichable, quelle que soit sa source. */
export interface RailEntry {
  key: string;
  href: string;
  title: string;
  caption: string | null;
  image: string | null;
  at: number;
  /** Entrée média : seule celle-ci se retire une à une (`forgetHistory`). */
  media: HistoryEntry | null;
  progress?: PlaybackProgress;
}

/**
 * Fusionne les deux journaux, du plus récent au plus ancien, sans doublon
 * d'URL (une fiche ouverte depuis le lecteur et depuis le wiki n'apparaît
 * qu'une fois). Exporté pour les tests.
 */
export function mergeHistories(
  media: readonly HistoryEntry[],
  wiki: ReadonlyArray<{
    href: string;
    titre: string;
    rubrique: string;
    image?: string | null;
    vuLe: number;
  }>,
): RailEntry[] {
  const seen = new Set<string>();
  const all: RailEntry[] = [
    ...media.map((e) => ({
      key: `${e.kind}:${e.id}`,
      href: e.href,
      title: e.title,
      caption: e.caption ?? null,
      image: e.image ?? null,
      at: e.at,
      media: e,
    })),
    ...wiki.map((e) => ({
      key: `wiki:${e.href}`,
      href: e.href,
      title: e.titre,
      caption: e.rubrique || null,
      image: e.image ?? null,
      at: e.vuLe,
      media: null,
    })),
  ];
  return all
    .toSorted((a, b) => b.at - a.at)
    .filter((e) => (seen.has(e.href) ? false : (seen.add(e.href), true)));
}

function HistoryLink({
  entry,
  className,
  children,
}: {
  entry: RailEntry;
  className: string;
  children: ReactNode;
}) {
  return entry.media?.kind === "episode" || entry.media?.kind === "movie" ? (
    <a href={entry.href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={entry.href} className={className}>
      {children}
    </Link>
  );
}

export function ContinueRail({
  limit = 12,
  kinds,
  wiki = false,
  flush = false,
  titleKey = "history.resume",
  titleValues,
  className = "",
}: {
  limit?: number;
  /** Restreint le rail à certains types (ex. `["chapter"]` sur /wiki/manga). */
  kinds?: ReadonlyArray<HistoryEntry["kind"]>;
  /** Ajoute les fiches du wiki consultées (`lib/historique-local`). */
  wiki?: boolean;
  /** Sans marge basse : le parent (grille) gère l'espacement. */
  flush?: boolean;
  /** Clé de dictionnaire du titre du rail (`history.resume*`). */
  titleKey?: string;
  titleValues?: Record<string, string | number>;
  className?: string;
}) {
  const t = useT();
  const titre = t(titleKey, titleValues);
  const [items, setItems] = useState<RailEntry[] | null>(null);

  // Les appelants passent un littéral (`kinds={["episode"]}`) : sa référence
  // change à chaque rendu du parent. On dépend donc de son CONTENU, sinon
  // l'effet réinstalle l'écouteur d'historique et relit `localStorage` à
  // chaque rendu.
  //
  // Le « | » de tête sépare deux cas que la simple jointure confondait :
  // « aucun filtre » (`kinds` absent ⇒ tout l'historique) et « filtre vide »
  // (`kinds={[]}` ⇒ rien). Sans lui, les deux donnaient la même chaîne creuse
  // et une liste de types vide affichait l'historique ENTIER.
  const cleKinds = kinds ? `|${kinds.join(",")}` : "";

  useEffect(() => {
    const autorises = cleKinds ? new Set(cleKinds.slice(1).split(",").filter(Boolean)) : null;
    const load = () => {
      const media = readHistory().filter((e) => !autorises || autorises.has(e.kind));
      const fiches = wiki ? reprises() : [];
      const progress = readPlaybackProgress();
      setItems(
        mergeHistories(media, fiches)
          .flatMap((entry) => {
            if (entry.media?.kind !== "episode" && entry.media?.kind !== "movie") return [entry];
            const playback = progress.find(
              (item) => item.kind === entry.media!.kind && item.id === entry.media!.id,
            );
            if (!playback || playback.completed || playback.seconds < 15) return [];
            return [{ ...entry, progress: playback, at: playback.updatedAt }];
          })
          .toSorted((a, b) => b.at - a.at)
          .slice(0, limit),
      );
    };
    load();
    window.addEventListener(HISTORY_EVENT, load);
    window.addEventListener(PLAYBACK_PROGRESS_EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(HISTORY_EVENT, load);
      window.removeEventListener(PLAYBACK_PROGRESS_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [limit, cleKinds, wiki]);

  if (!items || items.length === 0) return null;

  return (
    <section className={`${flush ? "" : "mb-9 lg:mb-12"} ${className}`} aria-label={titre}>
      <h2 className="mb-3 flex items-baseline gap-2 font-display text-lg font-bold text-white sm:text-xl">
        <span className="inline-block h-4 w-1 rounded-full bg-dbz-orange" aria-hidden />
        {titre}
        <span className="text-[13px] font-normal text-white/50">{items.length}</span>
      </h2>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((e) => (
          <li key={e.key} className="relative shrink-0 snap-start">
            <HistoryLink
              entry={e}
              className="group block w-[200px] overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card transition-colors hover:border-dbz-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange sm:w-[232px]"
            >
              <div className="relative aspect-video overflow-hidden bg-black/40">
                <WikiImg
                  src={e.image}
                  alt=""
                  sizes="232px"
                  className="absolute inset-0 h-full w-full object-cover object-top opacity-90"
                />
                {e.progress && (
                  <progress
                    className="absolute inset-x-0 bottom-0 h-1 w-full accent-dbz-orange"
                    value={e.progress.seconds}
                    max={e.progress.duration}
                    aria-label={e.title}
                  />
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-[13px] font-semibold text-white">{e.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/55">
                  {e.caption ?? (e.media ? t(KIND_KEY[e.media.kind]) : "")}
                </p>
                {e.progress && (
                  <p className="mt-1 text-xs tabular-nums text-white/80">
                    {playbackTimeLabel(e.progress.seconds)} /{" "}
                    {playbackTimeLabel(e.progress.duration)}
                  </p>
                )}
              </div>
            </HistoryLink>
            {e.media && (
              <button
                type="button"
                onClick={() => forgetHistory(e.media!.kind, e.media!.id)}
                aria-label={t("history.forget", { titre: e.title })}
                // Toujours visible : sur écran tactile il n'y a pas de survol,
                // et une action cachée au clavier n'existe pas.
                className="absolute right-0 top-0 grid size-11 place-items-center text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-dbz-orange"
              >
                <span className="grid size-7 place-items-center rounded-full bg-black/70">
                  <Croix className="size-3.5" aria-hidden />
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
