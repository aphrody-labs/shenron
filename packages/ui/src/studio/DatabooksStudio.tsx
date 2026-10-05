// SPDX-License-Identifier: Apache-2.0
// Databooks & corpus: offline search of the Shenron corpus (shenron_rag::dragonball::LocalCorpus,
// `studio_corpus_*` in crates/shenron-studio/src/studio.rs) and grounded answers from the
// desktop's local chat model when one is ready.
import { useEffect, useState } from "react";
import { SectionHeading } from "../layout/SectionHeading";
import { StudioHeader } from "./StudioHeader";
import { DesktopOnly, ErrorNote, fieldClass, panelClass, primaryButtonClass } from "./StudioKit";
import { isTauri } from "./tauri-bridge";
import { corpus, type CorpusHit } from "./studio-bridge";

const KINDS: Array<[string, string]> = [
  ["", "Tout"],
  ["databook", "Databooks"],
  ["manga", "Manga"],
  ["wiki", "Wiki"],
];

function HitList({ hits }: { hits: CorpusHit[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {hits.map((hit) => (
        <li key={`${hit.rowid}-${hit.url}`} className={panelClass}>
          <p className="font-semibold">
            [{hit.kind}] {hit.title}
          </p>
          <p className="text-os/75">{hit.snippet}</p>
          <p className="break-all text-[14px] text-os/60 tabular-nums">
            {hit.url} · score {hit.score.toFixed(2)}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function DatabooksStudio() {
  const [documents, setDocuments] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("databook");
  const [hits, setHits] = useState<CorpusHit[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ text: string; model?: string; hits: CorpusHit[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isTauri())
      corpus.info().then(
        (info) => setDocuments(info.documents),
        (cause: unknown) => setError(String(cause)),
      );
  }, []);

  if (!isTauri()) {
    return (
      <DesktopOnly>Les databooks fonctionnent dans l’application de bureau Shenron.</DesktopOnly>
    );
  }

  const guard = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const search = () =>
    guard(async () => {
      const response = await corpus.search(query.trim(), { kind: kind || undefined, limit: 20 });
      setHits(response.results ?? []);
    });

  const ask = () =>
    guard(async () => {
      const response = await corpus.ask(question.trim());
      setAnswer({
        text: typeof response.answer === "string" ? response.answer : "(réponse vide)",
        model: typeof response.model === "string" ? response.model : undefined,
        hits: Array.isArray(response.hits) ? (response.hits as CorpusHit[]) : [],
      });
    });

  return (
    <div className="flex flex-col gap-8">
      <StudioHeader
        eyebrow="Hors ligne"
        title="Databooks & corpus"
        subtitle={documents === null ? "Chargement du corpus…" : `${documents} documents en local`}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <section className="flex flex-col gap-4">
        <SectionHeading level={3} title="Recherche" />
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim().length >= 2) void search();
          }}
        >
          <select
            aria-label="Type de document"
            className={`${fieldClass} sm:w-auto`}
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="Recherche dans le corpus"
            className={`${fieldClass} flex-1`}
            placeholder="ex. Daizenshuu Goku"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            className={primaryButtonClass}
            type="submit"
            disabled={busy || query.trim().length < 2}
          >
            Rechercher
          </button>
        </form>
        <HitList hits={hits} />
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading
          level={3}
          title="Question sourcée"
          standfirst="Réponse du modèle local à partir des passages du corpus"
        />
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim().length >= 2) void ask();
          }}
        >
          <input
            aria-label="Question"
            className={`${fieldClass} flex-1`}
            placeholder="ex. Quelle est la puissance de Freezer selon le Daizenshuu ?"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            className={primaryButtonClass}
            type="submit"
            disabled={busy || question.trim().length < 2}
          >
            Demander
          </button>
        </form>
        {answer ? (
          <div className={panelClass}>
            <p className="max-w-[72ch] whitespace-pre-wrap">{answer.text}</p>
            {answer.model ? (
              <p className="text-[14px] text-os/60">Modèle : {answer.model}</p>
            ) : null}
            <HitList hits={answer.hits} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
