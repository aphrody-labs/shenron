"use client";

/**
 * Studio d'édition visuelle d'une entité wiki (`db_*`) : formulaire à gauche
 * (champs typés + upload d'images drag-and-drop), aperçu live de la page publique
 * à droite. Charge la ligne via `/api/wiki-admin/:table/:id`, enregistre via le
 * même CRUD (Neon). `id === "new"` → création.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alerte,
  CocheCercle,
  Croix,
  Enregistrer,
  FlecheGauche,
  Historique,
  LienExterne,
  Oeil,
} from "@aphrody/shenron-ui/icones";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWikiAdminText as useT } from "@/lib/wiki-admin-text";
import { RelationsPanel } from "@/components/admin/RelationsPanel";
import { SmartField } from "@/components/admin/SmartField";
import { WikiEntityPreview } from "@/components/admin/WikiEntityPreview";
import { WikiHistory } from "@/components/admin/WikiHistory";
import { WikiSectionsPanel } from "@/components/admin/WikiSectionsPanel";
import { WikiAiAssistant } from "@/components/admin/WikiAiAssistant";
import { DatabookPagesPanel } from "@/components/admin/DatabookPagesPanel";
import { GameMediaPanel } from "@/components/admin/GameMediaPanel";
import { CharacterStatsPanel } from "@/components/admin/CharacterStatsPanel";
import { TransformationsPanel } from "@/components/admin/TransformationsPanel";
import { apiAt } from "@/lib/admin-api";
import { entityRelations, isStudioTable } from "@/lib/wiki-fields";
import { prepareStudioSubmission, sameStudioDraft, toStudioDraft } from "@/lib/wiki-studio-draft";
import { publicEntityUrl, sectionEntityType } from "@/lib/wiki-entity-model";
import { crudBase, WIKI_TABLE_SPECS } from "@/lib/wiki-tables";

/** jsonb gérés par un panneau dédié — pas de champ SmartField (sinon corruption string). */
const JSONB_PANEL_COLS = /^(pages|media|stats|links|articleSources|frames|players|subtitles)$/;

interface Props {
  table: string;
  id: string;
}

type Row = Record<string, unknown>;

export function WikiStudio({ table, id }: Props) {
  return <WikiStudioSession key={JSON.stringify([table, id])} table={table} id={id} />;
}

function WikiStudioSession({ table, id }: Props) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const spec = WIKI_TABLE_SPECS[table];
  const client = useMemo(() => apiAt(crudBase(table)), [table]);
  const mode: "create" | "edit" = id === "new" ? "create" : "edit";
  // `spec` est une constante de module → `mutableColumns` a une identité stable.
  // On exclut les jsonb gérés par un panneau dédié (pages databook, media jeux…).
  const cols = useMemo(
    () => (spec?.mutableColumns ?? []).filter((c) => !JSONB_PANEL_COLS.test(c)),
    [spec],
  );

  const [draft, setDraft] = useState<Record<string, string>>(() => toStudioDraft(cols, null));
  const uploads = useRef(new Set<string>());
  const [uploading, setUploading] = useState(false);
  const uploadState = (column: string, busy: boolean) => {
    if (busy) uploads.current.add(column);
    else uploads.current.delete(column);
    setUploading(uploads.current.size > 0);
  };
  const [toast, setToast] = useState<{ type: "success" | "error"; messageKey: string } | null>(
    null,
  );

  useEffect(() => {
    if (!toast || toast.type === "error") return;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Chargement de la ligne (édition). Pas de refetch en arrière-plan : le
  // formulaire est l'état maître une fois hydraté (sinon un refetch focus/save
  // écraserait les saisies en cours).
  const rowQuery = useQuery({
    queryKey: ["wiki-studio", table, id],
    queryFn: () => client.get<Row>(`/${table}/${encodeURIComponent(id)}`),
    enabled: mode === "edit" && !!spec,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Hydrate le brouillon UNE fois par id (au premier chargement de la ligne) :
  // ne ré-écrase jamais les saisies en cours sur un nouveau référent de données.
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    if (mode === "edit" && rowQuery.data && hydratedId.current !== id) {
      setDraft(toStudioDraft(cols, rowQuery.data));
      hydratedId.current = id;
    }
  }, [rowQuery.data, cols, mode, id]);

  const row = mode === "edit" ? (rowQuery.data ?? null) : null;
  const dirty = !sameStudioDraft(draft, toStudioDraft(cols, row), cols);
  useEffect(() => {
    if (!dirty) return;
    const preventExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventExit);
    return () => window.removeEventListener("beforeunload", preventExit);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async (submitted: { draft: Record<string, string>; row: Row | null }) => {
      const body = await prepareStudioSubmission(submitted.draft, submitted.row, cols, mode);
      if (mode === "create") return client.post<{ ok: boolean; row?: Row }>(`/${table}`, body);
      return client.put<{ ok: boolean; row?: Row }>(`/${table}/${encodeURIComponent(id)}`, body);
    },
    onSuccess: (res, submitted) => {
      qc.invalidateQueries({ queryKey: ["db", table] });
      setToast({ type: "success", messageKey: "adminWiki.studio.saved" });
      const savedRow = res?.row;
      const newId = savedRow?.[spec?.pk as string];
      // Met le cache à jour SANS refetch (qui écraserait le brouillon).
      if (savedRow != null && newId != null) {
        qc.setQueryData(["wiki-studio", table, String(newId)], savedRow);
        setDraft((current) =>
          sameStudioDraft(current, submitted.draft, cols) ? toStudioDraft(cols, savedRow) : current,
        );
      }
      // Création → bascule sur l'URL d'édition de la nouvelle entrée.
      if (mode === "create" && newId != null)
        router.replace(`/admin/wiki/studio/${table}/${encodeURIComponent(String(newId))}`);
    },
    onError: () => setToast({ type: "error", messageKey: "canonEditorSync.saveFailed" }),
  });
  const submitDraft = () => {
    if (!save.isPending && uploads.current.size === 0) save.mutate({ draft: { ...draft }, row });
  };

  // Le studio ne pilote que les entités « contenu » à pk simple (cf. STUDIO_TABLES) ;
  // les tables utilitaires / à pk composite restent sur l'éditeur générique.
  if (!spec || !isStudioTable(table)) {
    return (
      <div className="card py-12 text-center">
        <p className="mb-1 font-saiyan uppercase text-dbz-orange">
          {t("adminWiki.studio.unsupportedTitle")}
        </p>
        <p className="text-sm text-white/50">
          {t("adminWiki.studio.unsupportedBody", { table })}{" "}
          <a href={`/admin/database/${table}`} className="text-dbz-orange hover:underline">
            {t("adminWiki.studio.classicEditor")}
          </a>
        </p>
      </div>
    );
  }

  const humanTable = t(`adminWiki.tables.${table}`) || table;
  const title = (draft.name ?? draft.title ?? "").trim();
  const publicUrl = mode === "edit" ? publicEntityUrl(table, { id, slug: draft.slug }) : null;
  // En édition, on ne peut enregistrer qu'une fois la ligne chargée (sinon le
  // body serait vide → écrasement potentiel par valeurs vides).
  const notReady = mode === "edit" && !rowQuery.data;
  const hasRelations = entityRelations(table).length > 0;
  const secType = sectionEntityType(table);

  return (
    <div className="min-w-0 space-y-4">
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border-green-500/50 bg-dbz-card text-green-300"
              : "border-red-500/50 bg-dbz-card text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CocheCercle className="h-4 w-4 shrink-0" />
          ) : (
            <Alerte className="h-4 w-4 shrink-0" />
          )}
          {t(toast.messageKey)}
          <button
            type="button"
            className="btn btn-ghost ml-auto"
            onClick={() => setToast(null)}
            aria-label={t("common.close")}
          >
            <Croix className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {/* En-tête */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-dbz-border bg-dbz-bg p-3">
        <button
          type="button"
          onClick={() =>
            typeof window !== "undefined" && window.history.length > 1
              ? router.back()
              : router.push(`/admin/database/${table}`)
          }
          className="btn btn-ghost"
        >
          <FlecheGauche className="h-4 w-4" />
          <span className="sr-only">{t("adminWiki.studio.backToList")}</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-saiyan text-xl uppercase text-dbz-orange">
            {mode === "create"
              ? t("adminWiki.studio.createTitle", { table: humanTable })
              : title || humanTable}
          </h2>
          <code className="font-mono text-[10px] text-white/25">
            {table}
            {mode === "edit" ? ` · ${spec.pk} = ${id}` : ""}
          </code>
        </div>
        {publicUrl && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
            <LienExterne className="h-3.5 w-3.5" />
            {t("adminWiki.studio.publicPage")}
          </a>
        )}
        <button
          type="button"
          onClick={submitDraft}
          disabled={save.isPending || notReady || uploading}
          className="btn btn-primary"
        >
          <Enregistrer className="h-4 w-4" />
          {save.isPending ? t("common.loading") : t("common.save")}
        </button>
      </div>

      {mode === "edit" && rowQuery.isLoading ? (
        <output className="card flex h-96 items-center justify-center" aria-busy="true">
          {t("common.loading")}
        </output>
      ) : mode === "edit" && rowQuery.isError ? (
        <div className="card py-12 text-center">
          <p role="alert" className="mb-3 text-sm text-red-300">
            {t("adminBot.common.loadFailed")}
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => void rowQuery.refetch()}>
            {t("error.retry")}
          </button>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Formulaire */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!notReady) submitDraft();
            }}
            className="dbz-panel min-w-0 p-5"
            aria-busy={save.isPending || uploading}
          >
            <fieldset
              disabled={save.isPending || notReady}
              className="min-w-0 space-y-4 disabled:opacity-70"
            >
              {cols.map((c) => (
                <Field
                  key={c}
                  table={table}
                  col={c}
                  value={draft[c] ?? ""}
                  original={row?.[c]}
                  onChange={(v) => setDraft((d) => ({ ...d, [c]: v }))}
                  onUploadStateChange={(busy) => uploadState(c, busy)}
                />
              ))}
              <button
                type="submit"
                disabled={save.isPending || notReady || uploading}
                className="btn btn-primary w-full"
              >
                <Enregistrer className="h-4 w-4" />
                {save.isPending ? t("common.loading") : t("common.save")}
              </button>
            </fieldset>
          </form>

          {/* Aperçu live + relations (sticky sur grand écran) */}
          <div className="min-w-0 space-y-4">
            <div className="dbz-panel p-6">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-dbz-blue-light">
                <Oeil className="h-3.5 w-3.5" /> {t("adminDesign.previewTitle")}
              </div>
              <WikiEntityPreview table={table} draft={draft} />
            </div>
            {hasRelations &&
              (mode === "edit" ? (
                <RelationsPanel table={table} entityId={id} />
              ) : (
                <div className="dbz-panel p-5 text-xs text-white/50">
                  {t("adminWiki.studio.saveRelations")}
                </div>
              ))}
            {secType &&
              (mode === "edit" ? (
                <>
                  <WikiSectionsPanel table={table} entityId={id} entityType={secType} />
                  <WikiAiAssistant
                    entityType={secType}
                    entityId={id}
                    entityName={String(
                      (draft as Record<string, unknown>)?.name ??
                        (draft as Record<string, unknown>)?.title ??
                        "",
                    )}
                  />
                </>
              ) : (
                <div className="dbz-panel p-5 text-xs text-white/50">
                  {t("adminWiki.studio.saveSections")}
                </div>
              ))}
            {mode === "edit" && (
              <details className="dbz-panel p-5">
                <summary className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-dbz-blue-light">
                  <Historique className="h-3.5 w-3.5" /> {t("admin.pages.wikiHistory.title")}
                </summary>
                <div className="mt-4">
                  <WikiHistory table={table} rowId={id} compact />
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Pages du lecteur databook — panneau dédié (jsonb `pages`). */}
      {!notReady &&
        table === "db_databooks" &&
        (mode === "edit" ? (
          <div className="mt-2">
            <DatabookPagesPanel databookId={id} />
          </div>
        ) : (
          <div className="dbz-panel mt-2 p-5 text-xs text-white/50">
            {t("adminWiki.studio.savePages")}
          </div>
        ))}

      {/* Galerie médias jeu (images + YouTube) — panneau dédié (jsonb `media`). */}
      {!notReady &&
        table === "db_games" &&
        (mode === "edit" ? (
          <div className="mt-2">
            <GameMediaPanel gameId={id} />
          </div>
        ) : (
          <div className="dbz-panel mt-2 p-5 text-xs text-white/50">
            {t("adminWiki.studio.saveGameMedia")}
          </div>
        ))}

      {/* Stats scouter + transformations d'un personnage. */}
      {!notReady &&
        table === "db_characters" &&
        (mode === "edit" ? (
          <div className="mt-2 space-y-4">
            <CharacterStatsPanel characterId={id} />
            <TransformationsPanel characterId={id} />
          </div>
        ) : (
          <div className="dbz-panel mt-2 p-5 text-xs text-white/50">
            {t("adminWiki.studio.saveCharacterStats")}
          </div>
        ))}
    </div>
  );
}

/** Un champ du formulaire (label + contrôle human-first via SmartField). */
function Field({
  table,
  col,
  value,
  original,
  onChange,
  onUploadStateChange,
}: {
  table: string;
  col: string;
  value: string;
  original?: unknown;
  onChange: (v: string) => void;
  onUploadStateChange?: (uploading: boolean) => void;
}) {
  const t = useT();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dbz-blue-light">
        {t(`adminWiki.fields.${col}`)}
        <span className="ml-2 font-mono font-normal normal-case text-white/25">{col}</span>
      </legend>
      <SmartField
        table={table}
        col={col}
        value={value}
        original={original}
        onChange={onChange}
        onUploadStateChange={onUploadStateChange}
      />
    </fieldset>
  );
}
