/**
 * library — l'espace unique des planches : lire (manga, databooks), transcrire, traduire
 * et éditer (Shenron Studio).
 *
 * Six écrans parlaient des mêmes planches sans se connaître : le lecteur manga, le catalogue
 * public des databooks, son double d'administration (catalogue et campagnes de traduction),
 * l'écran des transcriptions, l'éditeur Shenron Studio et, au milieu, aucune page qui dise au lecteur
 * où en est le travail. Ils forment désormais un seul espace, à onglets-liens :
 *
 *   Manga · Databooks · Transcription et traduction (`/workshop`) · Studio
 *
 * Les adresses publiques du manga et des databooks ne bougent pas (elles sont indexées) ;
 * les outils staff quittent `/admin` pour l'atelier (`/workshop`), où le proxy les garde
 * comme `/admin`. Les anciennes adresses (`/atelier/*`, `/admin/databooks`,
 * `/admin/transcriptions`) vivent dans `lib/legacy-routes.ts`.
 *
 * Client-safe : aucune base, aucun secret. Ce registre n'accorde aucun droit ; l'accès réel
 * reste arbitré par `proxy.ts` (préfixes staff) et `requireAdmin()` dans chaque page staff.
 */
import { WORKSHOP_STAFF_PREFIXES } from "@/lib/legacy-routes";

export interface LibraryTab {
  href: string;
  /** Clé du dictionnaire (`messages/*.json`). */
  labelKey: string;
  /** Préfixes d'URL qui rendent l'onglet courant. */
  prefixes: readonly string[];
}

export const LIBRARY_TABS: readonly LibraryTab[] = [
  { href: "/wiki/manga", labelKey: "library.tabs.manga", prefixes: ["/wiki/manga"] },
  {
    href: "/wiki/databooks",
    labelKey: "library.tabs.databooks",
    prefixes: ["/wiki/databooks"],
  },
  { href: "/workshop", labelKey: "library.tabs.workshop", prefixes: ["/workshop"] },
  { href: "/studio", labelKey: "library.tabs.studio", prefixes: ["/studio"] },
];

export interface WorkshopTab {
  href: string;
  labelKey: string;
  /** Onglet réservé au staff : masqué aux visiteurs, gardé par le proxy. */
  staff: boolean;
}

export const WORKSHOP_TABS: readonly WorkshopTab[] = [
  { href: "/workshop", labelKey: "library.workshop.tabs.overview", staff: false },
  {
    href: "/workshop/transcription",
    labelKey: "library.workshop.tabs.transcription",
    staff: true,
  },
  { href: "/workshop/translation", labelKey: "library.workshop.tabs.translation", staff: true },
];

/** Sous-arbres de l'atelier réservés au staff (outils, données de relecture). */
export { WORKSHOP_STAFF_PREFIXES };

const within = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isWorkshopStaffPath(pathname: string): boolean {
  return WORKSHOP_STAFF_PREFIXES.some((prefix) => within(pathname, prefix));
}

/** `href` de l'onglet de la bibliothèque qui contient `pathname`, sinon `null`. */
export function libraryTabFor(pathname: string): string | null {
  return (
    LIBRARY_TABS.find((tab) => tab.prefixes.some((prefix) => within(pathname, prefix)))?.href ??
    null
  );
}

/** `href` de l'onglet de l'atelier qui contient `pathname` (la relecture d'un ouvrage relève de la transcription). */
export function workshopTabFor(pathname: string): string {
  if (within(pathname, "/workshop/transcription") || within(pathname, "/workshop/databooks"))
    return "/workshop/transcription";
  if (within(pathname, "/workshop/translation")) return "/workshop/translation";
  return "/workshop";
}
