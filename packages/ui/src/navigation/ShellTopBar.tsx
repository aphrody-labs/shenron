// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Barre du haut du shell : 56 px plus la zone sûre. Desktop : bascule de la barre latérale,
 * fil d'Ariane, recherche ⌘K, actions. Mobile : marque ou retour vers le maillon parent,
 * titre courant, recherche, compte. Sous Tauri, elle est la poignée de la fenêtre et porte
 * les contrôles de fenêtre quand la fenêtre n'a pas de décoration native.
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronGauche, MaterialSymbol } from "../icones";
import type { ShellBrand, ShellCrumb, ShellLabels, ShellLinkComponent } from "./AppShell";
import { WindowControls, useUndecoratedWindow } from "./WindowControls";
import { shellCrumbKey } from "./crumb-key";

const ICON_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
const SITE_BRAND_FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

const subscribePlatform = () => () => {};
const platformLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
const serverPlatformLabel = () => "Ctrl K";
function useModifierLabel(): string {
  return useSyncExternalStore(subscribePlatform, platformLabel, serverPlatformLabel);
}

export function ShellTopBar({
  brand,
  trail,
  collapsed,
  onToggleSidebar,
  onSearch,
  onSearchIntent,
  actions,
  mobileAccount,
  desktopAccount,
  siteStyle,
  tauri,
  labels,
  linkComponent: Link,
}: {
  brand: ShellBrand;
  trail: readonly ShellCrumb[];
  collapsed: boolean;
  onToggleSidebar: () => void;
  onSearch?: () => void;
  onSearchIntent?: () => void;
  actions?: ReactNode;
  mobileAccount?: ReactNode;
  desktopAccount?: ReactNode;
  siteStyle?: boolean;
  tauri: boolean;
  labels: ShellLabels;
  linkComponent: ShellLinkComponent;
}) {
  const shortcut = useModifierLabel();
  const customChrome = useUndecoratedWindow(tauri);
  const current = trail.at(-1);
  // Maillon parent : le dernier lien qui n'est pas la page courante (bouton retour mobile).
  const parent = trail
    .slice(0, -1)
    .toReversed()
    .find((crumb) => crumb.href);

  return (
    <header
      data-tauri-drag-region
      data-shell-header={siteStyle ? "site" : "app"}
      className="sticky top-0 z-40 border-b border-os/12 bg-dbz-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150"
    >
      <div
        data-tauri-drag-region
        className="flex h-14 items-center gap-1 pr-[max(env(safe-area-inset-right),0.5rem)] pl-[max(env(safe-area-inset-left),0.5rem)] lg:gap-2 lg:pl-3"
      >
        {siteStyle && (
          <Link
            href={brand.href}
            aria-label={brand.label}
            className={`hidden min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-2 lg:flex ${SITE_BRAND_FOCUS}`}
          >
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center">
              {brand.mark}
            </span>
            <span className="flex min-w-0 flex-col leading-none">
              <span className="truncate font-display text-[0.9375rem] font-extrabold tracking-[-0.02em] text-os">
                {brand.name}
              </span>
              {brand.tagline && (
                <span className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                  {brand.tagline}
                </span>
              )}
            </span>
          </Link>
        )}
        {/* Mobile : retour vers le parent quand il existe, sinon la marque. */}
        {parent?.href ? (
          <Link
            href={parent.href}
            aria-label={`${labels.back} : ${typeof parent.label === "string" ? parent.label : labels.back}`}
            className={`${ICON_BUTTON} lg:hidden`}
          >
            <ChevronGauche size={22} />
          </Link>
        ) : (
          <Link href={brand.href} aria-label={brand.label} className={`${ICON_BUTTON} lg:hidden`}>
            <span aria-hidden className="grid h-8 w-8 place-items-center">
              {brand.mark}
            </span>
          </Link>
        )}

        <button
          data-shell-site-toggle={siteStyle ? "true" : undefined}
          type="button"
          onClick={onToggleSidebar}
          aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
          title={`${collapsed ? labels.expandSidebar : labels.collapseSidebar} (Ctrl+B)`}
          className={`${ICON_BUTTON} hidden lg:grid`}
        >
          <svg
            aria-hidden
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="16" />
            <path d="M9 4v16" />
          </svg>
        </button>

        {/* Titre courant (mobile) / fil complet (desktop). */}
        <div data-tauri-drag-region data-shell-title className="min-w-0 flex-1 px-1">
          {current && (
            <p className="truncate font-display text-[0.9375rem] font-semibold text-os lg:hidden">
              {current.label}
            </p>
          )}
          {trail.length > 0 && (
            <nav aria-label={labels.breadcrumb} className="hidden min-w-0 lg:block">
              <ol className="flex min-w-0 items-center gap-x-2 text-[0.8125rem] text-muted-foreground">
                {trail.map((crumb, index) => {
                  const last = index === trail.length - 1;
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
                          className="inline-flex min-h-11 min-w-11 max-w-[16rem] items-center truncate rounded-lg px-2 transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          aria-current={last ? "page" : undefined}
                          className={`max-w-[28rem] truncate ${last ? "font-medium text-foreground" : ""}`}
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>

        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            onPointerEnter={onSearchIntent}
            onFocus={onSearchIntent}
            aria-label={`${labels.search} (${shortcut})`}
            title={`${labels.search} (${shortcut})`}
            aria-keyshortcuts="Control+K Meta+K"
            className={
              siteStyle
                ? ICON_BUTTON
                : "grid h-11 min-w-11 shrink-0 place-items-center rounded-xl text-os/70 transition-colors hover:bg-os/[0.07] hover:text-os focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring md:flex md:h-11 md:min-w-[15rem] md:items-center md:gap-2.5 md:border md:border-os/15 md:bg-os/[0.03] md:px-3 md:text-left md:text-os/50"
            }
          >
            <MaterialSymbol name="search" size={22} className="shrink-0" />
            {!siteStyle && (
              <span className="hidden flex-1 truncate text-[0.8125rem] md:inline">
                {labels.search}
              </span>
            )}
            {!siteStyle && (
              <kbd className="hidden rounded border border-os/15 px-1.5 py-0.5 font-sans tabular-nums text-[0.6875rem] text-os/50 md:inline">
                {shortcut}
              </kbd>
            )}
          </button>
        )}

        {actions && (
          <div data-shell-actions className="flex min-w-0 shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
        {siteStyle && desktopAccount && (
          <div className="hidden shrink-0 lg:block">{desktopAccount}</div>
        )}
        {mobileAccount && <div className="shrink-0 lg:hidden">{mobileAccount}</div>}
        {customChrome && <WindowControls labels={labels} />}
      </div>
    </header>
  );
}
