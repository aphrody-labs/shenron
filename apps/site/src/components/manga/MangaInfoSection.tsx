"use client";
import Link from "next/link";
import { ExternalLink } from "@aphrody/shenron-ui/external";
import { JAPANESE_FULL_COLOR_CATALOGUE } from "@aphrody/shenron-config/manga-catalogue";
import { useMangaUIText } from "@/lib/manga-ui-text";
import { useT } from "@/components/T";

const GROUPS = [
  {
    title: "guide.publishers",
    rows: [
      { label: "guide.glenat", text: "guide.glenatText", href: "https://www.glenat.com/manga" },
      { label: "guide.shueisha", text: "guide.shueishaText", href: "https://www.shueisha.co.jp" },
    ],
  },
  {
    title: "guide.digital",
    rows: [
      {
        label: "guide.mangaPlus",
        text: "guide.mangaPlusText",
        href: "https://mangaplus.shueisha.co.jp",
      },
      { label: "guide.izneo", text: "guide.izneoText", href: "https://www.izneo.com" },
    ],
  },
  {
    title: "guide.formats",
    rows: [
      { label: "guide.tankobon", text: "guide.tankobonText" },
      { label: "guide.kanzenban", text: "guide.kanzenbanText" },
      { label: "guide.fullColor", text: "guide.fullColorText" },
    ],
  },
] as const;

export function MangaInfoSection() {
  const ui = useMangaUIText();
  const t = useT();
  return (
    <section className="@container mt-6 space-y-4" aria-label={ui("guide.title")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="manga-editions-title" className="font-display text-xl font-bold text-foreground">
          {ui("guide.title")}
        </h2>
        <nav className="flex flex-wrap gap-4">
          <Link
            href="/sources/dragon-ball"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
          >
            {ui("guide.sources")}
          </Link>
          <Link
            href="/wiki/manga/interviews"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
          >
            {ui("guide.interviews")}
          </Link>
        </nav>
      </header>
      <div className="grid gap-3 @3xl:grid-cols-3">
        {GROUPS.map((group) => (
          <section key={group.title} className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-display text-base font-bold text-foreground">{ui(group.title)}</h3>
            <ul className="mt-3 space-y-3">
              {group.rows.map((row) => (
                <li key={row.label} className="border-t border-border pt-3">
                  <h4 className="text-sm font-semibold text-foreground">{ui(row.label)}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {ui(row.text)}
                  </p>
                  {"href" in row && (
                    <ExternalLink
                      href={row.href}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                    >
                      {ui("guide.open")} ↗
                    </ExternalLink>
                  )}
                  {row.label === "guide.fullColor" && (
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      {t(
                        "mangaCatalog.japaneseOriginalCatalogueStatus",
                        JAPANESE_FULL_COLOR_CATALOGUE,
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
