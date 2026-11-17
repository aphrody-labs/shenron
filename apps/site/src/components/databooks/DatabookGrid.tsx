"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role, react/exhaustive-effect-dependencies, react/set-state-in-effect -- reviewed: legacy patterns, behavior preserved */

/**
 * Grille des databooks & interviews.
 *
 * Filtres **unifiés** (même style de boutons) — un seul plan de catégories :
 *   Tout · Databook · Interview · Art Book · Saikyō Jump · V-Jump · …
 *
 * Un seul filtre actif à la fois + tri date + recherche.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { WikiCatalogueToolbar } from "@/components/wiki/WikiCatalogueToolbar";
import { wikiMediaCatalogueMessages } from "@/lib/wiki-media-catalogue-messages";
import mediaStyles from "@/components/wiki/wiki-media-catalogue.module.css";
import { Pagination } from "@/components/kit/Pagination";
import { Bibliotheque, Livre, Micro, Palette, Tendance } from "@aphrody/shenron-ui/icones";
import { ViewTransition } from "@aphrody/shenron-ui/layout/ViewTransition";
import { WikiImg } from "@/components/wiki/WikiImg";
import {
  DATABOOK_CATEGORIES,
  resolveDatabookCategory,
  type DatabookCategory,
} from "@/lib/databook-categories";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";
import { toMillis } from "@/lib/epoch";
import {
  readAvailability,
  writeAvailability,
  type AvailabilityFilter,
} from "@/lib/availability-query";

export interface DatabookItem {
  id: number;
  kind: string;
  /** Catégorie unifiée (Databook, Interview, Art Book, V-Jump…). Null → « Autre ». */
  category: string | null;
  title: string;
  titleJa: string | null;
  author: string | null;
  publishedAt: number | null;
  /** Chemin d'asset brut (résolu via WikiImg / assetUrl), pas une URL absolue. */
  cover: string | null;
  /** Nombre de pages réellement renseignées (image ou transcription). */
  pageCount: number;
  /** Une description éditoriale existe, même sans planche. */
  hasDescription: boolean;
}

type ContentFilter = AvailabilityFilter;

type FilterTab =
  | { key: "all"; label: string; mode: "all"; icon: null }
  | {
      key: DatabookCategory;
      label: string;
      mode: "category";
      icon: typeof Livre | typeof Micro | typeof Palette | typeof Bibliotheque | null;
    };

const CATEGORY_ICONS: Partial<
  Record<DatabookCategory, typeof Livre | typeof Micro | typeof Palette | typeof Bibliotheque>
> = {
  Databook: Livre,
  "Art Book": Palette,
  "Saikyō Jump": Bibliotheque,
};

const FILTER_TABS: FilterTab[] = [
  { key: "all", label: "Tout", mode: "all", icon: null },
  ...DATABOOK_CATEGORIES.filter((c) => c !== "Interview").map((c): FilterTab => ({
    key: c,
    label: c,
    mode: "category",
    icon: CATEGORY_ICONS[c] ?? null,
  })),
];

/**
 * Match filtre catégorie + legacy kind.
 * Si `category` est déjà une valeur canonique (≠ Autre), elle prime.
 * Sinon on retombe sur `kind` (données avant unification).
 */
function matchesCategory(d: DatabookItem, cat: DatabookCategory): boolean {
  const resolved = resolveDatabookCategory(d.category);
  if (resolved === cat) return true;
  // Legacy : category vide/Autre + kind type précis
  if (resolved !== "Autre") return false;
  const kind = (d.kind ?? "").toLowerCase();
  if (cat === "Interview" && kind === "interview") return true;
  if (cat === "Art Book" && (kind === "artbook" || kind === "art_book")) return true;
  if (cat === "Saikyō Jump" && (kind === "guidebook" || kind === "guide_book")) return true;
  return false;
}

function formatDate(v: number | null, locale: string): string {
  if (!v) return "—";
  const ms = toMillis(v);
  try {
    return new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "long" });
  } catch {
    return "—";
  }
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const tabBtn =
  // `min-h-11` (44 px) : les onglets mesuraient 34 px de haut sur mobile, sous
  // la cible tactile recommandée. `shrink-0` + `snap-start` servent au rail
  // défilant qui remplace le retour à la ligne sur petit écran.
  "inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors";
const tabActive = "border-dbz-orange bg-dbz-orange/10 text-os";
const tabIdle = "border-dbz-border text-os/80 hover:border-dbz-yellow hover:text-dbz-yellow";

export function DatabookGrid({
  items,
  access,
}: {
  items: DatabookItem[];
  /** Instantané de la configuration de lancement, résolu côté serveur. */
  access?: AccessSnapshot | null;
}) {
  const locale = useLocale();
  const text = wikiMediaCatalogueMessages(locale);
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");

  useEffect(() => {
    try {
      setContentFilter(readAvailability(window.location.search));
    } catch {
      // URL indisponible : l'état par défaut reste « Tout ».
    }
  }, []);

  const changeContentFilter = (value: ContentFilter) => {
    setContentFilter(value);
    try {
      const url = new URL(window.location.href);
      writeAvailability(url, value);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // L'état local reste utilisable dans un environnement sans historique.
    }
  };

  const activeTab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]!;

  const filtered = useMemo(() => {
    const needle = norm(q);
    return items
      .filter((d) => {
        const hasContent = d.pageCount > 0 || d.hasDescription;
        if (contentFilter === "available" && !hasContent) return false;
        if (contentFilter === "incomplete" && hasContent) return false;
        if (activeTab.mode === "all") return true;
        return matchesCategory(d, activeTab.key as DatabookCategory);
      })
      .filter((d) => {
        if (!needle) return true;
        const hay = norm(
          `${d.title} ${d.titleJa ?? ""} ${d.author ?? ""} ${resolveDatabookCategory(d.category)}`,
        );
        return hay.includes(needle);
      })
      .slice()
      .toSorted((a, b) => {
        const av = a.publishedAt ?? 0;
        const bv = b.publishedAt ?? 0;
        return order === "desc" ? bv - av : av - bv;
      });
  }, [items, activeTab, contentFilter, q, order]);

  // Pagination : les 318 ouvrages étaient rendus d'un coup, couverture
  // comprise — 726 Ko de HTML pour une grille dont on voit vingt cases.
  const PAR_PAGE = 40;
  const [page, setPage] = useState(1);
  // Changer l'état de complétude modifie aussi le jeu filtré : rester sur la
  // page 4 après avoir choisi « À compléter » pouvait afficher une page vide
  // alors que des fiches existaient sur la première page.
  useEffect(() => setPage(1), [filter, contentFilter, q, order]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAR_PAGE));
  const pageSure = Math.min(page, pages);
  const visibles = useMemo(
    () => filtered.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE),
    [filtered, pageSure],
  );

  return (
    <div className="space-y-6">
      <WikiCatalogueToolbar
        query={q}
        onQueryChange={setQ}
        value={filter}
        onValueChange={setFilter}
        options={FILTER_TABS.map((tab) => ({
          value: tab.key,
          label:
            tab.key === "all"
              ? text("allBooks")
              : tab.key === "Autre"
                ? text("otherCategory")
                : tab.label,
        }))}
        searchLabel={text("searchBooks")}
        filterLabel={text("bookCategories")}
        count={filtered.length}
      />
      <div className={mediaStyles.bookToolbar}>
        <fieldset>
          <legend>{text("contentFilter")}</legend>
          <div>
            {(["all", "available", "incomplete"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeContentFilter(value)}
                aria-pressed={contentFilter === value}
                className={`${tabBtn} ${contentFilter === value ? tabActive : tabIdle}`}
              >
                {text(
                  value === "all"
                    ? "allBooks"
                    : value === "available"
                      ? "contentAvailable"
                      : "contentMissing",
                )}
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => setOrder((previous) => (previous === "desc" ? "asc" : "desc"))}
          className={`${tabBtn} ${tabIdle}`}
          title={text("reverseBookSort")}
        >
          <Tendance size={14} aria-hidden="true" />
          {text(order === "desc" ? "newestBook" : "oldestBook")}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-os/80">{text("emptyBooks")}</p>
      ) : (
        <div className="reveal-grid grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((d) => {
            const cat = resolveDatabookCategory(d.category);
            const Icon = CATEGORY_ICONS[cat] ?? Livre;
            return (
              <ClientGatedWrap
                access={access}
                key={d.id}
                href={`/wiki/databooks/${d.id}`}
                transitionTypes={["nav-forward"]}
                aria-label={`${cat === "Autre" ? text("otherCategory") : cat} : ${d.title}`}
                className={mediaStyles.bookCard}
              >
                {/* Légende SOUS la couverture, comme les affiches de films et
								    les tomes du manga (`components/stream/PosterCard`). Le
								    titre était auparavant posé sur le scan, ce qui obligeait à
								    noircir la moitié basse de chaque jaquette pour rester
								    lisible : la grille entière paraissait éteinte alors que les
								    couvertures de V-Jump sont très colorées. */}
                <div className={mediaStyles.bookArtwork}>
                  {d.cover ? (
                    <ViewTransition name={`databook-img-${d.id}`} share="morph">
                      <WikiImg
                        src={d.cover}
                        alt={d.title}
                        sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 45vw"
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    </ViewTransition>
                  ) : (
                    // Un ouvrage sans scan affichait une icône `text-white/20`
                    // sur fond noir : indiscernable d'une tuile cassée. On
                    // nomme l'absence au lieu de la laisser deviner.
                    <div className={mediaStyles.bookPlaceholder}>
                      <div aria-hidden className="absolute inset-0 halftone opacity-[0.08]" />
                      <Icon className="relative h-9 w-9" aria-hidden="true" />
                      <span className="relative px-2 text-center text-[10px] font-bold uppercase tracking-widest">
                        {text("missingBookCover")}
                      </span>
                    </div>
                  )}
                  {/* Un seul badge : la catégorie unifiée */}
                  <span className={mediaStyles.bookBadge}>
                    {cat === "Autre" ? text("otherCategory") : cat}
                  </span>
                  <span className={mediaStyles.bookStatus}>
                    {d.pageCount > 0
                      ? text("bookPages", { count: d.pageCount })
                      : d.hasDescription
                        ? text("bookProfile")
                        : text("contentMissing")}
                  </span>
                </div>
                <div className="mt-2 px-0.5">
                  <p className={mediaStyles.bookTitle}>{d.title}</p>
                  {d.titleJa && (
                    <p lang="ja" className="mt-1 truncate font-jp text-xs text-dbz-yellow">
                      {d.titleJa}
                    </p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-os/80">
                    {formatDate(d.publishedAt, locale)}
                    {d.author ? ` · ${d.author}` : ""}
                  </p>
                </div>
              </ClientGatedWrap>
            );
          })}
        </div>
      )}

      <Pagination
        page={pageSure}
        parPage={PAR_PAGE}
        total={filtered.length}
        onPageChange={setPage}
        unite={text("booksUnit")}
        className="pt-6"
      />
    </div>
  );
}
