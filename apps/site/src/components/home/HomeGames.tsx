/**
 * Les mini-jeux, mis en avant sur l'accueil juste après la reprise de lecture :
 * les quatre jeux jouables dans le navigateur, chacun avec son bouton « Jouer ».
 *
 * Les jeux sont des pairs (aucun ne prime) : une grille de tuiles égales est ici
 * la bonne forme. Le titre et la phrase viennent de la section « play » de
 * `/admin/home` quand elle est renseignée, sinon des textes par défaut.
 *
 * Composant serveur sans état ; les textes passent par `<T>` pour suivre la
 * langue du lecteur sans casser le cache de la page.
 */
import Link from "next/link";
import { T } from "@/components/T";
import { HomeSection } from "./HomeSection";
import { primaryButton, surfaceLink } from "./ui";

/** Jeux jouables sur le site, dans l'ordre de la page `/jeux`. */
export const HOME_GAMES = [
  { key: "2048", name: "2048 : Ki Merge", href: "/jeux/2048", glyph: "2048" },
  { key: "pfc", name: "Pierre-Feuille-Ciseaux", href: "/jeux/pfc", glyph: "✊" },
  { key: "morpion", name: "Morpion", href: "/jeux/morpion", glyph: "✕" },
  { key: "bingo", name: "Bingo", href: "/jeux/bingo", glyph: "1–100" },
] as const;

export function HomeGames({
  title,
  subtitle,
  className = "",
}: {
  /** Titre éditable (section « play » de `/admin/home`). */
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <HomeSection
      id="jeux"
      title={title?.trim() ? title : <T k="accueil.games.title" />}
      subtitle={subtitle?.trim() ? subtitle : <T k="accueil.games.subtitle" />}
      moreHref="/jeux"
      moreLabel={<T k="accueil.games.all" />}
      className={className}
    >
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {HOME_GAMES.map((game) => (
          <li key={game.key}>
            <Link
              href={game.href}
              className={`group flex h-full flex-col gap-3 bg-dbz-card/70 p-4 sm:p-5 ${surfaceLink}`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-display text-lg font-bold leading-snug text-os">
                  {game.name}
                </span>
                <span
                  aria-hidden
                  className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-lg bg-dbz-orange px-2 text-sm font-[850] tabular-nums text-encre"
                >
                  {game.glyph}
                </span>
              </span>
              <span className="flex-1 text-sm leading-relaxed text-os/75">
                <T k={`accueil.games.items.${game.key}`} />
              </span>
              <span className={`${primaryButton} self-start`}>
                <T k="accueil.games.play" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-os/70">
        <T k="accueil.games.discord" />
      </p>
    </HomeSection>
  );
}
