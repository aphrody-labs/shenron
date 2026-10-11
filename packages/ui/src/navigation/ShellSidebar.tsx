// SPDX-License-Identifier: Apache-2.0
"use client";
/**
 * Barre latérale du shell (≥ 1024 px). Dépliée : sections repliables, libellés, compte.
 * Repliée (⌘B) : une colonne d'icônes de 72 px ; cliquer une section déplie la barre sur
 * elle. L'état replié vit dans `html[data-shell-sidebar=collapsed]`, posé avant la première
 * peinture (`SHELL_BOOT_SCRIPT`) : la largeur ne saute jamais à l'hydratation.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronBas, ChevronGauche } from "../icones";
import type {
  ShellBrand,
  ShellContextNavValue,
  ShellLabels,
  ShellLinkComponent,
  ShellNavSection,
} from "./AppShell";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-kinto-lumiere";

function sectionOf(sections: readonly ShellNavSection[], href: string | null): string | null {
  if (!href) return null;
  return sections.find((section) => section.items.some((item) => item.href === href))?.id ?? null;
}

export function ShellSidebar({
  brand,
  sections,
  contextNav,
  activeHref,
  collapsed,
  onToggle,
  onExpand,
  account,
  siteStyle,
  labels,
  linkComponent: Link,
}: {
  brand: ShellBrand;
  sections: readonly ShellNavSection[];
  contextNav: ShellContextNavValue | null;
  activeHref: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onExpand: () => void;
  account?: ReactNode;
  siteStyle?: boolean;
  labels: ShellLabels;
  linkComponent: ShellLinkComponent;
}) {
  const activeSection = useMemo(() => sectionOf(sections, activeHref), [sections, activeHref]);
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(activeSection ? [activeSection] : []),
  );

  // La section de la page courante s'ouvre d'elle-même ; les autres gardent leur état.
  useEffect(() => {
    if (siteStyle) {
      setOpen(new Set());
      return;
    }
    if (!activeSection) return;
    setOpen((current) =>
      current.has(activeSection) ? current : new Set(current).add(activeSection),
    );
  }, [activeSection, siteStyle]);

  const toggle = (id: string) => {
    if (collapsed) {
      onExpand();
      setOpen((current) => new Set(current).add(id));
      return;
    }
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      aria-label={labels.sidebar}
      className="sticky top-0 z-40 hidden h-dvh w-[17rem] shrink-0 flex-col self-start border-r border-os/12 bg-dbz-bg pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex [html[data-shell-sidebar=collapsed]_&]:w-[4.5rem]"
      data-shell-navigation={siteStyle ? "horizontal" : "sidebar"}
    >
      <div
        data-tauri-drag-region
        data-shell-sidebar-brand
        className="flex h-14 shrink-0 items-center px-3"
      >
        <Link
          href={brand.href}
          aria-label={brand.label}
          className={`group flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-1.5 transition-colors hover:bg-os/[0.04] ${FOCUS}`}
        >
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center">
            {brand.mark}
          </span>
          <span className="flex min-w-0 flex-col leading-none [html[data-shell-sidebar=collapsed]_&]:hidden">
            <span className="truncate font-display text-[0.9375rem] font-extrabold tracking-[-0.02em] text-os">
              {brand.name}
            </span>
            {brand.tagline && (
              <span className="mt-0.5 truncate text-[0.75rem] text-os/55">{brand.tagline}</span>
            )}
          </span>
        </Link>
      </div>

      <nav
        aria-label={contextNav?.label ?? labels.sidebar}
        className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4 [scrollbar-width:thin]"
      >
        {contextNav && (
          <Link
            href={contextNav.backHref}
            title={contextNav.backLabel}
            className={`mb-2 flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] font-semibold text-os/60 transition-colors hover:bg-os/[0.05] hover:text-os ${FOCUS}`}
          >
            <ChevronGauche size={18} className="shrink-0" />
            <span className="truncate [html[data-shell-sidebar=collapsed]_&]:hidden">
              {contextNav.backLabel}
            </span>
          </Link>
        )}
        <ul className="flex flex-col gap-0.5">
          {sections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              open={open.has(section.id)}
              current={section.id === activeSection}
              activeHref={activeHref}
              onToggle={() => toggle(section.id)}
              linkComponent={Link}
            />
          ))}
        </ul>
      </nav>

      <div
        data-shell-sidebar-footer
        className="shrink-0 border-t border-os/12 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {account && (
          <div className="mb-1 min-w-0 [html[data-shell-sidebar=collapsed]_&]:hidden">
            {account}
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
          title={`${collapsed ? labels.expandSidebar : labels.collapseSidebar} (Ctrl+B)`}
          className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-[0.8125rem] text-os/50 transition-colors hover:bg-os/[0.05] hover:text-os ${FOCUS}`}
        >
          <ChevronGauche
            size={18}
            className="shrink-0 transition-transform [html[data-shell-sidebar=collapsed]_&]:rotate-180"
          />
          <span className="truncate [html[data-shell-sidebar=collapsed]_&]:hidden">
            {labels.collapseSidebar}
          </span>
        </button>
      </div>
    </aside>
  );
}

function SidebarSection({
  section,
  open,
  current,
  activeHref,
  onToggle,
  linkComponent: Link,
}: {
  section: ShellNavSection;
  open: boolean;
  current: boolean;
  activeHref: string | null;
  onToggle: () => void;
  linkComponent: ShellLinkComponent;
}) {
  const listId = useId();
  if (section.items.length === 0) return null;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={listId}
        title={section.label}
        data-current={current ? "true" : undefined}
        className={`group flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[0.8125rem] font-semibold transition-colors hover:bg-os/[0.05] ${
          current ? "text-os" : "text-os/55 hover:text-os"
        } ${FOCUS}`}
      >
        <span
          aria-hidden
          className={`grid h-5 w-5 shrink-0 place-items-center ${current ? "text-ecaille-claire" : ""}`}
        >
          {section.icon}
        </span>
        <span className="min-w-0 flex-1 truncate [html[data-shell-sidebar=collapsed]_&]:hidden">
          {section.label}
        </span>
        <ChevronBas
          size={14}
          aria-hidden
          className={`shrink-0 text-os/35 transition-transform motion-reduce:transition-none [html[data-shell-sidebar=collapsed]_&]:hidden ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="mt-0.5 mb-1.5 flex flex-col gap-0.5 [html[data-shell-sidebar=collapsed]_&]:hidden"
      >
        {section.items.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={item.description}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-9 items-center gap-2.5 rounded-lg py-1.5 pr-2.5 pl-10 text-[0.875rem] leading-tight transition-colors ${FOCUS} ${
                  active
                    ? "bg-os/[0.06] font-semibold text-os before:absolute before:top-1.5 before:bottom-1.5 before:left-[1.1rem] before:w-[3px] before:rounded-full before:bg-dbz-green"
                    : "text-os/65 hover:bg-os/[0.04] hover:text-os"
                }`}
              >
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
