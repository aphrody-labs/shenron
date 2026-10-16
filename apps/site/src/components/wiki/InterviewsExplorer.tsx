"use client";
/* oxlint-disable react/no-object-type-as-default-prop -- reviewed: legacy patterns, behavior preserved */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { ClientGatedWrap } from "@/components/GatedClientLink";
import { CharacterCardGrid } from "@/components/wiki/CharacterPosterCard";
import { WikiImg } from "@/components/wiki/WikiImg";
import { publicDatabookImage } from "@/lib/databook-media";
import { useInterviewUIText } from "@/lib/interview-ui-text";
import type { ToriyamaSourceGroup } from "@/lib/toriyama-shared";
import type { AccessSnapshot } from "@/lib/wiki-launch";

export type SortOrder = "date-desc" | "date-asc" | "count-desc" | "title-asc";
export type DecadeFilter = "all" | "80s" | "90s" | "2000s" | "2010s";
interface InterviewsExplorerProps {
  groups: ToriyamaSourceGroup[];
  access?: AccessSnapshot | null;
  ragResults?: Array<{ title: string; url: string; snippet: string }>;
}
const control =
  "min-h-11 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function InterviewsExplorer({ groups, access, ragResults = [] }: InterviewsExplorerProps) {
  const ui = useInterviewUIText();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("date-desc");
  const [decadeFilter, setDecadeFilter] = useState<DecadeFilter>("all");
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selectedCardRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!selectedDocument) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selectedDocument]);
  const sorted = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = groups.filter((group) => {
      if (decadeFilter !== "all") {
        const year = group.year;
        if (!year) return false;
        if (decadeFilter === "80s" && (year < 1980 || year > 1989)) return false;
        if (decadeFilter === "90s" && (year < 1990 || year > 1999)) return false;
        if (decadeFilter === "2000s" && (year < 2000 || year > 2009)) return false;
        if (decadeFilter === "2010s" && year < 2010) return false;
      }
      return (
        !q ||
        normalize(`${group.document} ${group.year ?? ""}`).includes(q) ||
        group.words.some((word) =>
          [word.subject, word.textFr, word.text, word.source].some(
            (value) => value && normalize(value).includes(q),
          ),
        )
      );
    });
    const titleOrder = (a: ToriyamaSourceGroup, b: ToriyamaSourceGroup) =>
      a.document.localeCompare(b.document, locale);
    return filtered.toSorted((a, b) => {
      if (sortOrder === "date-desc") return (b.year ?? 0) - (a.year ?? 0) || titleOrder(a, b);
      if (sortOrder === "date-asc") return (a.year ?? 9999) - (b.year ?? 9999) || titleOrder(a, b);
      if (sortOrder === "count-desc") return b.words.length - a.words.length || titleOrder(a, b);
      return titleOrder(a, b);
    });
  }, [groups, query, decadeFilter, sortOrder, locale]);
  const selected = sorted.find((group) => group.documentKey === selectedDocument);
  const citationCount = sorted.reduce((sum, group) => sum + group.words.length, 0);
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-3">
        <label className="min-w-0 flex-1 basis-56" htmlFor="interview-search">
          <span className="mb-1 block text-sm font-semibold">{ui("search")}</span>
          <input
            id="interview-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui("placeholder")}
            className={`${control} w-full`}
          />
        </label>
        <label htmlFor="interview-sort" className="text-sm">
          <span className="mb-1 block font-semibold">{ui("sort")}</span>
          <select
            id="interview-sort"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value as SortOrder)}
            className={control}
          >
            {(["date-desc", "date-asc", "count-desc", "title-asc"] as const).map((order) => (
              <option key={order} value={order}>
                {ui(`sorts.${order}`)}
              </option>
            ))}
          </select>
        </label>
        {query && (
          <button type="button" className={control} onClick={() => setQuery("")}>
            {ui("clear")}
          </button>
        )}
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-semibold">{ui("era")}</legend>
        {(["all", "80s", "90s", "2000s", "2010s"] as const).map((id) => (
          <button
            type="button"
            key={id}
            onClick={() => setDecadeFilter(id)}
            aria-pressed={decadeFilter === id}
            className={`${control} ${decadeFilter === id ? "bg-primary text-primary-foreground" : ""}`}
          >
            {ui(`eras.${id}`)}
          </button>
        ))}
      </fieldset>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {ui("results", { documents: sorted.length, citations: citationCount })}
      </p>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center">
          {ui("empty")}
        </p>
      ) : (
        <section aria-label={ui("gallery")}>
          <CharacterCardGrid dense>
            {sorted.map((group) => (
              <button
                type="button"
                key={group.documentKey}
                data-interview={group.documentKey}
                aria-expanded={selectedDocument === group.documentKey}
                aria-controls={
                  selectedDocument === group.documentKey ? "interview-document" : undefined
                }
                onClick={(event) => {
                  selectedCardRef.current = event.currentTarget;
                  setSelectedDocument(
                    selectedDocument === group.documentKey ? null : group.documentKey,
                  );
                }}
                className="group min-w-0 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-card group-hover:border-primary group-focus-visible:border-primary">
                  <WikiImg
                    src={publicDatabookImage(group.cover)}
                    alt=""
                    loading="lazy"
                    sizes="(min-width:1280px) 140px, (min-width:640px) 23vw, 45vw"
                    className="object-cover object-top"
                  />
                </div>
                <h2 className="mt-2 line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary">
                  {group.document}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.year ?? ui("unknownDate")} ·{" "}
                  {ui("citations", { count: group.words.length })}
                </p>
              </button>
            ))}
          </CharacterCardGrid>
        </section>
      )}
      {selected && (
        <section
          id="interview-document"
          ref={detailRef}
          tabIndex={-1}
          aria-label={selected.document}
          className="rounded-2xl border border-border bg-card p-4 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-semibold">{selected.document}</h2>
            <button
              type="button"
              className={control}
              onClick={() => {
                setSelectedDocument(null);
                selectedCardRef.current?.focus();
              }}
            >
              {ui("close")}
            </button>
          </div>
          <ul className="mt-4 space-y-4">
            {selected.words.map((word) => (
              <li key={word.id} className="border-l-2 border-primary pl-4">
                {word.subject && <h3 className="font-semibold">{word.subject}</h3>}
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                  {word.textFr ?? word.text}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{word.source}</p>
                {word.lang === "ja" && word.textFr && (
                  <p className="mt-1 text-xs text-muted-foreground">{ui("translated")}</p>
                )}
              </li>
            ))}
          </ul>
          {selected.words.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{ui("untranscribed")}</p>
          )}
          <ClientGatedWrap
            access={access}
            href={selected.databookId ? `/wiki/databooks/${selected.databookId}` : "/wiki/toriyama"}
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {ui("source")}
          </ClientGatedWrap>
        </section>
      )}
      {ragResults.length > 0 && (
        <aside
          className="rounded-xl border border-border bg-card p-4 text-sm"
          aria-label={ui("ragTitle")}
        >
          <h2 className="font-semibold">{ui("ragTitle")}</h2>
          <p className="mt-1 text-muted-foreground">{ui("ragLead")}</p>
          <ul className="mt-3 space-y-2">
            {ragResults.slice(0, 5).map((result, index) => (
              <li key={`${result.url}-${result.title}`} id={`interview-rag-${index}`}>
                <Link
                  className="text-primary underline-offset-4 hover:underline"
                  href={
                    result.url.startsWith("/") && !result.url.startsWith("//")
                      ? result.url
                      : `/wiki/interviews#interview-rag-${index}`
                  }
                >
                  {result.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
