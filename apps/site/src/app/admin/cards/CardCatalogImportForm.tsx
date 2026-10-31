"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { importCardCatalogBatch, type CardCatalogImportState } from "./_import-actions";
import { CARD_IMPORT_MAX_ROWS } from "./import-limits";

const initialState: CardCatalogImportState = {
  status: "idle",
  total: 0,
  ready: 0,
  existing: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  issues: [],
};

export function CardCatalogImportForm() {
  const t = useTranslations("adminCardCatalog");
  const [state, formAction, pending] = useActionState(importCardCatalogBatch, initialState);

  return (
    <section
      aria-labelledby="card-import-title"
      className="space-y-4 rounded-xl border border-border p-5"
    >
      <div className="space-y-2">
        <h2 id="card-import-title" className="text-xl font-semibold">
          {t("importTitle")}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("importDescription", { max: CARD_IMPORT_MAX_ROWS })}
        </p>
        <details className="max-w-3xl text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium">{t("importFormat")}</summary>
          <p className="mt-2 leading-6">{t("importFields")}</p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 text-xs">
            {t("importExample")}
          </pre>
        </details>
      </div>
      <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          name="file"
          type="file"
          accept="application/json,.json"
          required
          aria-label={t("importFile")}
          className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span>{t("importDuplicates")}</span>
            <select
              name="duplicateStrategy"
              defaultValue="skip"
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              <option value="skip">{t("importSkip")}</option>
              <option value="update">{t("importUpdate")}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="confirmCommit" value="yes" />
            <span>{t("importConfirm")}</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button
            type="submit"
            name="intent"
            value="preview"
            disabled={pending}
            className="min-h-11 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-60"
          >
            {t("importPreview")}
          </button>
          <button
            type="submit"
            name="intent"
            value="commit"
            disabled={pending}
            className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {pending ? t("importWorking") : t("importCommit")}
          </button>
        </div>
      </form>
      {state.status !== "idle" && (
        <div aria-live="polite" className="space-y-2 rounded-md bg-muted/40 p-4 text-sm">
          <p className="font-semibold">{t(`importResult.${state.status}`)}</p>
          <p>
            {t("importCounts", {
              total: state.total,
              ready: state.ready,
              existing: state.existing,
              created: state.created,
              updated: state.updated,
              skipped: state.skipped,
              failed: state.failed,
            })}
          </p>
          {state.issues.length > 0 && (
            <ul className="list-inside list-disc space-y-1">
              {state.issues.map((issue) => (
                <li key={`${issue.row}-${issue.code}`}>
                  {issue.row > 0 ? t("importIssueRow", { row: issue.row }) : t("importIssueFile")} —{" "}
                  {t(`importIssue.${issue.code}`, { max: CARD_IMPORT_MAX_ROWS })}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
