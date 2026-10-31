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
  "grid items-start gap-8 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:gap-10";
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
    <header className="mx-auto mb-8 max-w-4xl space-y-4 text-center">
      {chips && <div className="flex flex-wrap items-center justify-center gap-3">{chips}</div>}
      <h1
        className="break-words text-5xl font-black uppercase leading-none tracking-tight text-white sm:text-6xl md:text-7xl"
        style={{ textShadow: "0 4px 20px rgba(0,0,0,0.9), 0 0 30px rgba(231,130,32,0.3)" }}
      >
        {name}
      </h1>
      {(nameJa || nameRomaji) && (
        <div className="flex flex-wrap items-center justify-center gap-4 text-gray-300">
          {nameJa && (
            <span lang="ja" className="font-jp text-2xl font-bold tracking-widest text-dbz-orange">
              {nameJa}
            </span>
          )}
          {nameRomaji && (
            <span className="text-sm font-extrabold uppercase italic tracking-[0.2em] text-white/80">
              {nameRomaji}
            </span>
          )}
        </div>
      )}
      {badges && <div className="flex flex-wrap justify-center gap-3 pt-2">{badges}</div>}
      {children}
    </header>
  );
}
