/* oxlint-disable react/preserve-manual-memoization, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/control-has-associated-label, jsx-a11y/prefer-tag-over-role -- behavior-preserving legacy pattern, reviewed */
"use client";

/**
 * DataTable — la table unique de l'administration.
 *
 * Une seule structure DOM pour deux présentations : sous `md`, chaque ligne est
 * une carte empilée (titre, champs étiquetés, actions en pied) ; à partir de
 * `md`, la même `<table>` redevient un tableau dense avec tri, pagination,
 * sélection et navigation clavier. Pas de double rendu : une action de ligne
 * (dialogue, mutation) n'existe qu'une fois.
 *
 * Liste-détail : quand des lignes portent un `detail`, le desktop (≥ `lg`)
 * l'affiche dans un panneau fixe à droite de la liste, mis à jour quand la ligne
 * active change (clic, Entrée, j/k) ; en dessous, « Voir le détail » l'ouvre en
 * feuille montant du bas de l'écran.
 *
 * Les cellules arrivent déjà rendues (`ReactNode`) avec leurs clés de tri : une
 * page serveur peut donc l'alimenter directement, sans fonction de rendu à
 * sérialiser. Les libellés sont injectés par l'application (i18n `admin.table`) ;
 * le français sert de repli.
 */
import { Dialog } from "@base-ui/react/dialog";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  Search,
  X,
} from "lucide-react";
import {
  ariaSortOf,
  clampPage,
  fillLabel,
  filterRows,
  moveIndex,
  nextSort,
  pageCountOf,
  pageHref,
  paginate,
  selectionState,
  sortRows,
  type ModelRow,
  type RowKey,
  type RowMove,
  type SortState,
} from "./data-table-model";
import { useHotkeys } from "./useHotkeys";

export type { RowKey, SortState, SortValue } from "./data-table-model";

export type DataTableAlign = "start" | "center" | "end";

/**
 * Place d'une colonne dans la carte mobile :
 * - `primary` : titre de la carte (une seule colonne, la première par défaut) ;
 * - `secondary` : ligne de contexte sous le titre, sans étiquette ;
 * - `field` : paire étiquette / valeur (défaut) ;
 * - `actions` : pied de carte, aligné à droite ;
 * - `hidden` : absente sur mobile, présente sur desktop.
 */
export type DataTableMobileRole = "primary" | "secondary" | "field" | "actions" | "hidden";

export interface DataTableColumn {
  key: string;
  header: ReactNode;
  /** Libellé texte de la colonne (tri mobile, étiquette de carte) quand `header` n'est pas une chaîne. */
  label?: string;
  align?: DataTableAlign;
  sortable?: boolean;
  /** Classes ajoutées à l'en-tête et aux cellules desktop (largeur, alignement…). */
  className?: string;
  mobile?: DataTableMobileRole;
}

export interface DataTableRow extends ModelRow {
  /** Nom lisible de la ligne (case de sélection, titre du détail). */
  label?: string;
  tone?: "default" | "muted" | "danger" | "accent";
  /** Contenu du panneau de détail (liste-détail). */
  detail?: ReactNode;
}

export interface DataTableLabels {
  empty: string;
  noMatch: string;
  search: string;
  searchPlaceholder: string;
  clearSearch: string;
  sortBy: string;
  sortDefault: string;
  ascending: string;
  descending: string;
  pagination: string;
  previous: string;
  next: string;
  pageOf: string;
  range: string;
  selectAll: string;
  selectRow: string;
  selected: string;
  clearSelection: string;
  detailTitle: string;
  detailEmpty: string;
  showDetail: string;
  closeDetail: string;
  shortcutsTitle: string;
  shortcutMove: string;
  shortcutOpen: string;
  shortcutSelect: string;
  shortcutFilter: string;
  shortcutPage: string;
}

export const DATA_TABLE_LABELS_FR: DataTableLabels = {
  empty: "Aucune ligne à afficher.",
  noMatch: "Aucune ligne ne correspond à « {query} ». Effacez le filtre pour tout revoir.",
  search: "Filtrer le tableau",
  searchPlaceholder: "Filtrer…",
  clearSearch: "Effacer le filtre",
  sortBy: "Trier par",
  sortDefault: "Ordre d’origine",
  ascending: "croissant",
  descending: "décroissant",
  pagination: "Pagination du tableau",
  previous: "Précédente",
  next: "Suivante",
  pageOf: "Page {page} sur {count}",
  range: "{from}–{to} sur {total}",
  selectAll: "Sélectionner les lignes affichées",
  selectRow: "Sélectionner {row}",
  selected: "{count} sélectionnée(s)",
  clearSelection: "Tout désélectionner",
  detailTitle: "Détail",
  detailEmpty: "Choisissez une ligne pour afficher son détail.",
  showDetail: "Voir le détail",
  closeDetail: "Fermer le détail",
  shortcutsTitle: "Raccourcis clavier",
  shortcutMove: "ligne suivante ou précédente",
  shortcutOpen: "ouvrir la ligne",
  shortcutSelect: "cocher la ligne",
  shortcutFilter: "filtrer",
  shortcutPage: "page précédente ou suivante",
};

type LinkLike = ComponentType<{ href: string; className?: string; children?: ReactNode }>;

export interface DataTablePagination {
  /** Page courante, 0-indexée. */
  page: number;
  pageCount: number;
  /** Nombre total de lignes côté serveur, pour l'intervalle « 51–100 sur 812 ». */
  total?: number;
  pageSize?: number;
  /** Composant client : changement de page en mémoire. */
  onPageChange?: (page: number) => void;
  /** Page serveur : gabarit d'URL, `{page}` numéroté à partir de 1 (`?page={page}`). */
  hrefTemplate?: string;
}

export interface DataTableProps {
  columns: readonly DataTableColumn[];
  rows: readonly DataTableRow[];
  /** Nom accessible du tableau ; masqué visuellement sauf `captionVisible`. */
  caption: ReactNode;
  captionVisible?: boolean;
  labels?: Partial<DataTableLabels>;
  /** Pagination en mémoire ; 0 désactive. Ignoré quand `pagination` est fourni. */
  pageSize?: number;
  /** Pagination pilotée par l'appelant (API paginée, URL). */
  pagination?: DataTablePagination;
  defaultSort?: SortState;
  searchable?: boolean;
  selectable?: boolean;
  /** Identifiant d'un `<form>` : les cases cochées y sont soumises sous `selectionName`. */
  selectionForm?: string;
  selectionName?: string;
  onSelectionChange?: (ids: RowKey[]) => void;
  /** Actions groupées, visibles dès qu'une ligne est cochée. La forme fonction est réservée aux composants client. */
  bulkActions?: ReactNode | ((ids: RowKey[], clear: () => void) => ReactNode);
  /** Filtres propres à la page, à droite du champ de filtre. */
  toolbar?: ReactNode;
  /** Raccourcis globaux `/`, `[`, `]` : un seul tableau par page doit les prendre. */
  hotkeys?: boolean;
  density?: "default" | "compact";
  empty?: ReactNode;
  className?: string;
  linkComponent?: LinkLike;
}

const ALIGN: Record<DataTableAlign, string> = {
  start: "md:text-left",
  center: "md:text-center",
  end: "md:text-right",
};

const JUSTIFY: Record<DataTableAlign, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

const MOBILE_CELL: Record<DataTableMobileRole, string> = {
  primary: "max-md:block max-md:pr-12 max-md:text-[15px] max-md:font-semibold max-md:text-os",
  secondary: "max-md:block max-md:text-sm max-md:text-os/60",
  field: "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:text-sm",
  actions:
    "max-md:mt-1 max-md:flex max-md:flex-wrap max-md:justify-end max-md:gap-2 max-md:border-t max-md:border-os/[0.08] max-md:pt-3",
  hidden: "max-md:hidden",
};

const ROW_TONE: Record<NonNullable<DataTableRow["tone"]>, string> = {
  default: "",
  muted: "opacity-60",
  danger: "max-md:border-dbz-red/40 md:bg-dbz-red/[0.06]",
  accent: "max-md:border-dbz-orange/40 md:bg-dbz-orange/[0.06]",
};

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

const BUTTON = `inline-flex min-h-11 items-center gap-1 rounded-lg border border-os/15 px-3 text-sm text-os/85 transition-colors hover:border-dbz-orange/70 hover:text-os aria-disabled:pointer-events-none aria-disabled:opacity-40 disabled:pointer-events-none disabled:opacity-40 md:min-h-9 ${FOCUS}`;

const KBD = "rounded border border-os/20 px-1.5 font-sans text-[11px] leading-5 text-os/75";

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role='button']";

function textOf(column: DataTableColumn): string {
  if (column.label) return column.label;
  return typeof column.header === "string" ? column.header : column.key;
}

function roleOf(column: DataTableColumn, index: number): DataTableMobileRole {
  return column.mobile ?? (index === 0 ? "primary" : "field");
}

export function DataTable({
  columns,
  rows,
  caption,
  captionVisible = false,
  labels: partialLabels,
  pageSize = 25,
  pagination,
  defaultSort = null,
  searchable = false,
  selectable = false,
  selectionForm,
  selectionName = "ids",
  onSelectionChange,
  bulkActions,
  toolbar,
  hotkeys = false,
  density = "default",
  empty,
  className = "",
  linkComponent: Link,
}: DataTableProps) {
  const labels = { ...DATA_TABLE_LABELS_FR, ...partialLabels };
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [query, setQuery] = useState("");
  const [localPage, setLocalPage] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<RowKey>>(() => new Set());
  const [active, setActive] = useState(-1);
  const [openId, setOpenId] = useState<RowKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const filtered = useMemo(() => filterRows(rows, query), [rows, query]);
  const sorted = useMemo(() => sortRows(filtered, sort), [filtered, sort]);
  const controlled = pagination !== undefined;
  const size = controlled ? 0 : pageSize;
  const pageCount = controlled
    ? Math.max(1, pagination.pageCount)
    : pageCountOf(sorted.length, size);
  const page = clampPage(controlled ? pagination.page : localPage, pageCount);
  const visible = useMemo(() => paginate(sorted, page, size), [sorted, page, size]);
  const visibleIds = visible.map((row) => row.id);
  const rowIds = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const selectedIds = [...selected].filter((id) => rowIds.has(id));
  const headState = selectionState(visibleIds, selected);
  const sortable = columns.filter((column) => column.sortable);
  const cellPad = density === "compact" ? "md:py-1.5" : "md:py-2.5";
  const hasDetail = rows.some((row) => row.detail !== undefined && row.detail !== null);
  const openRow = openId === null ? undefined : rows.find((row) => row.id === openId);

  const updateSelection = (next: ReadonlySet<RowKey>) => {
    setSelected(next);
    onSelectionChange?.([...next].filter((id) => rowIds.has(id)));
  };
  const clearSelection = () => updateSelection(new Set());
  const toggleRow = (id: RowKey) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelection(next);
  };
  const toggleVisible = () => {
    const next = new Set(selected);
    if (headState === "all") for (const id of visibleIds) next.delete(id);
    else for (const id of visibleIds) next.add(id);
    updateSelection(next);
  };

  const goTo = (target: number) => {
    const bounded = clampPage(target, pageCount);
    if (bounded === page) return;
    setActive(-1);
    if (!controlled) setLocalPage(bounded);
    else if (pagination.onPageChange) pagination.onPageChange(bounded);
    else if (pagination.hrefTemplate)
      window.location.assign(pageHref(pagination.hrefTemplate, bounded));
  };

  const focusRow = (index: number) => {
    if (index < 0) return;
    setActive(index);
    const row = visible[index];
    if (hasDetail && row?.detail !== undefined) setOpenId(row.id);
    bodyRef.current?.querySelector<HTMLElement>(`tr[data-row-index="${index}"]`)?.focus();
  };

  useHotkeys(
    {
      "/": () => searchRef.current?.focus(),
      "[": () => goTo(page - 1),
      "]": () => goTo(page + 1),
    },
    hotkeys,
  );

  const onBodyKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("tr[data-row-index]");
    if (!row || event.target !== row) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const index = Number(row.dataset.rowIndex);
    const moves: Record<string, RowMove> = {
      ArrowDown: "next",
      j: "next",
      ArrowUp: "previous",
      k: "previous",
      Home: "first",
      End: "last",
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusRow(moveIndex(index, visible.length, move));
      return;
    }
    if (selectable && (event.key === "x" || event.key === " ")) {
      event.preventDefault();
      const id = visible[index]?.id;
      if (id !== undefined) toggleRow(id);
      return;
    }
    if (event.key === "Enter") {
      const current = visible[index];
      if (hasDetail && current?.detail !== undefined) {
        event.preventDefault();
        setOpenId(current.id);
        return;
      }
      const target = row.querySelector<HTMLElement>("a[href], button:not([disabled])");
      if (target) {
        event.preventDefault();
        target.click();
      }
      return;
    }
    if (event.key === "Escape" && selectedIds.length > 0) {
      event.preventDefault();
      clearSelection();
    }
  };

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, row: DataTableRow) => {
    if (!hasDetail || row.detail === undefined) return;
    if ((event.target as Element).closest(INTERACTIVE)) return;
    setOpenId(row.id);
  };

  const total = controlled ? (pagination.total ?? null) : sorted.length;
  const perPage = controlled ? (pagination.pageSize ?? visible.length) : size;
  const from = visible.length === 0 ? 0 : page * (perPage || visible.length) + 1;
  const to = visible.length === 0 ? 0 : from + visible.length - 1;
  const tabbable = active >= 0 && active < visible.length ? active : 0;
  const showToolbar = searchable || sortable.length > 0 || toolbar;
  const bulk =
    typeof bulkActions === "function" ? bulkActions(selectedIds, clearSelection) : bulkActions;

  const shortcuts: { keys: string[]; label: string }[] = [
    { keys: ["j", "k"], label: labels.shortcutMove },
    { keys: ["Entrée"], label: labels.shortcutOpen },
    ...(selectable ? [{ keys: ["x"], label: labels.shortcutSelect }] : []),
    ...(hotkeys && searchable ? [{ keys: ["/"], label: labels.shortcutFilter }] : []),
    ...(hotkeys && pageCount > 1 ? [{ keys: ["[", "]"], label: labels.shortcutPage }] : []),
  ];

  const pagerLink = (target: number, label: ReactNode, disabled: boolean) => {
    const href = pagination?.hrefTemplate ? pageHref(pagination.hrefTemplate, target) : null;
    if (href && !pagination?.onPageChange) {
      if (disabled)
        return (
          <span aria-disabled="true" className={BUTTON}>
            {label}
          </span>
        );
      return Link ? (
        <Link href={href} className={BUTTON}>
          {label}
        </Link>
      ) : (
        <a href={href} className={BUTTON}>
          {label}
        </a>
      );
    }
    return (
      <button type="button" disabled={disabled} onClick={() => goTo(target)} className={BUTTON}>
        {label}
      </button>
    );
  };

  const table = (
    <div className="md:overflow-x-auto md:rounded-xl md:border md:border-os/12 md:bg-dbz-card/60">
      <table
        className="w-full border-collapse text-sm text-os/85 max-md:block"
        aria-describedby={hintId}
      >
        <caption
          className={
            captionVisible
              ? "px-3 pb-2 pt-3 text-left text-sm font-medium text-os/80 max-md:block max-md:px-0"
              : "sr-only"
          }
        >
          {caption}
        </caption>
        <thead className="border-b border-os/12 max-md:hidden">
          <tr>
            {selectable && (
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={headState === "all"}
                  ref={(input) => {
                    if (input) input.indeterminate = headState === "some";
                  }}
                  onChange={toggleVisible}
                  aria-label={labels.selectAll}
                  className={`h-4 w-4 cursor-pointer accent-kinto-lumiere ${FOCUS}`}
                />
              </th>
            )}
            {columns.map((column) => {
              const align = column.align ?? "start";
              const ariaSort = column.sortable ? ariaSortOf(sort, column.key) : undefined;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-os/55 ${ALIGN[align]} ${column.className ?? ""}`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort((current) => nextSort(current, column.key))}
                      className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-os ${FOCUS} ${ariaSort !== "none" ? "text-os" : ""} ${JUSTIFY[align]}`}
                    >
                      {column.header}
                      {ariaSort === "ascending" ? (
                        <ArrowUp aria-hidden className="h-3.5 w-3.5 text-dbz-orange" />
                      ) : ariaSort === "descending" ? (
                        <ArrowDown aria-hidden className="h-3.5 w-3.5 text-dbz-orange" />
                      ) : (
                        <ArrowUpDown aria-hidden className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody
          ref={bodyRef}
          onKeyDown={onBodyKeyDown}
          className="max-md:flex max-md:flex-col max-md:gap-3"
        >
          {visible.map((row, index) => {
            const isSelected = selected.has(row.id);
            const isOpen = hasDetail && openId === row.id;
            return (
              <tr
                key={row.id}
                data-row-index={index}
                tabIndex={index === tabbable ? 0 : -1}
                aria-selected={selectable ? isSelected : undefined}
                aria-current={isOpen ? "true" : undefined}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) setActive(index);
                }}
                onClick={(event) => onRowClick(event, row)}
                className={`outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-kinto-lumiere max-md:relative max-md:flex max-md:flex-col max-md:gap-1.5 max-md:rounded-xl max-md:border max-md:border-os/12 max-md:bg-dbz-card/70 max-md:p-4 md:border-b md:border-os/[0.08] md:last:border-b-0 md:hover:bg-os/[0.03] ${row.detail !== undefined ? "lg:cursor-pointer" : ""} ${isSelected ? "max-md:border-kinto-lumiere/50 md:bg-kinto-lumiere/[0.05]" : ""} ${isOpen ? "lg:bg-os/[0.06] lg:shadow-[inset_3px_0_0_var(--color-dbz-orange)]" : ""} ${ROW_TONE[row.tone ?? "default"]}`}
              >
                {selectable && (
                  <td className="max-md:absolute max-md:right-2 max-md:top-2 md:w-10 md:px-3">
                    <label className="grid min-h-11 min-w-11 cursor-pointer place-items-center md:min-h-0 md:min-w-0">
                      <input
                        type="checkbox"
                        name={selectionForm ? selectionName : undefined}
                        form={selectionForm}
                        value={String(row.id)}
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        className={`h-5 w-5 cursor-pointer accent-kinto-lumiere md:h-4 md:w-4 ${FOCUS}`}
                      />
                      <span className="sr-only">
                        {fillLabel(labels.selectRow, { row: row.label ?? String(row.id) })}
                      </span>
                    </label>
                  </td>
                )}
                {columns.map((column, columnIndex) => {
                  const role = roleOf(column, columnIndex);
                  const align = column.align ?? "start";
                  const detailButton =
                    role === "actions" && row.detail !== undefined ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(row.id);
                          setSheetOpen(true);
                        }}
                        className={`${BUTTON} lg:hidden`}
                      >
                        <PanelRightOpen aria-hidden className="h-4 w-4" />
                        {labels.showDetail}
                      </button>
                    ) : null;
                  return (
                    <td
                      key={column.key}
                      className={`md:px-3 ${cellPad} md:align-middle ${ALIGN[align]} ${MOBILE_CELL[role]} ${column.className ?? ""}`}
                    >
                      {role === "field" ? (
                        <>
                          <span className="shrink-0 text-xs text-os/50 md:hidden">
                            {column.label ?? column.header}
                          </span>
                          <div className="min-w-0 max-md:text-right">{row.cells[column.key]}</div>
                        </>
                      ) : (
                        <>
                          {row.cells[column.key]}
                          {detailButton}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={`space-y-3 ${className}`} data-admin-table="">
      {showToolbar && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {searchable && (
            <div className="relative min-w-0 sm:w-72">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-os/40"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(-1);
                  if (!controlled) setLocalPage(0);
                }}
                placeholder={labels.searchPlaceholder}
                aria-label={labels.search}
                aria-keyshortcuts={hotkeys ? "/" : undefined}
                className="h-11 w-full rounded-lg border border-os/15 bg-dbz-bg/80 pl-9 pr-10 text-sm text-os placeholder:text-os/40 focus:border-kinto-lumiere focus:outline-none md:h-9"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label={labels.clearSearch}
                  className={`absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-os/50 hover:text-os md:h-7 md:w-7 ${FOCUS}`}
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {sortable.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-os/60 md:hidden">
              <span className="shrink-0">{labels.sortBy}</span>
              <select
                value={sort ? `${sort.key}:${sort.direction}` : ""}
                onChange={(event) => {
                  const [key, direction] = event.target.value.split(":");
                  setSort(
                    key && direction
                      ? { key, direction: direction === "desc" ? "desc" : "asc" }
                      : null,
                  );
                }}
                className="h-11 min-w-0 flex-1 rounded-lg border border-os/15 bg-dbz-bg/80 px-3 text-sm text-os focus:border-kinto-lumiere focus:outline-none"
              >
                <option value="">{labels.sortDefault}</option>
                {sortable.flatMap((column) => [
                  <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
                    {textOf(column)} ({labels.ascending})
                  </option>,
                  <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
                    {textOf(column)} ({labels.descending})
                  </option>,
                ])}
              </select>
            </label>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{toolbar}</div>}
        </div>
      )}

      {selectable && selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-kinto-lumiere/40 bg-kinto-lumiere/[0.05] px-3 py-2"
          role="region"
          aria-label={fillLabel(labels.selected, { count: selectedIds.length })}
        >
          <span className="text-sm font-medium tabular-nums text-os" aria-live="polite">
            {fillLabel(labels.selected, { count: selectedIds.length })}
          </span>
          <div className="flex flex-wrap items-center gap-2">{bulk}</div>
          <button
            type="button"
            onClick={clearSelection}
            className={`ml-auto min-h-11 rounded-lg px-3 text-sm text-os/60 hover:text-os md:min-h-9 ${FOCUS}`}
          >
            {labels.clearSelection}
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-os/12 bg-dbz-card/60 p-6 text-center text-sm text-os/60">
          {query ? fillLabel(labels.noMatch, { query }) : (empty ?? labels.empty)}
        </div>
      ) : hasDetail ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)] lg:items-start lg:gap-4">
          {table}
          <aside
            aria-label={openRow?.label ?? labels.detailTitle}
            aria-live="polite"
            className="hidden rounded-xl border border-os/12 bg-dbz-card/70 p-5 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
          >
            {openRow?.detail ?? <p className="text-sm text-os/55">{labels.detailEmpty}</p>}
          </aside>
        </div>
      ) : (
        table
      )}

      {hasDetail && (
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-[80] bg-dbz-bg/80 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
            <Dialog.Popup className="fixed inset-x-0 bottom-0 z-[80] max-h-[85dvh] overflow-y-auto rounded-t-xl border-t border-os/12 bg-dbz-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-os outline-none transition-transform duration-200 data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-reduce:transition-none lg:hidden">
              <div className="mb-4 flex items-start justify-between gap-3">
                <Dialog.Title className="text-base font-semibold text-os">
                  {openRow?.label ?? labels.detailTitle}
                </Dialog.Title>
                <Dialog.Close
                  aria-label={labels.closeDetail}
                  className={`-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-lg text-os/60 hover:text-os ${FOCUS}`}
                >
                  <X aria-hidden className="h-5 w-5" />
                </Dialog.Close>
              </div>
              {openRow?.detail}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      <dl
        id={hintId}
        aria-label={labels.shortcutsTitle}
        className="hidden flex-wrap gap-x-5 gap-y-1 text-xs text-os/45 md:flex"
      >
        {shortcuts.map((shortcut) => (
          <div key={shortcut.label} className="flex items-center gap-1.5">
            <dt className="flex gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className={KBD}>
                  {key}
                </kbd>
              ))}
            </dt>
            <dd>{shortcut.label}</dd>
          </div>
        ))}
      </dl>

      {pageCount > 1 && (
        <nav
          aria-label={labels.pagination}
          className="flex flex-wrap items-center justify-between gap-2"
        >
          {pagerLink(
            page - 1,
            <>
              <ChevronLeft aria-hidden className="h-4 w-4" />
              {labels.previous}
            </>,
            page === 0,
          )}
          <p className="text-sm tabular-nums text-os/55" aria-live="polite">
            {fillLabel(labels.pageOf, { page: page + 1, count: pageCount })}
            {total !== null && (
              <span className="ml-2 hidden text-os/40 sm:inline">
                {fillLabel(labels.range, { from, to, total })}
              </span>
            )}
          </p>
          {pagerLink(
            page + 1,
            <>
              {labels.next}
              <ChevronRight aria-hidden className="h-4 w-4" />
            </>,
            page >= pageCount - 1,
          )}
        </nav>
      )}
    </div>
  );
}
