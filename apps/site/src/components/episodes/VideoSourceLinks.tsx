"use client";

import { useTranslations } from "next-intl";
import type { EpisodeSourceLink } from "@/lib/episode-source-coverage";

/** Direct links behind the observed language coverage, split by source type. */
export function VideoSourceLinks({ links }: { links: EpisodeSourceLink[] }) {
  const t = useTranslations("mediaPlayback");
  const official = links.filter((link) => link.kind === "official");
  const external = links.filter((link) => link.kind === "external");
  if (official.length === 0 && external.length === 0) return null;

  const renderGroup = (items: EpisodeSourceLink[], title: string) => {
    if (items.length === 0) return null;
    const providers = new Map<string, EpisodeSourceLink[]>();
    for (const item of items) {
      const key = `${item.language}:${item.provider}`;
      const current = providers.get(key) ?? [];
      current.push(item);
      providers.set(key, current);
    }
    return (
      <section aria-label={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="mb-3 text-sm font-bold text-white">{title}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {[...providers.entries()].map(([key, providerItems]) => {
            const first = providerItems[0]!;
            return (
              <details key={key} className="rounded-lg border border-white/10 bg-white/[0.03]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 text-sm font-semibold text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange">
                  <span>
                    {t(first.language)} · {first.label}
                  </span>
                  <span aria-hidden className="ml-auto text-white/60">
                    ⌄
                  </span>
                </summary>
                <ul className="grid max-h-80 gap-1 overflow-y-auto border-t border-white/10 p-2">
                  {providerItems.map((item) => (
                    <li key={`${item.episodeLabel}:${item.language}:${item.provider}:${item.href}`}>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t(item.language)} · ${item.label} · ${item.episodeLabel}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2 text-sm text-white/75 underline decoration-white/25 underline-offset-4 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
                      >
                        <span className="min-w-0 truncate">{item.episodeLabel}</span>
                        <span className="shrink-0 text-xs text-white/55">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {renderGroup(official, t("watchLegally"))}
      {renderGroup(external, t("externalPlayers"))}
    </div>
  );
}
