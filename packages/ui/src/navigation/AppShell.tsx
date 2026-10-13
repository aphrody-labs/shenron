// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * AppShell — la coque unique de Shenron, sur le site comme dans la fenêtre Tauri.
 *
 * Le modèle est celui des applications les plus répandues en 2026 (bloc « sidebar » de
 * shadcn/ui, Linear, GitHub, Vercel) :
 *
 * - desktop (≥ 1024 px) : barre latérale repliable en icônes pour l'application, navigation
 *   horizontale éditoriale pour le site ; les deux gardent la recherche ⌘K et les actions ;
 * - mobile : barre d'onglets en bas (4 destinations + « Plus ») et feuille glissante pour le
 *   reste, zones sûres (`env(safe-area-inset-*)`), cibles de 44 px ;
 * - Tauri : la barre du haut sert de poignée de fenêtre (`data-tauri-drag-region`) et porte
 *   les contrôles de fenêtre quand la fenêtre n'a pas de décoration native.
 *
 * Le shell ne lit ni session ni routeur : l'hôte lui donne le chemin courant, les sections,
 * le composant de lien et les libellés traduits. Une page peut lui confier son fil d'Ariane
 * (`ShellTrail`) ou une navigation de contexte (`ShellContextNav`, l'administration).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isTauri } from "../studio/tauri-bridge";
import { SHELL_SIDEBAR_ATTR, SHELL_SIDEBAR_KEY } from "./ShellBoot";
import { ShellSidebar } from "./ShellSidebar";
import { ShellTabBar } from "./ShellTabBar";
import { ShellTopBar } from "./ShellTopBar";
import { shellCrumbKey } from "./crumb-key";

// ── Modèle ──────────────────────────────────────────────────────────────────

export interface ShellNavItem {
  href: string;
  label: string;
  /** Phrase de situation (feuille mobile, info-bulle). */
  description?: string;
  icon?: ReactNode;
  /** Icône de l'état actif (onglets mobiles : trait → aplat). */
  activeIcon?: ReactNode;
}

export interface ShellNavSection {
  id: string;
  label: string;
  icon?: ReactNode;
  items: readonly ShellNavItem[];
}

/** Navigation propre à un espace (l'administration) : elle remplace les sections du site. */
export interface ShellContextNavValue {
  id: string;
  label: string;
  backHref: string;
  backLabel: string;
  sections: readonly ShellNavSection[];
}

export interface ShellCrumb {
  label: ReactNode;
  href?: string;
}

export type ShellLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};
export type ShellLinkComponent = ComponentType<ShellLinkProps> | "a";

export interface ShellBrand {
  href: string;
  /** Nom accessible du lien d'accueil. */
  label: string;
  /** Pictogramme (toujours visible, seul en barre repliée). */
  mark: ReactNode;
  name: ReactNode;
  tagline?: ReactNode;
}

export interface ShellLabels {
  sidebar: string;
  collapseSidebar: string;
  expandSidebar: string;
  primaryNav: string;
  more: string;
  moreTitle: string;
  close: string;
  search: string;
  breadcrumb: string;
  back: string;
  home: string;
  windowMinimize: string;
  windowMaximize: string;
  windowRestore: string;
  windowClose: string;
}

export const SHELL_LABELS_FR: ShellLabels = {
  sidebar: "Navigation du site",
  collapseSidebar: "Replier la barre latérale",
  expandSidebar: "Déplier la barre latérale",
  primaryNav: "Navigation principale",
  more: "Plus",
  moreTitle: "Toutes les rubriques",
  close: "Fermer",
  search: "Rechercher",
  breadcrumb: "Fil d'Ariane",
  back: "Retour",
  home: "Accueil",
  windowMinimize: "Réduire",
  windowMaximize: "Agrandir",
  windowRestore: "Restaurer",
  windowClose: "Fermer la fenêtre",
};

export interface AppShellProps {
  pathname: string;
  brand: ShellBrand;
  sections: readonly ShellNavSection[];
  /** Destinations de la barre d'onglets mobile (4 au plus, « Plus » est ajouté). */
  tabs: readonly ShellNavItem[];
  labels?: ShellLabels;
  linkComponent?: ShellLinkComponent;
  /** Actions de la barre du haut (langue…), desktop et mobile. */
  actions?: ReactNode;
  /** Bloc compte en pied de barre latérale (desktop). */
  account?: ReactNode;
  /** Compact account action for the public desktop toolbar. */
  desktopAccount?: ReactNode;
  /** Accès au compte dans la barre du haut (mobile). */
  mobileAccount?: ReactNode;
  /** Bas de la feuille mobile (paramètres, déconnexion…). */
  sheetFooter?: ReactNode;
  /** Pied de page, sous le contenu. */
  footer?: ReactNode;
  /** Palette de commandes (⌘K / Ctrl+K) ; absente, le bouton de recherche n'est pas rendu. */
  renderCommand?: (state: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  /** Intention d'ouvrir la palette (survol, focus) : précharger son code. */
  onCommandIntent?: () => void;
  /** Force la détection Tauri (tests, hôte qui le sait déjà). */
  tauri?: boolean;
  /** Présentation éditoriale horizontale du site public; l'application conserve la coque latérale. */
  siteStyle?: boolean;
  children: ReactNode;
}

// ── Contexte ────────────────────────────────────────────────────────────────

interface ShellApi {
  pushTrail: (trail: readonly ShellCrumb[]) => () => void;
  pushContextNav: (nav: ShellContextNavValue) => () => void;
  openCommand: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

/** L'API du shell, ou `null` hors shell (rendu isolé, tests). */
export function useShell(): ShellApi | null {
  return useContext(ShellContext);
}

// ── Correspondance de route ─────────────────────────────────────────────────

/**
 * Destination active par correspondance LA PLUS LONGUE : `/wiki/episodes` est un enfant de
 * `/wiki`, un simple préfixe allumerait les deux ; `/` n'est actif que sur l'égalité exacte.
 */
export function matchActiveHref(pathname: string, hrefs: Iterable<string>): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const href of hrefs) {
    const path = href.split(/[?#]/)[0] ?? href;
    if (!path.startsWith("/")) continue;
    const hit =
      path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
    if (hit && path.length > bestLength) {
      best = href;
      bestLength = path.length;
    }
  }
  return best;
}

/** Fil déduit de la navigation quand la page n'en donne pas : section › rubrique. */
export function trailFromNav(pathname: string, sections: readonly ShellNavSection[]): ShellCrumb[] {
  const all = sections.flatMap((section) => section.items.map((item) => ({ section, item })));
  const active = matchActiveHref(
    pathname,
    all.map(({ item }) => item.href),
  );
  const hit = all.find(({ item }) => item.href === active);
  if (!hit) return [];
  const exact = (hit.item.href.split(/[?#]/)[0] ?? "") === pathname;
  return [
    { label: hit.section.label },
    exact ? { label: hit.item.label } : { label: hit.item.label, href: hit.item.href },
  ];
}

// ── Préférences persistées (barre repliée) ──────────────────────────────────

function readCollapsed(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.getAttribute(SHELL_SIDEBAR_ATTR) === "collapsed"
  );
}

function writeCollapsed(collapsed: boolean): void {
  if (collapsed) document.documentElement.setAttribute(SHELL_SIDEBAR_ATTR, "collapsed");
  else document.documentElement.removeAttribute(SHELL_SIDEBAR_ATTR);
  try {
    localStorage.setItem(SHELL_SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // stockage indisponible (navigation privée) : l'état vaut pour la session
  }
}

function subscribeSidebar(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [SHELL_SIDEBAR_ATTR],
  });
  const sync = (event: StorageEvent) => {
    if (event.key !== SHELL_SIDEBAR_KEY) return;
    if (event.newValue === "collapsed") {
      document.documentElement.setAttribute(SHELL_SIDEBAR_ATTR, "collapsed");
    } else {
      document.documentElement.removeAttribute(SHELL_SIDEBAR_ATTR);
    }
  };
  window.addEventListener("storage", sync);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", sync);
  };
}
const serverFalse = () => false;
const subscribeRuntime = () => () => {};

/** Le focus est-il dans un champ ou un éditeur riche (où ⌘B veut dire « gras ») ? */
function editingText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

// ── Coque ───────────────────────────────────────────────────────────────────

export function AppShell({
  pathname,
  brand,
  sections,
  tabs,
  labels = SHELL_LABELS_FR,
  linkComponent = "a",
  actions,
  account,
  desktopAccount,
  mobileAccount,
  sheetFooter,
  footer,
  renderCommand,
  onCommandIntent,
  tauri: forcedTauri,
  siteStyle = false,
  children,
}: AppShellProps) {
  const collapsed = useSyncExternalStore(subscribeSidebar, readCollapsed, serverFalse);
  const [commandOpen, setCommandOpen] = useState(false);
  const [sheet, setSheet] = useState({ pathname, open: false });
  const sheetOpen = sheet.pathname === pathname && sheet.open;
  if (sheet.pathname !== pathname) setSheet({ pathname, open: false });
  const setSheetOpen = useCallback((open: boolean) => setSheet({ pathname, open }), [pathname]);
  const [trails, setTrails] = useState<{ id: number; trail: readonly ShellCrumb[] }[]>([]);
  const [contextNavs, setContextNavs] = useState<{ id: number; nav: ShellContextNavValue }[]>([]);
  const detectedTauri = useSyncExternalStore(subscribeRuntime, isTauri, serverFalse);
  const tauri = forcedTauri ?? detectedTauri;
  const nextId = useRef(0);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-tauri", tauri);
  }, [tauri]);

  // CSS hides the mobile drawer on desktop; its modal state must close too,
  // otherwise focus and scroll remain trapped behind an invisible overlay.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setSheetOpen(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [setSheetOpen]);

  const toggleSidebar = useCallback(() => {
    writeCollapsed(!readCollapsed());
  }, []);

  const expandSidebar = useCallback(() => {
    writeCollapsed(false);
  }, []);

  const hasCommand = renderCommand !== undefined;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k" && hasCommand) {
        // Dans un éditeur riche, ⌘K insère un lien : on lui laisse.
        if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
        event.preventDefault();
        setCommandOpen((open) => !open);
      } else if (key === "b" && !editingText(event.target)) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasCommand, toggleSidebar]);

  const api = useMemo<ShellApi>(
    () => ({
      pushTrail(trail) {
        const id = ++nextId.current;
        setTrails((current) => [...current.filter((t) => t.id !== id), { id, trail }]);
        return () => setTrails((current) => current.filter((t) => t.id !== id));
      },
      pushContextNav(nav) {
        const id = ++nextId.current;
        setContextNavs((current) => [...current, { id, nav }]);
        return () => setContextNavs((current) => current.filter((n) => n.id !== id));
      },
      openCommand: () => setCommandOpen(true),
    }),
    [],
  );

  const contextNav = contextNavs.at(-1)?.nav ?? null;
  const navSections = contextNav ? contextNav.sections : sections;
  const pageTrail = trails.at(-1)?.trail ?? null;
  const trail = useMemo<readonly ShellCrumb[]>(
    () => pageTrail ?? trailFromNav(pathname, navSections),
    [pageTrail, pathname, navSections],
  );

  const activeHref = useMemo(
    () =>
      matchActiveHref(pathname, [
        ...navSections.flatMap((section) => section.items.map((item) => item.href)),
        ...(contextNav ? [] : tabs.map((tab) => tab.href)),
      ]),
    [pathname, navSections, tabs, contextNav],
  );

  const shellTopBar = (
    <ShellTopBar
      brand={brand}
      trail={trail}
      collapsed={collapsed}
      onToggleSidebar={toggleSidebar}
      onSearch={hasCommand ? () => setCommandOpen(true) : undefined}
      onSearchIntent={onCommandIntent}
      actions={actions}
      mobileAccount={mobileAccount}
      desktopAccount={desktopAccount ?? account}
      siteStyle={siteStyle}
      tauri={tauri}
      labels={labels}
      linkComponent={linkComponent}
    />
  );

  return (
    <ShellContext.Provider value={api}>
      <div
        data-shell
        data-shell-variant={siteStyle ? "site" : "app"}
        className="relative flex min-h-dvh w-full flex-1"
      >
        {siteStyle && shellTopBar}
        <ShellSidebar
          brand={brand}
          sections={navSections}
          contextNav={contextNav}
          activeHref={activeHref}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          onExpand={expandSidebar}
          account={account}
          siteStyle={siteStyle}
          labels={labels}
          linkComponent={linkComponent}
        />
        <div data-shell-content className="flex min-w-0 flex-1 flex-col">
          {!siteStyle && shellTopBar}
          <main id="contenu" tabIndex={-1} className="relative z-10 flex w-full flex-1 flex-col">
            {children}
          </main>
          {footer}
        </div>
        <ShellTabBar
          tabs={tabs}
          sections={navSections}
          contextNav={contextNav}
          activeHref={activeHref}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          footer={sheetFooter}
          labels={labels}
          linkComponent={linkComponent}
        />
        {renderCommand?.({ open: commandOpen, onOpenChange: setCommandOpen })}
      </div>
    </ShellContext.Provider>
  );
}

// ── Contributions des pages ─────────────────────────────────────────────────

/** Rendu en ligne du fil (hors shell : tests, rendu isolé, documents imprimés). */
export function CrumbList({
  items,
  label,
  linkComponent: Link = "a",
  className = "",
}: {
  items: readonly ShellCrumb[];
  label: string;
  linkComponent?: ShellLinkComponent;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-os/55">
        {items.map((crumb, index) => {
          const last = index === items.length - 1;
          return (
            <li key={shellCrumbKey(crumb)} className="flex min-w-0 items-center gap-x-2">
              {index > 0 && (
                <span aria-hidden className="text-os/25">
                  /
                </span>
              )}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className="min-w-0 break-words rounded-sm transition-colors hover:text-kinto-lumiere focus-visible:outline-2 focus-visible:outline-kinto-lumiere"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={`min-w-0 break-words ${last ? "text-os/85" : ""}`}
                  aria-current={last ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Le fil d'Ariane d'une page : confié à la barre du haut quand le shell est là, rendu en
 * place sinon. Une seule présentation, jamais deux fils superposés.
 */
export function ShellTrail({
  items,
  label = SHELL_LABELS_FR.breadcrumb,
  linkComponent,
  className,
}: {
  items: readonly ShellCrumb[];
  label?: string;
  linkComponent?: ShellLinkComponent;
  className?: string;
}) {
  const shell = useShell();
  // Les libellés sont souvent des éléments (`<T>`) recréés à chaque rendu : la signature
  // (cibles + textes) dit seule si le fil a changé.
  const signature = items
    .map((crumb) => `${crumb.href ?? ""}|${typeof crumb.label === "string" ? crumb.label : ""}`)
    .join("§");
  useEffect(() => {
    if (!shell) return;
    return shell.pushTrail(items);
    // oxlint-disable-next-line react/exhaustive-deps -- `items` est résumé par `signature`
  }, [shell, signature]);
  if (shell) return null;
  return (
    <CrumbList items={items} label={label} linkComponent={linkComponent} className={className} />
  );
}

/** Navigation d'un espace (l'administration) : remplace les sections tant qu'elle est montée. */
export function ShellContextNav({ nav }: { nav: ShellContextNavValue }) {
  const shell = useShell();
  useEffect(() => {
    if (!shell) return;
    return shell.pushContextNav(nav);
    // oxlint-disable-next-line react/exhaustive-deps -- une navigation de contexte est figée par son id
  }, [shell, nav.id]);
  return null;
}
