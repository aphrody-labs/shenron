import Link from "next/link";
import { Bibliotheque, Livre } from "@aphrody/shenron-ui/icones";
import type { ReactNode } from "react";
import { T } from "@/components/T";

export interface CoverageMetric {
  label: ReactNode;
  availableHref: string;
  missingHref?: string;
  available: number | null;
  total: number | null;
  unit: ReactNode;
  badge?: ReactNode;
  referenceOnly?: boolean;
}

function Metric({ metric }: { metric: CoverageMetric }) {
  const known = metric.available !== null && metric.total !== null;
  const missing = known ? Math.max(0, metric.total! - metric.available!) : null;
  const complete = !metric.referenceOnly && known && metric.total! > 0 && missing === 0;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-scouter text-[10px] uppercase tracking-[0.18em] text-white/45">
            {metric.label}
          </p>
          <p className="mt-2 font-display text-2xl font-bold text-white tabular-nums">
            {metric.available === null ? (
              <T k="corpusStats.unavailable" />
            ) : (
              metric.available.toLocaleString("fr-FR")
            )}{" "}
            {!metric.referenceOnly && metric.total !== null && metric.total > 0 && (
              <span className="text-base font-normal text-white/45">
                / {metric.total.toLocaleString("fr-FR")}
              </span>
            )}
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 font-scouter text-[10px] uppercase tracking-wider ${
            complete
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
              : "border-dbz-orange/30 bg-dbz-orange/10 text-dbz-orange"
          }`}
        >
          {metric.badge ? (
            metric.badge
          ) : missing === null ? (
            <T k="corpusStats.unavailable" />
          ) : complete ? (
            "Complet"
          ) : (
            `${missing} à compléter`
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        {metric.unit}
        {metric.referenceOnly ? (
          <>
            {" "}
            <T k="corpusStats.recordScope" />
          </>
        ) : (
          " avec du contenu réellement consultable."
        )}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={metric.availableHref}
          className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 font-display text-xs font-semibold text-white/80 transition-colors hover:border-dbz-orange/60 hover:text-dbz-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60"
        >
          Voir les disponibles →
        </Link>
        {missing !== null && missing > 0 && metric.missingHref && (
          <Link
            href={metric.missingHref}
            className="inline-flex min-h-11 items-center rounded-full border border-dbz-orange/30 px-4 font-display text-xs font-semibold text-dbz-orange transition-colors hover:border-dbz-orange hover:bg-dbz-orange/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dbz-orange/60"
          >
            À compléter →
          </Link>
        )}
      </div>
    </div>
  );
}

export function ContentCoverage({
  databooks,
  manga,
  canon,
  rag,
}: {
  databooks: CoverageMetric;
  manga: CoverageMetric;
  canon?: CoverageMetric;
  rag?: CoverageMetric;
}) {
  return (
    <section aria-labelledby="wiki-coverage-title" className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <Livre className="h-5 w-5 text-dbz-orange" aria-hidden="true" />
          <h2 id="wiki-coverage-title" className="font-saiyan text-2xl tracking-widest text-white">
            État du contenu &amp; Corpus DBFR
          </h2>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          <T k="corpusStats.scope" />
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric metric={databooks} />
        <div>
          <Metric metric={manga} />
          <div className="mt-2 flex items-center gap-2 text-[11px] text-white/35">
            <Bibliotheque className="h-3.5 w-3.5" aria-hidden="true" />
            Un tome compte dès qu&apos;une de ses éditions est lisible.
          </div>
        </div>
        {canon && <Metric metric={canon} />}
        {rag && <Metric metric={rag} />}
      </div>
    </section>
  );
}
