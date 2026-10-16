// SPDX-License-Identifier: Apache-2.0
"use client";
import { useLangue } from "@/lib/i18n/client";
import { useT } from "@/components/T";
import type { PublicCorpusStats as CorpusCounts } from "@/lib/public-corpus-stats";

const canonMetrics = ["ragChunks", "canonReferences", "databookPages", "mangaPages"] as const;
const allMetrics = [
  ...canonMetrics,
  "mangaVolumes",
  "mangaChapters",
  "episodes",
  "characters",
] as const;

export function PublicCorpusStats({
  counts,
  compact = false,
}: {
  counts: CorpusCounts;
  compact?: boolean;
}) {
  const t = useT();
  const { locale } = useLangue();
  const formatter = new Intl.NumberFormat(locale);
  return (
    <section className="my-6 space-y-3" data-testid="public-corpus-stats">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(compact ? canonMetrics : allMetrics).map((key) => (
          <div key={key} className="rounded-xl border border-dbz-border bg-dbz-card p-3.5">
            <p className="text-xs text-dbz-os/70">{t(`corpusStats.metrics.${key}`)}</p>
            <p
              className="mt-2 text-xl font-semibold tabular-nums text-dbz-os"
              data-corpus-metric={key}
            >
              {counts[key] === null ? t("corpusStats.unavailable") : formatter.format(counts[key])}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-dbz-os/65">{t("corpusStats.scope")}</p>
    </section>
  );
}
