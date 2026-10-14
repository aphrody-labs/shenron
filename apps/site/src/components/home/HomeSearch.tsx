"use client";

/** Native GET search remains usable without client navigation or JavaScript. */
import { useState, type ReactNode } from "react";
import { MaterialSymbol } from "@aphrody/shenron-ui/icones";
import { useT } from "@/components/T";

export function HomeSearch({
  className = "",
  children,
}: {
  className?: string;
  /** Optional editorial link below the search. */
  children?: ReactNode;
}) {
  const t = useT();
  const [q, setQ] = useState("");

  return (
    <div className={className}>
      <search aria-label={t("accueil.search.label")}>
        <form action="/wiki/search" method="get">
          <label htmlFor="accueil-recherche" className="sr-only">
            {t("accueil.search.label")}
          </label>
          <div className="flex min-h-14 items-stretch overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-colors focus-within:border-ring">
            <input
              id="accueil-recherche"
              name="q"
              type="search"
              required
              minLength={2}
              maxLength={200}
              autoComplete="off"
              enterKeyHint="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={t("accueil.search.placeholder")}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              type="submit"
              aria-label={t("accueil.search.submit")}
              className="grid min-h-14 w-14 shrink-0 place-items-center bg-primary text-primary-foreground transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring"
            >
              <MaterialSymbol name="search" size={22} />
            </button>
          </div>
        </form>
      </search>
      {children ? <div className="mt-2 flex flex-wrap items-center gap-x-5">{children}</div> : null}
    </div>
  );
}
