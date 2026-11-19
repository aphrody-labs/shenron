// SPDX-License-Identifier: Apache-2.0
import { asc, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { foldText } from "@aphrody/shenron-config/slug";

// Caractères spéciaux d'une expression régulière POSIX avancée PostgreSQL.
const REGEX_SPECIALS = /[\\^$.|?*+()[\]{}]/g;

/** Échappe `term` pour l'insérer littéralement dans une ARE PostgreSQL. */
export function escapeRegex(term: string): string {
  return term.replace(REGEX_SPECIALS, "\\$&");
}

/**
 * Motif « mot entier » (`\m…\M`) du terme sans accents ni casse, lié comme
 * paramètre unique : jamais concaténé dans le texte SQL.
 */
export function wholeWordPattern(term: string): string {
  return `\\m${escapeRegex(foldText(term))}\\M`;
}

export interface FuzzyOrderOptions {
  /** Classe le nom le plus court d'abord (tier 4). Désactivé pour les listes numérotées. */
  shortestFirst?: boolean;
  /** Tris explicites placés après la proximité et avant l'`id` final. */
  then?: SQL[];
}

/**
 * ORDER BY de pertinence de la recherche wiki, du plus au moins prioritaire :
 * égalité exacte, mot entier dans la colonne principale, préfixe, nom le plus
 * court (`shortestFirst`), meilleure proximité trigramme (toutes colonnes),
 * tris explicites `then`, puis `id` croissant pour un ordre total stable.
 */
export function fuzzyOrder(term: string, cols: PgColumn[], options: FuzzyOrderOptions = {}): SQL[] {
  const { shortestFirst = true, then = [] } = options;
  const primary = cols[0];
  const folded = sql`unaccent(lower(${primary}))`;
  const sim = sql`greatest(${sql.join(
    cols.map((c) => sql`similarity(unaccent(lower(${c})), unaccent(lower(${term})))`),
    sql`, `,
  )})`;
  const order = [
    sql`(lower(${primary}) = lower(${term})) desc`,
    sql`(${folded} ~ ${wholeWordPattern(term)}) desc`,
    sql`(${folded} like unaccent(lower(${term})) || '%') desc`,
  ];
  if (shortestFirst) order.push(sql`length(${primary}) asc nulls last`);
  order.push(sql`${sim} desc nulls last`, ...then);
  const id = getTableColumns(primary.table as PgTable).id;
  if (id) order.push(asc(id));
  return order;
}
