"use client";

import Link from "next/link";
import { useVideoUIText } from "@/lib/video-ui-text";

/** Keep the episode accessible while no verified playback source is present. */
export function VideoUnavailableCard({ title, kind }: { title: string; kind: "episode" | "film" }) {
  const t = useVideoUIText();
  return (
    <section
      className="@container min-w-0 rounded-2xl border border-dashed border-border bg-card p-6 text-card-foreground sm:p-8"
      aria-label={t("unavailableLabel")}
    >
      <div className="flex flex-col gap-4 @lg:flex-row @lg:items-center @lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
            {t("unavailableHeading")}
          </p>
          <h2 className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">
            {t("unavailableTitle", { title })}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            {t("unavailableNote")}
          </p>
        </div>
        <Link
          href={`/wiki/contribute?type=${kind}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("contributeSource")}
        </Link>
      </div>
    </section>
  );
}
