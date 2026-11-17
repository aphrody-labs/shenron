"use client";
// SPDX-License-Identifier: Apache-2.0
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import Link from "next/link";
import { Chargement } from "@aphrody/shenron-ui/icones";
import { CONTRIBUTABLE_COLUMNS, type ContributionStatusKey } from "@/lib/contributions-shared";
import { useMe } from "@/lib/use-me";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";

interface Proposal {
  id: string;
  createdAt: string;
  columnName: string;
  entityLabel: string | null;
  entityPath: string | null;
  status: ContributionStatusKey;
  reviewNote: string | null;
}
const STATUS_TONE: Record<ContributionStatusKey, string> = {
  pending: "border-dbz-border text-os/80",
  accepted: "border-dbz-cyan/40 text-dbz-cyan",
  rejected: "border-dbz-red/40 text-dbz-red",
  superseded: "border-dbz-yellow/40 text-dbz-yellow",
  withdrawn: "border-dbz-border text-os/75",
};

export function MesContributions() {
  const me = useMe();
  const t = useWikiEditorialText();
  if (me?.authenticated) return <MyProposals key={me.username} />;
  return (
    <section className="mt-12 space-y-3 rounded-xl border border-dbz-border bg-dbz-card p-5">
      <h2 className="font-saiyan text-2xl text-os">{t("mine.title")}</h2>
      {me === undefined ? (
        <output className="text-sm text-os/75">{t("mine.loading")}</output>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-os/75">{t("mine.signinHint")}</p>
          <Link
            href="/signin?callbackURL=%2Fwiki%2Fcontribute%23my-contributions"
            className="btn btn-primary inline-flex min-h-11 items-center"
          >
            {t("mine.signin")}
          </Link>
        </>
      )}
    </section>
  );
}

/** Private proposals have a mount-scoped cache and are removed on unmount. */
function MyProposals() {
  const t = useWikiEditorialText();
  const scopeId = useId();
  const [offset, setOffset] = useState(0);
  const pageSize = 20;
  const query = useQuery({
    queryKey: ["my-wiki-contributions", scopeId, offset],
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/wiki/contributions?limit=${pageSize}&offset=${offset}`, {
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error(`contributions_${response.status}`);
      return response.json() as Promise<{ rows: Proposal[]; total: number }>;
    },
  });
  return (
    <section className="mt-12 min-w-0 space-y-4" aria-labelledby={`${scopeId}-title`}>
      <header>
        <h2 id={`${scopeId}-title`} className="font-saiyan text-2xl text-os">
          {t("mine.title")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-os/75">{t("mine.intro")}</p>
      </header>
      {query.isPending ? (
        <output className="flex items-center gap-2 text-sm text-os/75">
          <Chargement aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {t("mine.loading")}
        </output>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-dbz-border bg-dbz-card p-4 text-sm text-os/85"
        >
          <p>{t("mine.failed")}</p>
          <button
            type="button"
            className="btn btn-ghost mt-3 min-h-11"
            onClick={() => void query.refetch()}
          >
            {t("queue.retry")}
          </button>
        </div>
      ) : (
        <>
          {query.data.rows.length === 0 ? (
            <p className="text-sm leading-relaxed text-os/75">{t("mine.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {query.data.rows.map((proposal) => (
                <li
                  key={proposal.id}
                  className="min-w-0 rounded-xl border border-dbz-border bg-dbz-card p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      {proposal.entityPath ? (
                        <Link
                          href={proposal.entityPath}
                          className="inline-flex min-h-11 items-center break-words font-semibold text-os hover:text-dbz-yellow"
                        >
                          {proposal.entityLabel ?? t("mine.entry")}
                        </Link>
                      ) : (
                        <span className="font-semibold text-os">
                          {proposal.entityLabel ?? t("mine.entry")}
                        </span>
                      )}
                      <p className="text-os/75">
                        {Object.hasOwn(CONTRIBUTABLE_COLUMNS, proposal.columnName)
                          ? t(`field.${proposal.columnName}`)
                          : proposal.columnName}
                      </p>
                    </div>
                    <span
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${STATUS_TONE[proposal.status]}`}
                    >
                      {t(`status.${proposal.status}`)}
                    </span>
                  </div>
                  {proposal.reviewNote && (
                    <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed text-os/80">
                      <strong>{t("mine.response")} : </strong>
                      {proposal.reviewNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(offset > 0 || query.data.total > pageSize) && (
            <nav
              className="flex flex-wrap items-center justify-between gap-3"
              aria-label={t("queue.pagination")}
            >
              <button
                type="button"
                disabled={offset === 0}
                className="btn btn-ghost min-h-11"
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                {t("mine.previous")}
              </button>
              <span className="text-sm text-os/75">
                {t("mine.page", { page: offset / pageSize + 1 })}
              </span>
              <button
                type="button"
                disabled={offset + pageSize >= query.data.total}
                className="btn btn-ghost min-h-11"
                onClick={() => setOffset(offset + pageSize)}
              >
                {t("mine.next")}
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
