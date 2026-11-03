"use client";
// SPDX-License-Identifier: Apache-2.0
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { Baguette, Chargement, Etincelle, LienExterne, Plus } from "@aphrody/shenron-ui/icones";
import { apiAt } from "@/lib/admin-api";
import { sectionKeyFromLabel } from "@/lib/wiki-fields";
import { crudBase } from "@/lib/wiki-tables";
import { PlainField } from "@/components/editor/PlainField";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";
import { useLangue } from "@/lib/i18n/client";

interface RagHit {
  title: string;
  url: string;
  snippet: string;
  score: number | null;
  kind: string;
}
interface DraftResult {
  results: RagHit[];
  markdown: string;
  draftKind?: "generated" | "extracts";
}
interface Props {
  entityType: string;
  entityId: string;
  entityName: string;
}

/** Each entity owns its draft, including pending requests and review state. */
export function WikiAiAssistant(props: Props) {
  return <WikiAiSession key={`${props.entityType}:${props.entityId}`} {...props} />;
}

function WikiAiSession({ entityType, entityId, entityName }: Props) {
  const t = useWikiEditorialText();
  const { locale } = useLangue();
  const qc = useQueryClient();
  const fieldId = useId();
  const [query, setQuery] = useState(entityName);
  const [label, setLabel] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [activeDraft, setActiveDraft] = useState<DraftResult | null>(null);
  const [candidate, setCandidate] = useState<DraftResult | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const editedText = useRef("");
  const client = apiAt(crudBase("db_wiki_sections"));

  const search = useMutation({
    mutationFn: async ({ q, action }: { q: string; action: "search" | "draft" }) => {
      const response = await fetch("/api/wiki-ai", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, limit: 10, action, lang: locale }),
      });
      if (!response.ok) throw new Error(`wiki_assistant_${response.status}`);
      return (await response.json()) as DraftResult;
    },
    onSuccess: (data) => {
      setResult(data);
      // A response arriving after an edit must never replace the editor's work.
      if (!editedText.current.trim()) {
        editedText.current = data.markdown;
        setMarkdown(data.markdown);
        setActiveDraft(data);
        setReviewed(false);
        setCandidate(null);
      } else if (data.markdown.trim()) setCandidate(data);
    },
  });

  const insert = useMutation({
    mutationFn: ({ body, title }: { body: string; title: string }) =>
      client.post("/db_wiki_sections", {
        entityType,
        entityId,
        key: sectionKeyFromLabel(title),
        label: title,
        accent: "orange",
        body,
        sortOrder: 99,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki-sections", entityType, entityId] });
      editedText.current = "";
      setMarkdown("");
      setReviewed(false);
      setCandidate(null);
      setActiveDraft(null);
    },
  });

  const searchFor = (action: "search" | "draft") => {
    if (query.trim() && !search.isPending && !insert.isPending) {
      insert.reset();
      search.mutate({ q: query.trim(), action });
    }
  };
  const presets = [
    { key: "history", query: "historyQuery" },
    { key: "context", query: "contextQuery" },
    { key: "sourcesPreset", query: "sourcesQuery" },
  ];
  const sourceResult = activeDraft ?? result;

  return (
    <section
      className="min-w-0 space-y-5 rounded-xl border border-dbz-border bg-dbz-card p-5"
      aria-labelledby={`${fieldId}-title`}
    >
      <header>
        <h3
          id={`${fieldId}-title`}
          className="flex items-center gap-2 font-display text-lg font-bold text-dbz-blue-light"
        >
          <Etincelle aria-hidden className="h-5 w-5 shrink-0" /> {t("assistant.title")}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-os/75">{t("assistant.intro")}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            disabled={search.isPending || insert.isPending}
            onClick={() => setQuery(t(`assistant.${preset.query}`, { name: entityName }))}
            className="dbz-button-ghost inline-flex min-h-11 items-center gap-2 px-3 text-sm disabled:opacity-50"
          >
            <Baguette aria-hidden className="h-4 w-4" /> {t(`assistant.${preset.key}`)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          searchFor("search");
        }}
        className="space-y-3"
        aria-busy={search.isPending}
      >
        <label htmlFor={`${fieldId}-query`} className="block text-sm font-semibold text-os">
          {t("assistant.query")}
        </label>
        <input
          id={`${fieldId}-query`}
          name="query"
          required
          maxLength={2000}
          className="input min-h-12 w-full min-w-0 text-base"
          aria-describedby={`${fieldId}-hint`}
          value={query}
          disabled={search.isPending || insert.isPending}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p id={`${fieldId}-hint`} className="text-sm text-os/75">
          {t("assistant.queryHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={search.isPending || insert.isPending}
            className="btn btn-ghost min-h-12"
          >
            {t("assistant.search")}
          </button>
          <button
            type="button"
            onClick={() => searchFor("draft")}
            disabled={search.isPending || insert.isPending || !query.trim()}
            className="btn btn-primary min-h-12"
          >
            <Etincelle aria-hidden className="h-4 w-4" /> {t("assistant.draft")}
          </button>
        </div>
      </form>
      {search.isPending && (
        <output className="flex items-center gap-2 text-sm text-os/75">
          <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("assistant.working")}
        </output>
      )}
      {search.isError && (
        <p role="alert" className="text-sm text-dbz-red">
          {t("assistant.failed")}
        </p>
      )}
      {search.isSuccess && result?.results.length === 0 && (
        <output className="text-sm text-os/75">{t("assistant.empty")}</output>
      )}
      {sourceResult && sourceResult.results.length > 0 && (
        <details className="rounded-xl border border-dbz-border p-3" open>
          <summary className="cursor-pointer py-2 text-sm font-bold text-os">
            {t("assistant.sources", { count: sourceResult.results.length })}
          </summary>
          <ul className="mt-2 space-y-3">
            {sourceResult.results.map((hit) => (
              <li
                key={`${hit.url}:${hit.title}:${hit.snippet}`}
                className="min-w-0 border-t border-dbz-border pt-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-words font-semibold text-os">
                    {hit.title || t("assistant.source")}
                  </span>
                  {hit.url && (
                    <a
                      href={hit.url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={t("assistant.openSource", {
                        title: hit.title || t("assistant.source"),
                      })}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-dbz-blue-light hover:text-dbz-yellow"
                    >
                      <LienExterne aria-hidden className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <p className="break-words leading-relaxed text-os/75">{hit.snippet}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {candidate && (
        <details className="rounded-xl border border-dbz-yellow/40 bg-dbz-yellow/5 p-4">
          <summary className="cursor-pointer py-2 font-semibold text-dbz-yellow">
            {t("assistant.candidate")}
          </summary>
          <p className="mt-2 text-sm text-os/75">{t("assistant.candidateHint")}</p>
          <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm text-os">
            {candidate.markdown}
          </pre>
          <button
            type="button"
            disabled={insert.isPending}
            className="btn btn-ghost min-h-11"
            onClick={() => {
              editedText.current = candidate.markdown;
              setMarkdown(candidate.markdown);
              setActiveDraft(candidate);
              setReviewed(false);
              setCandidate(null);
              insert.reset();
            }}
          >
            {t("assistant.useCandidate")}
          </button>
        </details>
      )}
      {markdown.trim() && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!reviewed || !label.trim() || insert.isPending) return;
            insert.mutate({ body: markdown, title: label.trim() });
          }}
          className="space-y-4"
          aria-busy={insert.isPending}
        >
          <p className="text-sm font-bold text-dbz-yellow">
            {t(
              activeDraft?.draftKind === "generated" ? "assistant.generated" : "assistant.extracts",
            )}
          </p>
          <PlainField
            name="markdown"
            label={t("assistant.markdown")}
            value={markdown}
            onChange={(value) => {
              editedText.current = value;
              setMarkdown(value);
              setReviewed(false);
              insert.reset();
            }}
            minRows={8}
            maxRows={30}
            maxLength={40_000}
            disabled={insert.isPending}
            monospace
          />
          <label htmlFor={`${fieldId}-label`} className="block text-sm font-semibold text-os">
            {t("assistant.label")}
          </label>
          <input
            id={`${fieldId}-label`}
            name="label"
            className="input min-h-12 w-full text-base"
            required
            maxLength={160}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={insert.isPending}
          />
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-dbz-border p-3 text-sm text-os">
            <input
              type="checkbox"
              name="reviewed"
              required
              checked={reviewed}
              disabled={insert.isPending}
              onChange={(event) => setReviewed(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-dbz-orange"
            />
            {t("assistant.review")}
          </label>
          <button
            type="submit"
            disabled={insert.isPending || search.isPending}
            className="btn btn-primary min-h-12"
          >
            {insert.isPending ? (
              <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus aria-hidden className="h-4 w-4" />
            )}
            {t("assistant.insert")}
          </button>
        </form>
      )}
      {insert.isSuccess && (
        <output className="text-sm text-dbz-cyan">{t("assistant.created")}</output>
      )}
      {insert.isError && (
        <p role="alert" className="text-sm text-dbz-red">
          {t("assistant.insertFailed")}
        </p>
      )}
    </section>
  );
}
