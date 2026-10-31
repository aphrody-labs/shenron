// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import type { Thing, WithContext } from "schema-dts";
import { ContributeRail } from "@/components/kit/ContributeRail";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/PageHero";
import type { Crumb } from "@/components/Breadcrumbs";
import { WikiPageShell } from "@/components/wiki/WikiPageShell";
import type { ShellWidth } from "@aphrody/shenron-ui/layout/PageShell";

/**
 * Common frame of every wiki catalogue (characters, techniques, items, sagas, movies, music...).
 *
 * It keeps the best of the former index pages in one order, so a visitor finds the same
 * things in the same place everywhere:
 *
 *  1. hero (`PageHero`): an image only when it speaks about the page, typographic otherwise;
 *  2. staff bar + breadcrumbs (carried by the shell trail) + sibling-section tabs;
 *  3. an optional archive note and page actions;
 *  4. the catalogue itself (`children`), with its own empty state;
 *  5. the contribution rail naming what is missing here.
 *
 * Navigation, search and brand come from the site shell: nothing here repeats them.
 */
export function WikiIndexPage({
  eyebrow,
  title,
  lead,
  image,
  imageAlt,
  crumbs,
  category,
  note,
  actions,
  contributeKey,
  jsonLd,
  width = "default",
  children,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Hero image: omit for the typographic hero. */
  image?: string;
  imageAlt?: string;
  /** Page path under the home (the title is the last crumb). */
  crumbs: Crumb[];
  /** Key of the current section in the sibling tabs (`WikiCategoryNav`); omit for no tabs. */
  category?: string;
  /** Archive or method note, shown above the catalogue. */
  note?: ReactNode;
  actions?: ReactNode;
  /** `kit.contribute.what.*` dictionary key; omit for no contribution rail. */
  contributeKey?: string;
  jsonLd?: WithContext<Thing>;
  width?: ShellWidth;
  children: ReactNode;
}) {
  return (
    <div>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PageHero eyebrow={eyebrow} title={title} lead={lead} image={image} imageAlt={imageAlt} />
      <WikiPageShell adminBar crumbs={crumbs} category={category} actions={actions} width={width}>
        {note && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/80">
            {note}
          </div>
        )}
        {children}
        {contributeKey && <ContributeRail quoiKey={contributeKey} />}
      </WikiPageShell>
    </div>
  );
}
