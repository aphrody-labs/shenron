"use client";

/** Native GET search remains usable without client navigation or JavaScript. */
import { useState, type ReactNode } from "react";
import { Recherche } from "@aphrody/shenron-ui/icones";
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
      <form action="/wiki/search" method="get" role="search" aria-label={t("accueil.search.label")}>
        <label htmlFor="accueil-recherche" className="sr-only">
          {t("accueil.search.label")}
        </label>
        <div className="flex min-h-14 items-stretch overflow-hidden rounded-lg border border-os/20 bg-encre/40 transition-colors focus-within:border-dbz-orange">
          <span className="grid w-12 shrink-0 place-items-center text-os/70" aria-hidden>
            <Recherche className="size-5" />
          </span>
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
            className="min-w-0 flex-1 bg-transparent py-3 pr-2 text-base text-os placeholder:text-os/55 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 bg-dbz-orange px-4 text-sm font-bold text-encre transition-colors hover:bg-gi-clair focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-kinto-lumiere sm:px-6"
          >
            {t("accueil.search.submit")}
          </button>
        </div>
      </form>
      {children ? <div className="mt-2 flex flex-wrap items-center gap-x-5">{children}</div> : null}
    </div>
  );
}
