"use client";
// SPDX-License-Identifier: Apache-2.0
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { apiAt, ApiError } from "@/lib/admin-api";
import { cardImageHistoryPlan, type CardHistoryRevision } from "@/lib/card-image-history";
import { useWikiEditorialText } from "@/lib/wiki-editorial-text";
import { useLangue } from "@/lib/i18n/client";
import type { CardImageRestoreRequest } from "@/lib/card-image-contract";

const client = apiAt("/api/admin/cards/images");

/** Existing history confirmation, specialized to one verified image restoration. */
export function CardImageHistoryRestore({ revision, onCancel, onRestored }: {
  revision: CardHistoryRevision;
  onCancel: () => void;
  onRestored: (cacheInvalidated: boolean) => void;
}) {
  const t = useWikiEditorialText();
  const { locale } = useLangue();
  const [needsPreview, setNeedsPreview] = useState(false);
  const preview = useQuery({
    queryKey: ["card-image-history-preview", revision.id, locale],
    queryFn: async () => cardImageHistoryPlan(await client.post("", { intent: "restore-preview", lang: locale, items: [{ revisionId: revision.id }] }), revision, locale),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const commit = useMutation({
    mutationFn: async (plan: CardImageRestoreRequest) => {
      const result = await client.post<{ schema: string; intent: string; restored: number; items: { id: string; restoredRevisionId: string; revisionId: string }[]; cacheInvalidated?: boolean }>("", plan);
      if (result?.schema !== "shenron-card-image-restore/v1" || result.intent !== "restore-commit" || result.restored !== 1 || result.items?.length !== 1 || result.items[0]?.id !== revision.rowId || result.items[0].restoredRevisionId !== revision.id || !result.items[0].revisionId) throw new ApiError(503, "restore_response_invalid");
      return result;
    },
    retry: false,
    onSuccess: result => onRestored(result.cacheInvalidated !== false),
    onError: () => setNeedsPreview(true),
  });
  const error = commit.error ?? preview.error;
  const errorKey = error instanceof ApiError && error.status === 403 ? "forbidden" : error instanceof ApiError && error.status === 409 ? "conflict" : "failed";
  const ready = !!preview.data && !preview.isFetching && !preview.isError && !needsPreview && !commit.isPending;
  const reload = async () => {
    commit.reset();
    const result = await preview.refetch();
    if (!result.isError) setNeedsPreview(false);
  };
  return (
    <div className="border-t border-dbz-border bg-dbz-bg/40 p-3" aria-busy={preview.isFetching || commit.isPending}>
      <p className="mb-2 text-xs text-dbz-text-muted">{t("historyRestore.confirmation")}</p>
      {revision.before?.frontImageUrl === null && <p className="mb-2 text-xs text-dbz-text-muted">{t("historyRestore.removeImage")}</p>}
      {preview.isFetching && <p role="status" className="mb-2 text-xs text-dbz-text-muted">{t("historyRestore.checking")}</p>}
      {ready && <p role="status" className="mb-2 text-xs text-dbz-text-muted">{t("historyRestore.ready")}</p>}
      {error && <p role="alert" className="mb-2 text-xs text-dbz-text-muted">{t(`historyRestore.${errorKey}`)}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={commit.isPending} className="btn btn-ghost h-8 text-xs">{t("historyRestore.cancel")}</button>
        {(preview.isError || needsPreview) && <button type="button" onClick={() => void reload()} disabled={preview.isFetching || commit.isPending} className="btn btn-ghost h-8 text-xs">{t("historyRestore.retry")}</button>}
        <button type="button" onClick={() => { if (ready && preview.data) commit.mutate(preview.data); }} disabled={!ready} className="btn btn-primary min-h-8 text-xs">
          <Undo2 aria-hidden="true" className="h-3 w-3" />
          {commit.isPending ? t("historyRestore.working") : t("historyRestore.confirm")}
        </button>
      </div>
    </div>
  );
}
