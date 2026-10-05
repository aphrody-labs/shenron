/**
 * Modèle pur de la table d'administration : tri, filtre, pagination, navigation
 * clavier. Sans React, pour que chaque règle se teste sans DOM et que la table
 * serveur comme la table client calculent la même chose.
 */
import type { ReactNode } from "react";

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;
export type RowKey = string | number;
export type SortValue = string | number | boolean | Date | null | undefined;

export interface ModelRow {
  id: RowKey;
  cells: Record<string, ReactNode>;
  sort?: Record<string, SortValue>;
  search?: string;
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Minuscules sans diacritiques : « Végéta » et « vegeta » se trouvent l'un l'autre. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function primitive(node: ReactNode): string | number | null {
  return typeof node === "string" || typeof node === "number" ? node : null;
}

/** Valeur de tri d'une cellule : la clé explicite, sinon la cellule si elle est un texte ou un nombre. */
export function sortValueOf(row: ModelRow, key: string): SortValue {
  if (row.sort && key in row.sort) return row.sort[key];
  return primitive(row.cells[key]);
}

function comparable(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/** Tri stable ; les valeurs absentes finissent toujours en bas, quel que soit le sens. */
export function sortRows<R extends ModelRow>(rows: readonly R[], sort: SortState): R[] {
  if (!sort) return [...rows];
  const factor = sort.direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: comparable(sortValueOf(row, sort.key)) }))
    .toSorted((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const diff =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return diff === 0 ? a.index - b.index : diff * factor;
    })
    .map((entry) => entry.row);
}

/** Texte cherché d'une ligne : `search` explicite, sinon les cellules textuelles. */
export function haystackOf(row: ModelRow): string {
  if (row.search !== undefined) return fold(row.search);
  return fold(
    Object.values(row.cells)
      .map(primitive)
      .filter((value) => value !== null)
      .join(" "),
  );
}

export function filterRows<R extends ModelRow>(rows: readonly R[], query: string): R[] {
  const needle = fold(query.trim());
  if (!needle) return [...rows];
  const terms = needle.split(/\s+/);
  return rows.filter((row) => {
    const haystack = haystackOf(row);
    return terms.every((term) => haystack.includes(term));
  });
}

export function pageCountOf(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Page bornée (0-indexée) : une page hors limites retombe sur la dernière existante. */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.floor(page), Math.max(0, pageCount - 1));
}

export function paginate<R>(rows: readonly R[], page: number, pageSize: number): R[] {
  if (pageSize <= 0) return [...rows];
  const start = clampPage(page, pageCountOf(rows.length, pageSize)) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Cycle d'un en-tête triable : croissant, décroissant, puis ordre d'origine. */
export function nextSort(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

export function ariaSortOf(sort: SortState, key: string): "ascending" | "descending" | "none" {
  if (!sort || sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

export type RowMove = "next" | "previous" | "first" | "last";

/** Ligne active suivante, bornée ; -1 (aucune) part de la première ou de la dernière. */
export function moveIndex(current: number, count: number, move: RowMove): number {
  if (count <= 0) return -1;
  switch (move) {
    case "first":
      return 0;
    case "last":
      return count - 1;
    case "next":
      return current < 0 ? 0 : Math.min(count - 1, current + 1);
    case "previous":
      return current < 0 ? count - 1 : Math.max(0, current - 1);
  }
}

/** Remplit `{name}` dans un libellé — le sous-ensemble ICU dont la table a besoin. */
export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Lien de page à partir d'un gabarit serveur (`?page={page}`), numéroté à partir de 1. */
export function pageHref(template: string, page: number): string {
  return template.replaceAll("{page}", String(page + 1));
}

/** État de la case « tout sélectionner » pour les lignes visibles. */
export function selectionState(
  visible: readonly RowKey[],
  selected: ReadonlySet<RowKey>,
): "none" | "some" | "all" {
  if (visible.length === 0) return "none";
  const count = visible.filter((id) => selected.has(id)).length;
  if (count === 0) return "none";
  return count === visible.length ? "all" : "some";
}
