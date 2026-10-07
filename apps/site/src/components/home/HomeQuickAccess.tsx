/**
 * Les rubriques de l'encyclopédie, en puces — un rail secondaire sous la
 * recherche et la reprise, pas une grille de tuiles qui leur ferait concurrence.
 *
 * Chaque puce porte le nombre d'entrées mesuré en base, pour qu'une rubrique de
 * 30 fiches ne se présente pas comme une rubrique de 1 300. Les puces passent à
 * la ligne : rien ne se cache dans un défilement horizontal sur téléphone.
 *
 * Composant sans état ni effet : il se rend côté serveur (et dans les tests)
 * tel quel. La fermeture éventuelle d'une rubrique (`/admin/launch`) est
 * arbitrée par `ClientGatedWrap` avec l'instantané d'accès de la page.
 */
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { T } from "@/components/T";
import type { AccessSnapshot } from "@/lib/wiki-launch";
import type { WikiCounts } from "./types";
import { blockTitle, pill } from "./ui";

interface Rubrique {
  key: string;
  href: string;
  labelKey: string;
  count: keyof WikiCounts | null;
}

/** Ordre de lecture : l'univers (qui, où, quand), puis les supports. */
export const QUICK_ACCESS: readonly Rubrique[] = [
  {
    key: "personnages",
    href: "/wiki/characters",
    labelKey: "categories.personnages.label",
    count: "characters",
  },
  {
    key: "lieux",
    href: "/wiki/locations",
    labelKey: "categories.cosmologie.label",
    count: "planets",
  },
  { key: "sagas", href: "/wiki/sagas", labelKey: "categories.sagas.label", count: "sagas" },
  {
    key: "chronologie",
    href: "/wiki/timeline",
    labelKey: "categories.chronologie.label",
    count: null,
  },
  {
    key: "episodes",
    href: "/wiki/episodes",
    labelKey: "categories.episodes.label",
    count: "episodes",
  },
  { key: "films", href: "/wiki/movies", labelKey: "categories.films.label", count: "movies" },
  { key: "manga", href: "/wiki/manga", labelKey: "categories.manga.label", count: "chapters" },
  {
    key: "databooks",
    href: "/wiki/databooks",
    labelKey: "categories.databooks.label",
    count: "databooks",
  },
];

const nf = new Intl.NumberFormat("fr-FR");

export function HomeQuickAccess({
  counts,
  access,
  title,
  className = "",
}: {
  counts: WikiCounts;
  access: AccessSnapshot | null;
  /** Titre éditable de la section « univers » (`/admin/home`), sinon le libellé par défaut. */
  title?: string;
  className?: string;
}) {
  return (
    <section
      id="universe"
      aria-labelledby="accueil-rubriques-titre"
      className={`scroll-mt-24 ${className}`}
    >
      <h2 id="accueil-rubriques-titre" className={`mb-3 ${blockTitle}`}>
        {title?.trim() ? title : <T k="accueil.quick.title" />}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {QUICK_ACCESS.map(({ key, href, labelKey, count }) => {
          const value = count ? counts[count] : 0;
          return (
            <li key={key}>
              <ClientGatedWrap access={access} href={href} className={pill}>
                <span className="font-semibold">
                  <T k={labelKey} />
                </span>
                {value > 0 && <span className="tabular-nums text-os/65">{nf.format(value)}</span>}
              </ClientGatedWrap>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
