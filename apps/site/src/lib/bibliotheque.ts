/**
 * bibliotheque — l'espace unique des planches : lire (manga, databooks), transcrire, traduire
 * et éditer (Koharu).
 *
 * Six écrans parlaient des mêmes planches sans se connaître : le lecteur manga, le catalogue
 * public des databooks, son double d'administration (catalogue et campagnes de traduction),
 * l'écran des transcriptions, l'éditeur Koharu et, au milieu, aucune page qui dise au lecteur
 * où en est le travail. Ils forment désormais un seul espace, à onglets-liens :
 *
 *   Manga · Databooks · Transcription et traduction (`/atelier`) · Koharu
 *
 * Les adresses publiques du manga et des databooks ne bougent pas (elles sont indexées) ;
 * les outils staff quittent `/admin` pour l'atelier, où le proxy les garde comme `/admin`.
 *
 * Client-safe : aucune base, aucun secret. Ce registre n'accorde aucun droit ; l'accès réel
 * reste arbitré par `proxy.ts` (préfixes staff) et `requireAdmin()` dans chaque page staff.
 */

export interface BibliothequeTab {
  href: string;
  /** Clé du dictionnaire (`messages/*.json`). */
  labelKey: string;
  /** Préfixes d'URL qui rendent l'onglet courant. */
  prefixes: readonly string[];
}

export const BIBLIOTHEQUE_TABS: readonly BibliothequeTab[] = [
  { href: "/wiki/manga", labelKey: "bibliotheque.tabs.manga", prefixes: ["/wiki/manga"] },
  {
    href: "/wiki/databooks",
    labelKey: "bibliotheque.tabs.databooks",
    prefixes: ["/wiki/databooks"],
  },
  { href: "/atelier", labelKey: "bibliotheque.tabs.atelier", prefixes: ["/atelier"] },
  { href: "/koharu", labelKey: "bibliotheque.tabs.koharu", prefixes: ["/koharu"] },
];

export interface AtelierTab {
  href: string;
  labelKey: string;
  /** Onglet réservé au staff : masqué aux visiteurs, gardé par le proxy. */
  staff: boolean;
}

export const ATELIER_TABS: readonly AtelierTab[] = [
  { href: "/atelier", labelKey: "bibliotheque.atelier.tabs.overview", staff: false },
  {
    href: "/atelier/transcription",
    labelKey: "bibliotheque.atelier.tabs.transcription",
    staff: true,
  },
  { href: "/atelier/traduction", labelKey: "bibliotheque.atelier.tabs.traduction", staff: true },
];

/** Sous-arbres de l'atelier réservés au staff (outils, données de relecture). */
export const ATELIER_STAFF_PREFIXES = [
  "/atelier/transcription",
  "/atelier/traduction",
  "/atelier/databooks",
] as const;

const within = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isAtelierStaffPath(pathname: string): boolean {
  return ATELIER_STAFF_PREFIXES.some((prefix) => within(pathname, prefix));
}

/** `href` de l'onglet de la bibliothèque qui contient `pathname`, sinon `null`. */
export function bibliothequeTabFor(pathname: string): string | null {
  return (
    BIBLIOTHEQUE_TABS.find((tab) => tab.prefixes.some((prefix) => within(pathname, prefix)))
      ?.href ?? null
  );
}

/** `href` de l'onglet de l'atelier qui contient `pathname` (la relecture d'un ouvrage relève de la transcription). */
export function atelierTabFor(pathname: string): string {
  if (within(pathname, "/atelier/transcription") || within(pathname, "/atelier/databooks"))
    return "/atelier/transcription";
  if (within(pathname, "/atelier/traduction")) return "/atelier/traduction";
  return "/atelier";
}

/**
 * Anciennes adresses d'administration fondues dans l'atelier (308). La requête est gardée
 * par l'appelant (`?planche=12&filtre=suspectes` de la relecture).
 */
export function atelierRedirect(pathname: string): string | null {
  if (within(pathname, "/admin/transcriptions")) return "/atelier/transcription";
  if (pathname === "/admin/databooks" || pathname === "/admin/databooks/")
    return "/atelier/traduction";
  const book = /^\/admin\/databooks\/([^/]+)\/?$/.exec(pathname);
  if (book) return `/atelier/databooks/${book[1]}`;
  return null;
}
