// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import type { Thing, WithContext } from "schema-dts";
import { Breadcrumbs, type Crumb } from "@/components/Breadcrumbs";
import { JsonLd } from "@/components/JsonLd";
import { DomainBar } from "@/components/kit/DomainBar";
import { ContributeRail } from "@/components/kit/ContributeRail";
import { WikiEditBar } from "@/components/wiki/WikiEditBar";
import { FICHE_ASIDE, FICHE_GRID, FICHE_MAIN } from "@/components/wiki/fiche-layout";

const FICHE_GRID_ASIDE_LEFT =
  "grid items-start gap-8 lg:grid-cols-[minmax(16rem,18rem)_minmax(0,1fr)] lg:gap-10";
const FICHE_ASIDE_LEFT = `space-y-4 lg:sticky top-[var(--shell-header-h,4rem)] lg:col-start-1 lg:row-start-1 lg:max-h-[calc(100dvh-var(--shell-header-h,4rem)-1.5rem)] lg:overflow-y-auto lg:pt-2 lg:[scrollbar-width:thin]`;
const FICHE_MAIN_RIGHT = "min-w-0 space-y-10 lg:col-start-2 lg:row-start-1";

type EditTarget = {
  table: string;
  id: number;
  indexHref: string;
  label: string;
};

/**
 * Common frame of every wiki entity page (character, technique, location, item, race, saga,
 * arc, transformation, game...).
 *
 * One order everywhere: staff bar, breadcrumbs (carried by the shell trail), contribution bar,
 * entity header, then the two-column grid of the best fiche layouts (content on the left, a
 * sticky infobox on the right, the infobox first on mobile), and the contribution rail.
 * Sections of the main column stay the page's own (`WikiEntitySections`, `WikiSectionsReader`).
 *
 * Navigation, search and brand come from the site shell: nothing here repeats them.
 */
export function WikiDetailPage({
  entity,
  source,
  jsonLd,
  crumbs,
  edit,
  lead,
  header,
  aside,
  asidePosition = "right",
  contributeKey,
  tracker,
  children,
}: {
  /** Entity name, exposed as `data-entity` for the page tools. */
  entity: string;
  /** Source table, exposed as `data-source-id`. */
  source: string;
  jsonLd?: WithContext<Thing>;
  crumbs: Crumb[];
  /** Contribution bar target; omit for a read-only entity. */
  edit?: EditTarget;
  /** Content between the contribution bar and the header (version switcher, notices). */
  lead?: ReactNode;
  /** Entity header: use `WikiEntityHeader`. */
  header: ReactNode;
  /** Infobox column; omit for a single column. */
  aside?: ReactNode;
  /** Desktop position of the infobox; it stays first on mobile. */
  asidePosition?: "left" | "right";
  /** `kit.contribute.what.*` dictionary key; omit for no contribution rail. */
  contributeKey?: string;
  /** View tracker (client island) mounted with the page. */
  tracker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article
      data-entity={entity}
      data-source-id={source}
      data-lang="fr"
      className="wiki-container reveal-up"
    >
      {jsonLd && <JsonLd data={jsonLd} />}
      {tracker}
      <DomainBar domain="wiki" />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <Breadcrumbs items={crumbs} />
        {edit && (
          <WikiEditBar
            sansArticle
            table={edit.table}
            id={edit.id}
            indexHref={edit.indexHref}
            label={edit.label}
          />
        )}
      </div>
      {lead}
      {header}
      {aside ? (
        <div className={asidePosition === "left" ? FICHE_GRID_ASIDE_LEFT : FICHE_GRID}>
          <aside className={asidePosition === "left" ? FICHE_ASIDE_LEFT : FICHE_ASIDE}>
            {aside}
          </aside>
          <div className={asidePosition === "left" ? FICHE_MAIN_RIGHT : FICHE_MAIN}>{children}</div>
        </div>
      ) : (
        <div className="min-w-0 space-y-10">{children}</div>
      )}
      {contributeKey && <ContributeRail quoiKey={contributeKey} className="mt-10" />}
    </article>
  );
}

/**
 * Entity header shared by all wiki fiches: kind chips, large name, Japanese and romaji names,
 * then badges (race, affiliation, origin...). Centered, like the character page it comes from.
 */
export function WikiEntityHeader({
  name,
  nameJa,
  nameRomaji,
  chips,
  badges,
  children,
}: {
  name: ReactNode;
  nameJa?: string | null;
  nameRomaji?: string | null;
  /** Small identifying chips above the name (type, identifier). */
  chips?: ReactNode;
  /** Badges under the names. */
  badges?: ReactNode;
  /** Extra line under the badges (creator, source...). */
  children?: ReactNode;
}) {
  return (
    <header className="relative mx-auto mb-8 max-w-5xl overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.045] via-dbz-card/70 to-dbz-card/30 px-5 py-7 text-center shadow-[0_20px_50px_-24px_rgba(0,0,0,0.85)] sm:px-10 sm:py-9">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-dbz-orange/60 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[28rem] -translate-x-1/2 rounded-full bg-dbz-orange/10 blur-3xl"
      />
      <div className="relative z-[1] space-y-4">
        {chips && <div className="flex flex-wrap items-center justify-center gap-2.5">{chips}</div>}
        <h1
          className="break-words text-4xl font-black uppercase leading-none tracking-tight text-white sm:text-6xl md:text-7xl"
          style={{ textShadow: "0 4px 20px rgba(0,0,0,0.9), 0 0 30px rgba(231,130,32,0.28)" }}
        >
          {name}
        </h1>
        {(nameJa || nameRomaji) && (
          <div className="inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/[0.08] bg-black/35 px-4 py-1.5 text-gray-300">
            {nameJa && (
              <span
                lang="ja"
                className="font-jp text-lg font-bold tracking-widest text-dbz-orange sm:text-xl"
              >
                {nameJa}
              </span>
            )}
            {nameJa && nameRomaji && <span aria-hidden className="h-3.5 w-px bg-white/15" />}
            {nameRomaji && (
              <span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/80">
                {nameRomaji}
              </span>
            )}
          </div>
        )}
        {badges && <div className="flex flex-wrap justify-center gap-2.5 pt-1">{badges}</div>}
        {children}
      </div>
    </header>
  );
}
