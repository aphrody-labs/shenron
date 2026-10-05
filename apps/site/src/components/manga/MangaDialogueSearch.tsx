"use client";

import { SectionHeading } from "@shenron/ui/layout/SectionHeading";
import { apiUrl } from "@/lib/config";
import { DragonBallLoader } from "@shenron/ui/toriyama";
import { DragonRadar } from "@shenron/ui/icones";
import { useCallback, useId, useState } from "react";

/**
 * Recherche plein-texte dans les DIALOGUES du manga (transcriptions OCR auto,
 * bilingue FR + JP). Îlot client : appelle l'API publique du bot
 * `/api/public/manga/search` (CORS ouvert) → ne casse pas le cache CDN de la page.
 */
interface Result {
  series: string;
  volume: string;
  page: number;
  lang: string;
  snippet: string;
}

/** Ligne de l'API : champs anglais, anciens `tome`/`planche` en repli d'un bot plus ancien. */
type ApiResult = Omit<Result, "volume" | "page"> &
  Partial<Pick<Result, "volume" | "page">> & { tome?: string; planche?: number };

function tomeLabel(tome: string): string {
  const n = tome.replace(/\D/g, "");
  if (/^ch/i.test(tome)) return `Chapitre ${n}`;
  if (/^vol/i.test(tome)) return `Tome ${n}`;
  if (/^t/i.test(tome)) return `Tome couleur ${n}`;
  return tome;
}

const hasCjk = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

function Snippet({ text }: { text: string }) {
  // L'API entoure le terme trouvé de crochets → on le surligne.
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, i) =>
        part.startsWith("[") && part.endsWith("]") ? (
          // oxlint-disable-next-line no-array-index-key
          <mark key={i} className="rounded bg-dbz-orange/25 px-1 text-dbz-orange">
            {part.slice(1, -1)}
          </mark>
        ) : (
          // oxlint-disable-next-line no-array-index-key
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function MangaDialogueSearch() {
  const inputId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        apiUrl(`api/public/manga/search?q=${encodeURIComponent(query.trim())}&limit=24`),
      );
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results?: ApiResult[] };
      setResults(
        (data.results ?? []).map((r) =>
          Object.assign(r, { volume: r.volume ?? r.tome ?? "", page: r.page ?? r.planche ?? 0 }),
        ),
      );
    } catch {
      setError(true);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <section className="my-10" aria-label="Recherche de répliques">
      <SectionHeading
        id={`${inputId}-title`}
        level={2}
        rule={false}
        className="mb-4"
        title="Cherche une réplique"
        standfirst={
          <>
            Retrouve n’importe quelle ligne de dialogue du manga (transcriptions française et
            japonaise). Ex. <em>Kamehameha</em>, <em>Petit cœur</em>, <em>悟空</em>.
          </>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
        role="search"
      >
        <div className="relative flex-1">
          <DragonRadar
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un dialogue…"
            aria-label="Rechercher un dialogue du manga"
            className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 text-base text-white placeholder:text-white/50 focus:border-dbz-orange focus:outline-none sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || q.trim().length < 2}
          aria-label="Chercher"
          aria-busy={loading}
          className="min-h-11 rounded-xl bg-dbz-orange px-5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <DragonBallLoader size={18} stars={4} decorative /> : "Chercher"}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-400">Recherche momentanément indisponible. Réessaie.</p>
      )}
      {results && !loading && results.length === 0 && !error && (
        <p className="mt-4 text-sm text-white/50">Aucune réplique trouvée pour « {q} ».</p>
      )}

      {results && results.length > 0 && (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {results.map((r, i) => (
            <li
              // oxlint-disable-next-line no-array-index-key
              key={`${r.series}-${r.volume}-${r.page}-${i}`}
              className="rounded-lg border border-white/5 bg-black/30 p-4 transition-colors hover:border-white/20"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-dbz-orange/20 px-2 py-0.5 font-bold text-dbz-orange">
                  {r.series}
                </span>
                <span className="text-white/60">
                  {tomeLabel(r.volume)}, planche <span className="tabular-nums">{r.page}</span>
                </span>
                {hasCjk(r.snippet) && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/70">
                    JP
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-white/80">
                <Snippet text={r.snippet} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
