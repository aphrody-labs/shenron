"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Pagination } from "@/components/kit/Pagination";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { CharacterCardGrid } from "@/components/wiki/CharacterPosterCard";
import { TechniqueFamiliesView } from "@/components/wiki/TechniqueFamiliesView";
import { WikiImg } from "@/components/wiki/WikiImg";
import {
  WikiFacet,
  WikiListLayout,
  WikiSearchField,
  WikiSegmented,
  normaliser,
} from "@/components/wiki/WikiListLayout";
import { assetUrl } from "@/lib/assets";
import { useTechniqueText } from "@/lib/technique-ui-text";
import type { AccessSnapshot } from "@aphrody/shenron-config/wiki-launch";

export type TechniqueCard = {
  id: number;
  slug: string;
  name: string;
  nameJa?: string | null;
  description: string | null;
  type: string | null;
  image: string | null;
  /** Only a source-verified technique SVG may populate this field. */
  icon?: string | null;
  source?: { label: string; url: string } | null;
  creatorName: string | null;
};

const PAGE_SIZE = 60;

export function TechniqueGrid({
  techniques,
  libelles,
  access,
}: {
  techniques: TechniqueCard[];
  libelles: Record<string, string>;
  access: AccessSnapshot;
}) {
  const t = useTechniqueText();
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [creators, setCreators] = useState<string[]>([]);
  const [sort, setSort] = useState<"documented" | "alpha">("documented");
  const [view, setView] = useState<"cards" | "families">("cards");
  const [page, setPage] = useState(1);
  const [initialPage] = useState(() => {
    const value =
      typeof window === "undefined"
        ? 1
        : Number(new URLSearchParams(window.location.search).get("p"));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
  });
  useEffect(() => {
    // Restore a captured URL after hydration; children may already have synchronized page 1.
    // oxlint-disable-next-line react/set-state-in-effect, react/no-deriving-state-in-effects -- restore an external URL snapshot after the matching server render
    setPage(initialPage);
  }, [initialPage]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const technique of techniques) {
      const type = technique.type ?? "";
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return [...counts]
      .toSorted((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: libelles[value] ?? (value || t("other")), count }));
  }, [techniques, libelles, t]);
  const creatorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const technique of techniques) {
      if (technique.creatorName)
        counts.set(technique.creatorName, (counts.get(technique.creatorName) ?? 0) + 1);
    }
    return [...counts]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [techniques]);
  const filtered = useMemo(() => {
    const text = normaliser(query);
    const selectedTypes = new Set(types);
    const selectedCreators = new Set(creators);
    const richness = (technique: TechniqueCard) =>
      Number(Boolean(technique.image)) * 3 +
      Number(Boolean(technique.description)) +
      Number(Boolean(technique.creatorName));
    return techniques
      .filter((technique) => {
        if (types.length && !selectedTypes.has(technique.type ?? "")) return false;
        if (creators.length && !selectedCreators.has(technique.creatorName ?? "")) return false;
        return (
          !text ||
          normaliser(
            [technique.name, technique.nameJa, technique.creatorName].filter(Boolean).join(" "),
          ).includes(text)
        );
      })
      .toSorted(
        (a, b) =>
          (sort === "documented" ? richness(b) - richness(a) : 0) || a.name.localeCompare(b.name),
      );
  }, [techniques, query, types, creators, sort]);
  const resetPage = () => {
    setPage(1);
  };
  const reset = () => {
    setQuery("");
    setTypes([]);
    setCreators([]);
    resetPage();
  };
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <WikiListLayout
      search={
        <WikiSearchField
          value={query}
          onChange={(value) => {
            setQuery(value);
            resetPage();
          }}
          label={t("search")}
          placeholder={t("searchPlaceholder")}
        />
      }
      filters={
        <>
          <WikiFacet
            title={t("type")}
            options={typeOptions}
            selected={types}
            onChange={(value) => {
              setTypes(value);
              resetPage();
            }}
          />
          <WikiFacet
            title={t("creator")}
            options={creatorOptions}
            selected={creators}
            onChange={(value) => {
              setCreators(value);
              resetPage();
            }}
          />
        </>
      }
      activeCount={types.length + creators.length + Number(Boolean(query))}
      onReset={reset}
      tools={
        <>
          <WikiSegmented
            label={t("sort")}
            value={sort}
            onChange={(value) => {
              setSort(value);
              resetPage();
            }}
            options={[
              ["documented", t("documented")],
              ["alpha", t("alphabetical")],
            ]}
          />
          <WikiSegmented
            label={t("display")}
            value={view}
            onChange={setView}
            options={[
              ["cards", t("cards")],
              ["families", t("families")],
            ]}
          />
        </>
      }
      resultCount={filtered.length}
      resultLabel={t("results", { count: filtered.length, total: techniques.length })}
    >
      {view === "families" ? (
        <TechniqueFamiliesView techniques={filtered} access={access} />
      ) : (
        <>
          <CharacterCardGrid>
            {visible.map((technique, index) => (
              <article key={technique.id} className="min-w-0">
                <ClientGatedWrap
                  access={access}
                  href={`/wiki/techniques/${technique.slug}`}
                  className="group/card block min-w-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange focus-visible:ring-offset-2 focus-visible:ring-offset-dbz-bg"
                >
                  <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.08] bg-dbz-card transition-colors group-hover/card:border-dbz-orange/60 group-focus-visible/card:border-dbz-orange/60">
                    <WikiImg
                      src={technique.image}
                      alt={technique.name}
                      loading={index < 12 ? "eager" : "lazy"}
                      sizes="(min-width: 1280px) 180px, (min-width: 1024px) 16vw, (min-width: 640px) 25vw, 45vw"
                      className="object-contain transition-transform duration-500 group-hover/card:scale-[1.03] motion-reduce:transition-none"
                    />
                    {!technique.image && (
                      <span className="absolute inset-x-2 bottom-3 text-center text-xs leading-5 text-white/60">
                        {t("imagePending")}
                      </span>
                    )}
                    {technique.icon && (
                      <div className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-black/75">
                        <Image src={assetUrl(technique.icon)} alt="" width={28} height={28} />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5 px-0.5">
                    <h2 className="line-clamp-2 font-display text-[13px] font-semibold leading-5 text-white/90 transition-colors group-hover/card:text-dbz-orange group-focus-visible/card:text-dbz-orange">
                      {technique.name}
                    </h2>
                    <p className="text-xs leading-5 text-dbz-orange/90">
                      {libelles[technique.type ?? ""] ?? technique.type ?? t("other")}
                    </p>
                    {technique.creatorName && (
                      <p className="line-clamp-2 text-xs leading-5 text-white/70">
                        {technique.creatorName}
                      </p>
                    )}
                    {technique.description && (
                      <p className="line-clamp-2 text-xs leading-5 text-white/55">
                        {technique.description}
                      </p>
                    )}
                  </div>
                </ClientGatedWrap>
                {technique.source && (
                  <a
                    href={technique.source.url}
                    className="mt-1 block break-words text-xs leading-5 text-white/55 underline decoration-white/20 underline-offset-4 hover:text-dbz-orange focus-visible:outline-2 focus-visible:outline-dbz-orange"
                  >
                    {technique.source.label}
                  </a>
                )}
              </article>
            ))}
          </CharacterCardGrid>
          <Pagination
            page={safePage}
            parPage={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            unite={t("unit")}
            className="pt-6"
          />
        </>
      )}
    </WikiListLayout>
  );
}
