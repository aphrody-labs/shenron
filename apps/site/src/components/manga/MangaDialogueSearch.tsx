"use client";
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- reviewed: legacy patterns, behavior preserved */

import { SectionHeading } from "@aphrody/shenron-ui/layout/SectionHeading";
import Link from "next/link";
import { useT } from "@/components/T";
import { DragonBallLoader } from "@aphrody/shenron-ui/toriyama";
import { DragonRadar } from "@aphrody/shenron-ui/icones";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Search French and Japanese manga transcripts through the site's API,
 * which joins OCR coordinates to real reader links.
 */
interface Result {
  series: string;
  volume: string;
  page: number;
  lang: string;
  snippet: string;
  href?: string | null;
}

/** A row of the API: English fields, the former `tome`/`planche` as a fallback against an older bot. */
type ApiResult = Omit<Result, "volume" | "page"> &
  Partial<Pick<Result, "volume" | "page">> & { tome?: string; planche?: number };

function tomeLabel(tome: string, t: ReturnType<typeof useT>): string {
  const n = tome.replace(/\D/g, "");
  if (/^ch/i.test(tome)) return t("mangaCatalog.dialogue.chapter", { number: n });
  if (/^vol/i.test(tome)) return t("mangaCatalog.dialogue.volume", { number: n });
  if (/^t/i.test(tome)) return t("mangaCatalog.dialogue.colorVolume", { number: n });
  return tome;
}

const hasCjk = (s: string) => /[぀-ヿ㐀-鿿]/.test(s);

export function Snippet({ text }: { text: string }) {
  // Render only the API's mark tokens, keeping all other text escaped by React.
  return (
    <>
      {text.split(/(<mark>[\s\S]*?<\/mark>|\[[^\]]+\])/g).map((part, i) =>
        (part.startsWith("[") && part.endsWith("]")) ||
        (part.startsWith("<mark>") && part.endsWith("</mark>")) ? (
          // oxlint-disable-next-line no-array-index-key
          <mark key={i} className="rounded bg-dbz-orange/25 px-1 text-dbz-orange">
            {part.startsWith("<mark>") ? part.slice(6, -7) : part.slice(1, -1)}
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
  const t = useT();
  const inputId = useId();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const run = useCallback(async (query: string) => {
    pending.current?.abort();
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(false);
    const controller = new AbortController();
    pending.current = controller;
    try {
      const res = await fetch(`/api/manga/search?q=${encodeURIComponent(query.trim())}&limit=24`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { results?: ApiResult[] };
      if (controller.signal.aborted) return;
      setResults(
        (data.results ?? []).map((r) =>
          Object.assign(r, { volume: r.volume ?? r.tome ?? "", page: r.page ?? r.planche ?? 0 }),
        ),
      );
    } catch {
      if (controller.signal.aborted) return;
      setError(true);
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  return (
    <section className="my-10" aria-label={t("mangaCatalog.dialogue.title")}>
      <SectionHeading
        id={`${inputId}-title`}
        level={2}
        rule={false}
        className="mb-4"
        title={t("mangaCatalog.dialogue.title")}
        standfirst={<>{t("mangaCatalog.dialogue.description")}</>}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
      >
        <div className="relative min-w-0 flex-1">
          <DragonRadar
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("mangaCatalog.dialogue.placeholder")}
            aria-label={t("mangaCatalog.dialogue.placeholder")}
            className="h-11 min-w-0 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 text-base text-white placeholder:text-white/50 focus:border-dbz-orange focus:outline-none sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || q.trim().length < 2}
          aria-label={t("mangaCatalog.dialogue.submit")}
          aria-busy={loading}
          className="flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl bg-dbz-orange px-5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 sm:w-auto"
        >
          {loading ? (
            <DragonBallLoader size={18} stars={4} decorative />
          ) : (
            t("mangaCatalog.dialogue.submit")
          )}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {t("mangaCatalog.dialogue.error")}
        </p>
      )}
      {results && !loading && results.length === 0 && !error && (
        <p role="status" className="mt-4 text-sm text-white/50">
          {t("mangaCatalog.dialogue.empty", { query: q })}
        </p>
      )}

      {results && results.length > 0 && (
        <ul aria-live="polite" aria-busy={loading} className="mt-6 grid gap-3 sm:grid-cols-2">
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
                  {tomeLabel(r.volume, t)}, <span className="tabular-nums">{r.page}</span>
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
              {r.href && (
                <Link
                  href={r.href}
                  className="mt-2 inline-flex min-h-11 items-center font-semibold text-dbz-orange hover:text-white"
                >
                  {t("mangaCatalog.dialogue.read")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
