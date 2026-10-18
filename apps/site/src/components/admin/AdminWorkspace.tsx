"use client";
/* oxlint-disable react/set-state-in-effect -- synchronize workspace tabs with incoming router navigation */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, PanelLeft, PanelRight, X, ArrowUpRight, Layers, Command } from "lucide-react";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@aphrody/shenron-ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "@aphrody/shenron-ui/select";
import { ADMIN_SECTIONS } from "./AdminSidebar";
import { ADMIN_FAMILIES, ADMIN_PAGES, adminPageForPath, type AdminFamily } from "./admin-pages";
import styles from "./AdminWorkspace.module.css";

const EXTRA_ROUTE_LABELS: Record<string, string> = {
  "/admin/dbxv2": "dbxv2",
  "/workshop/translation": "translation",
  "/workshop/transcription": "transcription",
};

export function AdminWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <AdminWorkspaceFrame href={pathname + (search.size ? `?${search.toString()}` : "")}>
      {children}
    </AdminWorkspaceFrame>
  );
}

/** The shared workbench keeps every route's own forms, selection and data authority intact. */
export function AdminWorkspaceFrame({ href, children }: { href: string; children: ReactNode }) {
  const t = useTranslations("AdminWorkspace");
  const admin = useTranslations("admin");
  const page = adminPageForPath(href);
  const activeFamily = page
    ? ADMIN_PAGES[page].family
    : ((ADMIN_SECTIONS.find((section) =>
        section.items.some((item) => href.split("?")[0] === item.href),
      )?.id as AdminFamily | undefined) ?? "pilotage");
  const [family, setFamily] = useState<AdminFamily>(activeFamily);
  const [filter, setFilter] = useState("");
  const [palette, setPalette] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [inspector, setInspector] = useState(false);
  const [visited, setVisited] = useState<string[]>([href]);
  const [query, setQuery] = useState("");
  const commandInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const explorerTrigger = useRef<HTMLButtonElement>(null);
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  const inspectorRegion = useRef<HTMLElement>(null);
  const extraPage = EXTRA_ROUTE_LABELS[href.split("?")[0]];
  const title = page
    ? admin(`pages.${page}.title`)
    : extraPage
      ? t(`${extraPage}Title`)
      : t("title");
  const links = useMemo(
    () =>
      ADMIN_SECTIONS.flatMap((section) =>
        section.items.map((item) => {
          const id = adminPageForPath(item.href);
          const extra = EXTRA_ROUTE_LABELS[item.href];
          return {
            ...item,
            family: section.id as AdminFamily,
            title: id ? admin(`pages.${id}.title`) : extra ? t(`${extra}Title`) : item.label,
            description: id
              ? admin(`pages.${id}.description`)
              : extra
                ? t(`${extra}Description`)
                : item.description,
          };
        }),
      ),
    [admin, t],
  );
  const matches = (value: string, search: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase()
      .includes(
        search
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLocaleLowerCase(),
      );
  const routes = links.filter(
    (item) =>
      (filter ? true : item.family === family) &&
      matches(`${item.title} ${item.description} ${admin(`families.${item.family}`)}`, filter),
  );
  const results = links.filter((item) =>
    matches(`${item.title} ${item.description} ${admin(`families.${item.family}`)}`, query),
  );
  const activeHref = links
    .filter(
      (item) => href.split("?")[0] === item.href || href.split("?")[0].startsWith(`${item.href}/`),
    )
    .toSorted((a, b) => b.href.length - a.href.length)[0]?.href;
  useEffect(() => {
    if (inspector) inspectorRegion.current?.focus();
  }, [inspector]);
  useEffect(() => {
    setVisited((previous) => [...previous.filter((value) => value !== href), href].slice(-8));
    setFamily(activeFamily);
    setMobileNav(false);
    setPalette(false);
  }, [href, activeFamily]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        event.stopPropagation();
        setPalette((value) => !value);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);
  const explorer = (
    <>
      <div className={styles.explorerHead}>
        <Layers size={16} aria-hidden="true" />
        <h2>{t("explorer")}</h2>
      </div>
      <label className={styles.filter}>
        <Search size={16} aria-hidden="true" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label={t("filter")}
          placeholder={t("filter")}
        />
      </label>
      <label className={styles.familyLabel}>
        <span>{t("group")}</span>
        <Select
          value={family}
          onValueChange={(value) => {
            if (value) setFamily(value as AdminFamily);
          }}
          items={ADMIN_FAMILIES.map((value) => ({ value, label: admin(`families.${value}`) }))}
        >
          <SelectTrigger variant="planche" className={styles.familyTrigger} aria-label={t("group")}>
            <SelectValue />
          </SelectTrigger>
          <SelectPopup variant="planche" className={styles.familyMenu}>
            {ADMIN_FAMILIES.map((value) => (
              <SelectItem key={value} value={value}>
                {admin(`families.${value}`)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </label>
      <nav className={styles.routes} aria-label={t("explorer")}>
        {routes.length === 0 && <p>{t("noResults")}</p>}
        {routes.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={activeHref === item.href ? "page" : undefined}
            title={item.description}
            onClick={() => setMobileNav(false)}
          >
            {item.icon}
            <span>{item.title}</span>
          </Link>
        ))}
      </nav>
      <Link href="/studio" className={styles.studioLink}>
        <ArrowUpRight size={16} aria-hidden="true" />
        {t("editor")}
      </Link>
    </>
  );
  return (
    <div className={styles.workspace} data-admin-workspace>
      <header className={styles.toolbar}>
        <button
          ref={explorerTrigger}
          className={styles.mobileToggle}
          type="button"
          aria-label={t("explorer")}
          onClick={() => setMobileNav(true)}
        >
          <PanelLeft size={20} />
        </button>
        <div className={styles.identity}>
          <span>{t("title")}</span>
          <strong>{title}</strong>
        </div>
        <button
          ref={trigger}
          type="button"
          aria-label={t("commands")}
          className={styles.commandButton}
          onClick={() => {
            setQuery("");
            setPalette(true);
          }}
          aria-keyshortcuts="Control+Shift+P Meta+Shift+P"
        >
          <Search size={18} aria-hidden="true" />
          <span>{t("commands")}</span>
          <kbd>⌘ ⇧ P</kbd>
        </button>
        <button
          ref={inspectorTrigger}
          type="button"
          aria-label={t("inspector")}
          aria-controls="admin-workspace-inspector"
          aria-expanded={inspector}
          className={styles.inspectorToggle}
          onClick={() => setInspector((value) => !value)}
        >
          <PanelRight size={20} />
        </button>
      </header>
      <div className={styles.body} data-inspector={inspector}>
        <aside className={styles.explorer}>{explorer}</aside>

        <div className={styles.center}>
          <nav aria-label={t("tabs")} className={styles.tabs}>
            {visited.map((value) => {
              const id = adminPageForPath(value);
              return (
                <Link key={value} href={value} aria-current={value === href ? "page" : undefined}>
                  {id ? admin(`pages.${id}.title`) : t("title")}
                </Link>
              );
            })}
          </nav>
          <div id="admin-content" className={styles.canvas} tabIndex={-1}>
            {children}
          </div>
        </div>
        {inspector && (
          <aside
            ref={inspectorRegion}
            id="admin-workspace-inspector"
            tabIndex={-1}
            className={styles.inspector}
            aria-label={t("inspector")}
          >
            <div className={styles.explorerHead}>
              <h2>{t("inspector")}</h2>
              <button
                type="button"
                aria-label={t("close")}
                onClick={() => {
                  setInspector(false);
                  inspectorTrigger.current?.focus();
                }}
              >
                <X size={18} />
              </button>
            </div>
            <p className={styles.sectionLabel}>{admin(`families.${activeFamily}`)}</p>
            <h3>{title}</h3>
            {page && <p>{admin(`pages.${page}.description`)}</p>}
            {!page && extraPage && <p>{t(`${extraPage}Description`)}</p>}
            <code>{href.split("?")[0]}</code>
            <p>{t("contextNote")}</p>
            <h3>{t("related")}</h3>
            <nav className={styles.routes} aria-label={t("related")}>
              {links
                .filter((item) => item.family === activeFamily && item.href !== href.split("?")[0])
                .slice(0, 5)
                .map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.icon}
                    <span>{item.title}</span>
                  </Link>
                ))}
            </nav>
          </aside>
        )}
      </div>
      <footer className={styles.status}>
        <span>{admin(`families.${activeFamily}`)}</span>
        <span>{t("status")}</span>
      </footer>
      <Dialog open={mobileNav} onOpenChange={setMobileNav}>
        <DialogPopup
          variant="planche"
          closeLabel={t("close")}
          finalFocus={explorerTrigger}
          className={styles.mobileDialog}
        >
          <DialogTitle>{t("explorer")}</DialogTitle>
          <DialogDescription>{t("navigationNote")}</DialogDescription>
          {explorer}
        </DialogPopup>
      </Dialog>
      <Dialog open={palette} onOpenChange={setPalette}>
        <DialogPopup
          variant="planche"
          closeLabel={t("close")}
          initialFocus={commandInput}
          finalFocus={trigger}
          className={styles.palette}
        >
          <DialogTitle className={styles.paletteTitle}>
            <Command size={18} aria-hidden="true" />
            {t("commands")}
          </DialogTitle>
          <DialogDescription>{t("commandNote")}</DialogDescription>
          <label className={styles.filter}>
            <Search size={18} aria-hidden="true" />
            <input
              ref={commandInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("commandPlaceholder")}
              aria-label={t("commandPlaceholder")}
            />
          </label>
          <nav className={styles.commandResults} aria-label={t("results")}>
            {results.length === 0 && <output>{t("noResults")}</output>}
            {results.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setPalette(false)}>
                {item.icon}
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {admin(`families.${item.family}`)} · {item.description}
                  </small>
                </span>
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
