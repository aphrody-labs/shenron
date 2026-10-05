"use client";

/**
 * Gabarit d'un index filtrable du wiki — recherche, filtres, compteur, résultats.
 *
 * Chaque index réinventait sa barre : une modale maison sur Personnages, une
 * rangée de puces qui débordait l'écran sur Lieux et Objets, des boutons de
 * 32 px sur Techniques. Ici, une seule mise en page, mobile d'abord :
 *
 *  - téléphone : la recherche et un bouton « Filtres » ; les filtres s'ouvrent
 *    dans une feuille (dialogue Base UI de `@shenron/ui/dialog` : focus piégé et
 *    rendu, Échap, défilement verrouillé) qui se referme sur « Voir N résultats » ;
 *  - grand écran : les mêmes filtres en panneau latéral collant, à gauche des
 *    résultats — aucun clic de plus pour filtrer.
 *
 * Les filtres sont rendus par l'appelant (`filters`) et pilotés par son état :
 * le panneau et la feuille montrent la même chose et ne divergent jamais.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogClose, DialogPopup, DialogTitle } from "@shenron/ui/dialog";
import { Croix, Scouter } from "@shenron/ui/icones";
import { useT } from "@/components/T";
import { STICKY_TOP } from "@/components/wiki/fiche-layout";

/** Normalise pour comparer sans accents ni casse (recherche tolérante). */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function useLibelles() {
  const t = useT();
  return (cle: string, repli: string, values?: Record<string, string | number>) =>
    t(`wikiCoeur.list.${cle}`, values) || repli;
}

export function WikiListLayout({
  search,
  filters,
  activeCount = 0,
  onReset,
  tools,
  resultCount,
  resultLabel,
  children,
}: {
  /** Champ de recherche (`WikiSearchField`). */
  search?: ReactNode;
  /** Contenu des filtres (`WikiFacet`, `WikiChoice`…). Omis : pas de panneau. */
  filters?: ReactNode;
  /** Nombre de filtres actifs (pastille du bouton, bouton d'effacement). */
  activeCount?: number;
  onReset?: () => void;
  /** Outils de la barre (tri, bascule de vue). */
  tools?: ReactNode;
  /** Nombre de résultats affichés, annoncé aux lecteurs d'écran. */
  resultCount: number;
  /** Libellé du compteur (« 12 / 1 307 personnages »). */
  resultLabel: ReactNode;
  children: ReactNode;
}) {
  const l = useLibelles();
  const [sheet, setSheet] = useState(false);

  // La feuille ne sert qu'au téléphone : passée en grand écran (rotation,
  // fenêtre élargie), elle se referme et le panneau latéral prend le relais.
  useEffect(() => {
    if (!sheet || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const close = () => mq.matches && setSheet(false);
    close();
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, [sheet]);

  const titreFiltres = l("filters", "Filtres");
  const effacer = activeCount > 0 && onReset && (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-white/65 transition-colors hover:text-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
    >
      <Croix className="h-3.5 w-3.5" aria-hidden />
      {l("reset", "Tout effacer")}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {search && <div className="min-w-[min(100%,16rem)] flex-1">{search}</div>}
        {filters && (
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 font-display text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange lg:hidden ${
              activeCount > 0
                ? "border-dbz-orange/60 bg-dbz-orange/10 text-dbz-orange"
                : "border-white/[0.12] bg-white/[0.04] text-white/80 hover:border-dbz-orange/60 hover:text-white"
            }`}
          >
            <Scouter className="h-4 w-4" aria-hidden />
            {titreFiltres}
            {activeCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-dbz-orange px-1.5 text-[11px] font-bold text-black">
                {activeCount}
              </span>
            )}
          </button>
        )}
        {tools}
        <p
          aria-live="polite"
          className="w-full text-[13px] tabular-nums text-white/60 sm:ml-auto sm:w-auto"
        >
          {resultLabel}
        </p>
      </div>

      <div
        className={
          filters
            ? "items-start lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[16rem_minmax(0,1fr)]"
            : undefined
        }
      >
        {filters && (
          <aside
            aria-label={titreFiltres}
            className={`hidden space-y-6 lg:sticky lg:block ${STICKY_TOP} lg:max-h-[calc(100dvh-var(--shell-header-h,4rem)-1.5rem)] lg:overflow-y-auto lg:pr-1 lg:pt-1 lg:[scrollbar-width:thin]`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-white">{titreFiltres}</h2>
              {effacer}
            </div>
            {filters}
          </aside>
        )}
        <div className="min-w-0">{children}</div>
      </div>

      {filters && (
        <Dialog open={sheet} onOpenChange={setSheet}>
          <DialogPopup
            closeLabel={l("close", "Fermer")}
            className="mt-auto flex max-h-[85dvh] max-w-xl flex-col self-end rounded-xl p-0 shadow-none sm:p-0 data-[ending-style]:translate-y-6 data-[ending-style]:scale-100 data-[starting-style]:translate-y-6 data-[starting-style]:scale-100 motion-reduce:transition-none"
          >
            <div className="border-b border-white/10 px-5 pb-4 pt-5 pr-16">
              <DialogTitle className="font-display text-lg font-semibold normal-case tracking-normal drop-shadow-none sm:text-lg">
                {titreFiltres}
              </DialogTitle>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">{filters}</div>
            <div className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
              {effacer}
              <DialogClose className="ml-auto inline-flex min-h-11 items-center rounded-xl bg-dbz-orange px-5 font-display text-sm font-bold text-black transition-colors hover:bg-dbz-yellow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {l("show", `Voir ${resultCount} résultats`, { count: resultCount })}
              </DialogClose>
            </div>
          </DialogPopup>
        </Dialog>
      )}
    </div>
  );
}

/** Champ de recherche d'un index. */
export function WikiSearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Nom accessible (« Rechercher un personnage »). */
  label: string;
  placeholder?: string;
}) {
  const l = useLibelles();
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        aria-label={label}
        className="h-11 w-full rounded-xl border border-white/[0.12] bg-white/[0.04] pl-11 pr-12 text-base text-white placeholder:text-white/45 transition-colors focus:border-dbz-orange/60 focus:bg-white/[0.06] focus:outline-none sm:text-sm"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={l("clear", "Effacer la recherche")}
          className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-dbz-orange"
        >
          <Croix className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export type FacetOption = { value: string; label: string; count?: number };

/**
 * Facette à choix multiples (cases à cocher), cherchable au-delà de huit
 * options. OU à l'intérieur d'une facette ; l'appelant fait le ET entre elles.
 */
export function WikiFacet({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const l = useLibelles();
  const id = useId();
  const [q, setQ] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const n = normaliser(q);
    return n ? options.filter((o) => normaliser(o.label).includes(n)) : options;
  }, [q, options]);
  if (options.length === 0) return null;

  const toggle = (value: string) =>
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 flex items-center gap-2 font-display text-[13px] font-semibold text-white">
        {title}
        {selected.length > 0 && (
          <span className="rounded-full bg-dbz-orange/20 px-2 py-0.5 text-[11px] font-bold text-dbz-orange">
            {selected.length}
          </span>
        )}
      </legend>
      {options.length > 8 && (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={l("facetSearch", `Filtrer ${title.toLowerCase()}…`, {
            title: title.toLowerCase(),
          })}
          aria-label={l("facetSearchLabel", `Rechercher dans ${title}`, { title })}
          aria-controls={`${id}-options`}
          className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base text-white placeholder:text-white/45 focus:border-dbz-orange/60 focus:outline-none sm:text-sm"
        />
      )}
      <div
        id={`${id}-options`}
        className="max-h-72 space-y-0.5 overflow-y-auto pr-1 [scrollbar-width:thin]"
      >
        {shown.length === 0 && (
          <p className="px-1 py-2 text-xs text-white/50">{l("noOption", "Aucune option.")}</p>
        )}
        {shown.map((o) => {
          const on = selectedSet.has(o.value);
          return (
            <label
              key={o.value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-dbz-orange ${
                on ? "bg-dbz-orange/15 text-white" : "text-white/75 hover:bg-white/[0.05]"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(o.value)}
                className="h-4 w-4 shrink-0 accent-dbz-orange"
              />
              <span className="flex-1 truncate">{o.label}</span>
              {typeof o.count === "number" && (
                <span className="shrink-0 text-[11px] tabular-nums text-white/55">{o.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Facette à choix unique (boutons radio) : catégorie d'objet, domaine d'un
 * lieu, type de technique. `""` = toutes.
 */
export function WikiChoice({
  title,
  options,
  value,
  onChange,
  allLabel,
}: {
  title: string;
  options: readonly FacetOption[];
  value: string;
  onChange: (v: string) => void;
  /** Libellé de l'option « toutes » ; omis, l'option n'est pas proposée. */
  allLabel?: string;
}) {
  const name = useId();
  const all: FacetOption[] = allLabel ? [{ value: "", label: allLabel }] : [];
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 font-display text-[13px] font-semibold text-white">{title}</legend>
      <div className="space-y-0.5">
        {[...all, ...options].map((o) => {
          const on = value === o.value;
          return (
            <label
              key={o.value || "__all"}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-dbz-orange ${
                on ? "bg-dbz-orange/15 text-white" : "text-white/75 hover:bg-white/[0.05]"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={on}
                onChange={() => onChange(o.value)}
                className="h-4 w-4 shrink-0 accent-dbz-orange"
              />
              <span className="flex-1 truncate">{o.label}</span>
              {typeof o.count === "number" && (
                <span className="shrink-0 text-[11px] tabular-nums text-white/55">{o.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Bascule segmentée (tri, mode d'affichage). Segments de 44 px, état exposé par
 * `aria-pressed` ; prend toute la largeur au téléphone.
 */
export function WikiSegmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<readonly [V, ReactNode]>;
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex w-full items-center rounded-xl border border-white/[0.12] bg-white/[0.04] p-0.5 sm:w-auto"
    >
      {options.map(([v, libelle]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 font-display text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dbz-orange sm:flex-none ${
            value === v ? "bg-dbz-orange text-black" : "text-white/70 hover:text-white"
          }`}
        >
          {libelle}
        </button>
      ))}
    </div>
  );
}
