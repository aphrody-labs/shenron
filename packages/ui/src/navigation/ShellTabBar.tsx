// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Barre d'onglets mobile (< 1024 px) et feuille « Plus ».
 *
 * Material 3 borne une barre de navigation à 3–5 destinations : quatre onglets fixes (choisis
 * par l'hôte d'après l'audience réelle) et un cinquième qui ouvre une feuille glissante avec
 * toutes les sections. La feuille est un `Drawer` de Base UI : piège de focus, Échap,
 * glisser vers le bas pour fermer, retour du focus sur « Plus ».
 *
 * Mesures (material-components-android, `bottomnavigation/res/values/dimens.xml`) : 80 dp de
 * haut, indicateur 64 × 32 dp, glyphe 24 dp, cible ≥ 48 dp. L'état actif se lit à trois signes
 * cumulés : pilule, glyphe en aplat, libellé gras.
 */
import { Drawer } from "@base-ui/react/drawer";
import type { MouseEvent, ReactNode } from "react";
import { Croix, Ellipse } from "../icones";
import type {
  ShellContextNavValue,
  ShellLabels,
  ShellLinkComponent,
  ShellNavItem,
  ShellNavSection,
} from "./AppShell";
import { MobileNavFrame } from "./MobileNavFrame";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kinto-lumiere";

function Indicator({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={`grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${
        on
          ? "bg-[var(--secondary)] text-[var(--secondary-foreground)] ring-1 ring-[var(--border)]"
          : "text-os/75 group-hover:bg-os/[0.08]"
      }`}
    >
      {children}
    </span>
  );
}

export function ShellTabBar({
  tabs,
  sections,
  contextNav,
  activeHref,
  open,
  onOpenChange,
  footer,
  labels,
  linkComponent: Link,
}: {
  tabs: readonly ShellNavItem[];
  sections: readonly ShellNavSection[];
  contextNav: ShellContextNavValue | null;
  activeHref: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: ReactNode;
  labels: ShellLabels;
  linkComponent: ShellLinkComponent;
}) {
  const tabActive = tabs.some((tab) => tab.href === activeHref);
  const closeOnNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // The current destination does not change pathname, so the shell's route
    // effect alone cannot dismiss this modal.
    onOpenChange(false);
  };
  return (
    <Drawer.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <MobileNavFrame label={labels.primaryNav}>
        <ul className="mx-auto flex max-w-[480px] items-stretch pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
          {tabs.slice(0, 4).map((tab) => {
            const on = tab.href === activeHref;
            return (
              <li key={tab.href} className="min-w-14 flex-1">
                <Link
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={`group flex min-h-16 flex-col items-center justify-start gap-1 pt-2.5 pb-3 ${FOCUS}`}
                >
                  <Indicator on={on}>{on && tab.activeIcon ? tab.activeIcon : tab.icon}</Indicator>
                  <span
                    className={`max-w-full truncate px-1 text-[0.71875rem] leading-none ${
                      on ? "font-bold text-os" : "font-semibold text-os/75"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-14 flex-1">
            <Drawer.Trigger
              className={`group flex min-h-16 w-full flex-col items-center justify-start gap-1 pt-2.5 pb-3 ${FOCUS}`}
            >
              <Indicator on={open || (!tabActive && activeHref !== null)}>
                <Ellipse size={22} />
              </Indicator>
              <span
                className={`text-[0.71875rem] leading-none ${
                  open ? "font-bold text-ecaille-claire" : "font-semibold text-os/75"
                }`}
              >
                {labels.more}
              </span>
            </Drawer.Trigger>
          </li>
        </ul>
      </MobileNavFrame>

      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-[70] min-h-dvh bg-black/70 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none lg:hidden" />
        <Drawer.Viewport className="fixed inset-0 z-[71] flex items-end justify-center lg:hidden">
          <Drawer.Popup className="flex max-h-[85dvh] w-full max-w-[42rem] flex-col overflow-hidden rounded-t-2xl border-t border-os/15 bg-dbz-card text-os outline-none [transform:translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:select-none motion-reduce:transition-none">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-3 pb-1">
              <span
                aria-hidden
                className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-os/20"
              />
              <Drawer.Title className="pt-2 font-display text-[0.9375rem] font-bold text-os">
                {contextNav?.label ?? labels.moreTitle}
              </Drawer.Title>
              <Drawer.Close
                aria-label={labels.close}
                className={`mt-1 grid h-11 w-11 place-items-center rounded-full text-os/70 transition-colors hover:bg-os/10 hover:text-os ${FOCUS}`}
              >
                <Croix size={20} />
              </Drawer.Close>
            </div>
            <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {contextNav && (
                <Link
                  href={contextNav.backHref}
                  onClick={closeOnNavigation}
                  className={`mb-2 flex min-h-12 items-center rounded-xl px-4 font-display text-[0.875rem] font-semibold text-os/70 hover:bg-os/[0.06] ${FOCUS}`}
                >
                  {contextNav.backLabel}
                </Link>
              )}
              <nav aria-label={contextNav?.label ?? labels.moreTitle}>
                {sections.map((section) =>
                  section.items.length === 0 ? null : (
                    <section key={section.id} className="mb-3">
                      <h2 className="flex items-center gap-2 px-4 pt-2 pb-1 font-display text-[0.75rem] font-semibold text-os/45">
                        <span aria-hidden className="grid h-4 w-4 place-items-center">
                          {section.icon}
                        </span>
                        {section.label}
                      </h2>
                      <ul className="flex flex-col">
                        {section.items.map((item) => {
                          const on = item.href === activeHref;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={closeOnNavigation}
                                aria-current={on ? "page" : undefined}
                                className={`flex min-h-12 flex-col justify-center rounded-xl px-4 py-1.5 transition-colors ${FOCUS} ${
                                  on ? "bg-dbz-green/15" : "hover:bg-os/[0.06]"
                                }`}
                              >
                                <span
                                  className={`font-display text-[0.9375rem] font-semibold ${on ? "text-ecaille-claire" : "text-os"}`}
                                >
                                  {item.label}
                                </span>
                                {item.description && (
                                  <span className="line-clamp-1 text-[0.75rem] text-os/45">
                                    {item.description}
                                  </span>
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ),
                )}
              </nav>
              {footer && <div className="mt-2 border-t border-os/12 px-1 pt-3">{footer}</div>}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
