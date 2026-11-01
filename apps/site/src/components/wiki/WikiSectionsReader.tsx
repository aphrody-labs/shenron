"use client";

/**
 * Lecteur de rubriques d'une fiche wiki, avec son sommaire.
 *
 * Chaque rubrique (`node`) est rendue côté serveur ; le sommaire choisit ce qui
 * est affiché (« Tout » ou une rubrique) sans recharger la page, et l'ancre de
 * l'URL (`#histoire`) garde le choix partageable. Deux niveaux : les rubriques
 * regroupées (ex. « PWS ») n'apparaissent qu'une fois, sous le nom du groupe, et
 * leurs sous-rubriques s'ouvrent quand le groupe est choisi.
 *
 * Mobile d'abord : le sommaire est une rangée de pastilles qui défile
 * horizontalement et reste collée sous la barre du shell. Sur grand écran, quand
 * la fiche fournit une colonne latérale (`aside` : l'infobox), le sommaire passe
 * dans cette colonne, en liste verticale collante — la rangée disparaît.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SectionAccent } from "@/lib/wiki-section-accents";
import { normalizeWikiSectionGroups } from "@/lib/wiki-section-groups";
import { useT } from "@/components/T";
import { useWikiReaderText } from "@/components/wiki/WikiPublicText";
import { FICHE_ASIDE, FICHE_GRID, FICHE_MAIN, STICKY_TOP } from "@/components/wiki/fiche-layout";

export interface ReaderPanel {
  key: string;
  label: string;
  accent?: SectionAccent | null;
  /** Groupe parent (entrée de 1er niveau). Les enfants s'affichent au 2e niveau. */
  group?: string | null;
  node: ReactNode;
}

function Pastille({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere ${
        active
          ? "border-dbz-orange bg-dbz-orange text-encre shadow-[0_0_16px_rgba(231,130,32,0.3)]"
          : "border-os/12 bg-white/[0.02] text-os/80 hover:border-dbz-orange/70 hover:bg-white/[0.05] hover:text-os"
      }`}
    >
      {children}
    </button>
  );
}

function EntreeSommaire({
  active,
  onClick,
  children,
  depth = 0,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  depth?: 0 | 1;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-11 w-full items-center rounded-r-lg border-l-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere ${
        depth === 1 ? "pl-6 pr-3" : "px-3"
      } ${
        active
          ? "border-dbz-orange font-semibold text-os"
          : "border-transparent text-os/65 hover:border-os/30 hover:text-os"
      }`}
    >
      {children}
    </button>
  );
}

export function WikiSectionsReader({
  panels,
  allLabel,
  aside,
  children,
}: {
  panels: ReaderPanel[];
  allLabel?: string;
  /**
   * Colonne latérale de la fiche (infobox). Fournie, le lecteur compose la
   * fiche entière : colonne collante à droite sur grand écran, empilée au-dessus
   * du contenu sur mobile, avec le sommaire sous l'infobox.
   */
  aside?: ReactNode;
  /** Contenu de pied de colonne principale (sources, notes). */
  children?: ReactNode;
}) {
  const t = useT();
  const readerText = useWikiReaderText();
  const tout = allLabel ?? t("wiki.reader.all");
  const titreSommaire = t("wiki.reader.toc");
  const [active, setActive] = useState<string>("all");
  const [subActive, setSubActive] = useState<string>("all");
  const contentRef = useRef<HTMLDivElement>(null);

  // Normalise PWS et autres regroupements (corrige les inversions libellé/groupe),
  // puis rend les clés uniques : deux rubriques « Histoire » ne doivent pas
  // partager une ancre.
  const items = useMemo(() => {
    const normalized = normalizeWikiSectionGroups(
      panels.map((p) => ({ ...p, label: p.label.trim(), group: p.group?.trim() || null })),
    );
    const seen = new Set<string>();
    return normalized.map((p) => {
      let key = p.key;
      let n = 2;
      while (seen.has(key)) key = `${p.key}-${n++}`;
      seen.add(key);
      return key === p.key ? p : Object.assign({}, p, { key });
    });
  }, [panels]);

  useEffect(() => {
    if (items.length <= 1) return;
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      // `#saga-12` vise une saga DANS la frise « Au fil des sagas » : on ouvre
      // la rubrique qui la contient, la frise se charge de l'ancre.
      if (hash.startsWith("saga-") || hash === "sagas") {
        if (items.some((p) => p.key === "sagas")) {
          setActive((cur) => (cur === "all" || cur === "sagas" ? cur : "sagas"));
        }
        return;
      }
      const matched = items.find((p) => p.key === hash);
      if (!matched) return;
      if (matched.group) {
        setActive(`g:${matched.group}`);
        setSubActive(matched.key);
      } else {
        setActive(matched.key);
        setSubActive("all");
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [items]);

  if (panels.length === 0) return <Mise aside={aside}>{children}</Mise>;

  const groupOrder: string[] = [];
  for (const p of items) if (p.group && !groupOrder.includes(p.group)) groupOrder.push(p.group);
  const ungrouped = items.filter((p) => !p.group);
  const groupPanels = (g: string) => items.filter((p) => p.group === g);
  const activeGroup = active.startsWith("g:") ? active.slice(2) : null;
  const activeChildren = activeGroup ? groupPanels(activeGroup) : [];
  const avecSommaire = items.length > 1;

  function scrollToContent() {
    requestAnimationFrame(() =>
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function selectTop(key: string) {
    setActive(key);
    setSubActive("all");
    window.history.replaceState(null, "", key === "all" ? window.location.pathname : `#${key}`);
    scrollToContent();
  }

  function selectSub(key: string) {
    setSubActive(key);
    scrollToContent();
  }

  function visible(p: ReaderPanel): boolean {
    if (active === "all") return true;
    if (activeGroup) {
      if (p.group !== activeGroup) return false;
      return subActive === "all" || subActive === p.key;
    }
    return p.key === active;
  }

  // Rangée de pastilles : mobile toujours, desktop seulement sans colonne latérale interne.
  const rangee = avecSommaire && (
    <div
      className={`sticky ${STICKY_TOP} z-20 rounded-xl border border-os/12 bg-dbz-bg/95 backdrop-blur-md shadow-[0_12px_32px_-12px_rgba(0,0,0,0.75)] ${
        aside ? "lg:hidden" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-os/[0.08] px-3.5 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-dbz-orange" aria-hidden />
          <span className="font-display text-xs font-bold uppercase tracking-wider text-os/90 truncate">
            {titreSommaire}
          </span>
          <span className="rounded-full border border-os/15 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] tabular-nums text-os/65">
            {readerText("sectionsCount", { count: items.length })}
          </span>
        </div>
        {active !== "all" ? (
          <button
            type="button"
            onClick={() => selectTop("all")}
            className="shrink-0 rounded-lg border border-dbz-orange/40 bg-dbz-orange/10 px-2.5 py-1 font-display text-[11px] font-bold text-dbz-orange transition-colors hover:bg-dbz-orange hover:text-encre"
          >
            {readerText("showAll")}
          </button>
        ) : (
          <span className="hidden font-mono text-[11px] uppercase tracking-wider text-os/45 sm:inline">
            {readerText("readingModeAll")}
          </span>
        )}
      </div>
      <nav
        aria-label={titreSommaire}
        className="flex snap-x gap-2 overflow-x-auto px-3.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Pastille active={active === "all"} onClick={() => selectTop("all")}>
          {tout}
        </Pastille>
        {ungrouped.map((p) => (
          <Pastille key={p.key} active={active === p.key} onClick={() => selectTop(p.key)}>
            {p.label}
          </Pastille>
        ))}
        {groupOrder.map((g) => (
          <Pastille key={`g:${g}`} active={activeGroup === g} onClick={() => selectTop(`g:${g}`)}>
            {g}
            <span className="ml-0.5 rounded-full bg-black/20 px-1.5 py-0.2 text-[10px] tabular-nums opacity-75">
              {groupPanels(g).length}
            </span>
          </Pastille>
        ))}
      </nav>
      {activeGroup && activeChildren.length > 0 && (
        <nav
          aria-label={`${titreSommaire} — ${activeGroup}`}
          className="flex snap-x gap-2 overflow-x-auto border-t border-os/[0.08] px-3.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Pastille active={subActive === "all"} onClick={() => selectSub("all")}>
            {tout}
          </Pastille>
          {activeChildren.map((p) => (
            <Pastille
              key={`sub-${p.key}`}
              active={subActive === p.key}
              onClick={() => selectSub(p.key)}
            >
              {p.label}
            </Pastille>
          ))}
        </nav>
      )}
    </div>
  );

  // Sommaire vertical, dans la colonne latérale (grand écran).
  const liste = avecSommaire && aside && (
    <nav
      aria-label={titreSommaire}
      className="hidden rounded-lg border border-os/12 py-2 pr-2 lg:block"
    >
      <h2 className="px-3 pb-1 pt-1 font-display text-sm font-semibold text-os">{titreSommaire}</h2>
      <ul className="space-y-0.5">
        <li>
          <EntreeSommaire active={active === "all"} onClick={() => selectTop("all")}>
            {tout}
          </EntreeSommaire>
        </li>
        {ungrouped.map((p) => (
          <li key={p.key}>
            <EntreeSommaire active={active === p.key} onClick={() => selectTop(p.key)}>
              {p.label}
            </EntreeSommaire>
          </li>
        ))}
        {groupOrder.map((g) => (
          <li key={`g:${g}`}>
            <EntreeSommaire active={activeGroup === g} onClick={() => selectTop(`g:${g}`)}>
              {g}
            </EntreeSommaire>
            {activeGroup === g && (
              <ul className="mt-0.5 space-y-0.5">
                {groupPanels(g).map((p) => (
                  <li key={`sub-${p.key}`}>
                    <EntreeSommaire
                      depth={1}
                      active={subActive === p.key}
                      onClick={() => selectSub(p.key)}
                    >
                      {p.label}
                    </EntreeSommaire>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <Mise aside={aside} sommaire={liste}>
      {rangee}
      <div
        ref={contentRef}
        className="scroll-mt-[calc(var(--shell-header-h,4rem)+4.5rem)] space-y-10"
      >
        {items.map((p) => (
          <div key={p.key} id={`rubrique-${p.key}`} hidden={!visible(p)}>
            {p.node}
          </div>
        ))}
      </div>
      {children}
    </Mise>
  );
}

/**
 * Mise en page de la fiche : une colonne sur mobile (colonne latérale en tête),
 * deux colonnes sur grand écran, la latérale collante à droite.
 */
function Mise({
  aside,
  sommaire,
  children,
}: {
  aside?: ReactNode;
  sommaire?: ReactNode;
  children: ReactNode;
}) {
  if (!aside) return <div className="space-y-8">{children}</div>;
  return (
    <div className={FICHE_GRID}>
      <aside className={FICHE_ASIDE}>
        {aside}
        {sommaire}
      </aside>
      <div className={FICHE_MAIN}>{children}</div>
    </div>
  );
}
