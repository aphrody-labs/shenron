/* oxlint-disable react/set-state-in-effect -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

/**
 * Édition en place pour les pages db-universe (vues server-rendered).
 * Bolt-on sur n'importe quelle table : édite/supprime une ligne ou en ajoute
 * une via l'API CRUD générique du bot (`/api/database/:table[/:id]`), puis
 * `router.refresh()` pour recharger la vue server. Les pages restent des RSC.
 */
import { LoadingText } from "@/components/LoadingText";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alerte, Corbeille, Crayon, Croix, Enregistrer, Plus } from "@aphrody/shenron-ui/icones";
import { SmartField } from "@/components/admin/SmartField";
import { api, apiAt } from "@/lib/admin-api";
import { colLabel } from "@/lib/db-labels";
import { buildSubmitBody, isStudioTable } from "@/lib/wiki-fields";
import { WIKI_TABLE_SPECS, crudBase, isWikiTable } from "@/lib/wiki-tables";
import { browserWikiSnapshotHash } from "@/lib/wiki-snapshot";
import { useAdminCatalogText } from "@/lib/admin-catalog-text";

interface TableSpec {
  name: string;
  pk: string;
  readonly: boolean;
  mutableColumns: string[];
  description: string | null;
}

type AdminWikiFieldKey =
  | "fields.variantId"
  | "fields.techniqueId"
  | "fields.transformationId"
  | "fields.sourceType"
  | "fields.sourceLabel"
  | "fields.sourceUrl"
  | "fields.note"
  | "fields.image"
  | "fields.altText"
  | "fields.sortOrder"
  | "fields.visible"
  | "fields.voiceActorId"
  | "fields.roleNotes"
  | "fields.episodeNumber"
  | "fields.sceneTitle"
  | "fields.animationSupervisor"
  | "fields.supervisorSlug"
  | "fields.keyAnimators"
  | "fields.episodeUrl"
  | "fields.episodeImage"
  | "fields.combatants"
  | "fields.combatantsHelp"
  | "fields.combatantName"
  | "fields.combatantCharacterId"
  | "fields.combatantRole"
  | "fields.combatantSide"
  | "fields.sideA"
  | "fields.sideB"
  | "fields.sideNeutral"
  | "fields.addCombatant"
  | "fields.removeCombatant"
  | "fields.techniquesUsed"
  | "fields.techniquesUsedHelp"
  | "fields.addTechnique"
  | "fields.removeTechnique";

/**
 * Client + chemin CRUD pour une table :
 *   - wiki éditoriale → `apiAt("/api/wiki-admin")` + `/:table[/:id]` (Neon direct)
 *   - sinon → `api` (proxy bot) + `/database/:table[/:id]`
 */
function useCrud(table: string) {
  const wiki = isWikiTable(table);
  const client = wiki ? apiAt(crudBase(table)) : api;
  const collection = wiki ? `/${table}` : `/database/${table}`;
  const row = (id: string | number) => `${collection}/${encodeURIComponent(String(id))}`;
  return { client, collection, row };
}

function useTableSpec(table: string): TableSpec | undefined {
  // Tables wiki : schéma statique (camelCase), aucun appel au bot.
  const wikiSpec = WIKI_TABLE_SPECS[table];
  const q = useQuery({
    queryKey: ["db", "tables"],
    queryFn: () => api.get<{ tables: TableSpec[] }>("/database/tables"),
    staleTime: 5 * 60_000,
    enabled: !wikiSpec,
  });
  if (wikiSpec) {
    return {
      name: wikiSpec.name,
      pk: Array.isArray(wikiSpec.pk) ? wikiSpec.pk.join(",") : wikiSpec.pk,
      readonly: false,
      mutableColumns: wikiSpec.mutableColumns,
      description: null,
    };
  }
  return q.data?.tables.find((t) => t.name === table);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function fireToast(type: "success" | "error", msg: string) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("dbcrud-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "dbcrud-toast";
    el.className = "fixed top-4 right-4 z-[100]";
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="rounded-lg border px-4 py-3 text-sm shadow-xl ${
    type === "success"
      ? "border-green-500/50 bg-dbz-card text-green-300"
      : "border-red-500/50 bg-dbz-card text-red-300"
  }">${msg.replace(/</g, "&lt;")}</div>`;
  if (toastTimer) clearTimeout(toastTimer);
  const node = el;
  toastTimer = setTimeout(() => {
    node.innerHTML = "";
  }, 3500);
}

// ── Bouton "Ajouter une entrée" (création) ────────────────────────────────
export function DbAddButton({ table, label = "Ajouter" }: { table: string; label?: string }) {
  const spec = useTableSpec(table);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const crud = useCrud(table);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => crud.client.post(crud.collection, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["db", table] });
      setOpen(false);
      fireToast("success", "Entrée créée.");
      router.refresh();
    },
    onError: (err: Error) => fireToast("error", `Échec : ${err.message}`),
  });

  if (!spec || spec.readonly) return null;

  // Entités « contenu » → studio visuel (form + aperçu live + upload images).
  if (isStudioTable(table)) {
    return (
      <Link
        href={`/admin/wiki/studio/${table}/new`}
        className="dbz-button inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        {label}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="dbz-button inline-flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <FieldModal
          table={table}
          mode="create"
          title="Nouvelle entrée"
          subtitle={spec.name}
          columns={spec.mutableColumns}
          initial={{}}
          saving={create.isPending}
          onClose={() => setOpen(false)}
          onSave={(body) => create.mutate(body)}
        />
      )}
    </>
  );
}

// ── Actions par ligne (éditer / supprimer) ────────────────────────────────
export function DbRowActions({ table, id }: { table: string; id: string | number }) {
  const spec = useTableSpec(table);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const crud = useCrud(table);

  // Charge la ligne canonique (casing API) à l'ouverture de l'édition.
  const row = useQuery({
    queryKey: ["db", table, "row", id],
    queryFn: () => crud.client.get<Record<string, unknown>>(crud.row(id)),
    enabled: editing,
  });

  const update = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (table !== "db_character_variants") return crud.client.put(crud.row(id), body);
      const expected = row.data ? structuredClone(row.data) : null;
      if (!expected) throw new Error("Editorial row is not loaded");
      return crud.client.put(crud.row(id), {
        ...body,
        expected,
        expectedSha256: await browserWikiSnapshotHash(expected),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["db", table] });
      setEditing(false);
      fireToast("success", "Entrée modifiée.");
      router.refresh();
    },
    onError: (err: Error) => fireToast("error", `Échec : ${err.message}`),
  });

  const remove = useMutation({
    mutationFn: () => crud.client.delete(crud.row(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["db", table] });
      setConfirming(false);
      fireToast("success", "Entrée supprimée.");
      router.refresh();
    },
    onError: (err: Error) => {
      setConfirming(false);
      fireToast("error", `Échec : ${err.message}`);
    },
  });

  if (!spec || spec.readonly) return null;

  const studio = isStudioTable(table);

  return (
    <div className="flex justify-end gap-1">
      {studio ? (
        <Link
          href={`/admin/wiki/studio/${table}/${encodeURIComponent(String(id))}`}
          title="Modifier (studio visuel)"
          className="inline-flex items-center justify-center w-7 h-7 rounded border border-dbz-border text-dbz-blue-light hover:border-dbz-orange hover:text-dbz-orange transition-colors"
        >
          <Crayon className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Modifier"
          className="inline-flex items-center justify-center w-7 h-7 rounded border border-dbz-border text-dbz-blue-light hover:border-dbz-orange hover:text-dbz-orange transition-colors"
        >
          <Crayon className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        title="Supprimer"
        className="inline-flex items-center justify-center w-7 h-7 rounded border border-dbz-border text-red-400 hover:border-red-500/60 hover:bg-red-500/10 transition-colors"
      >
        <Corbeille className="h-3.5 w-3.5" />
      </button>

      {editing && !studio && (
        <FieldModal
          table={table}
          mode="edit"
          title="Modifier l'entrée"
          subtitle={`${spec.name} · ${spec.pk} = ${id}`}
          columns={spec.mutableColumns}
          initial={row.data ?? {}}
          loading={row.isLoading}
          saving={update.isPending}
          onClose={() => setEditing(false)}
          onSave={(body) => update.mutate(body)}
        />
      )}

      {confirming && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <div className="dbz-panel w-full max-w-md p-6">
            <div className="mb-4 flex items-center gap-3">
              <Alerte className="h-6 w-6 text-red-400 shrink-0" />
              <h3 className="font-saiyan text-lg uppercase text-red-400">
                Supprimer cette entrée ?
              </h3>
            </div>
            <p className="mb-1 text-sm text-white/70">
              Entrée <code className="font-mono text-xs text-dbz-orange">{id}</code> de{" "}
              <strong className="text-white">{spec.name}</strong>.
            </p>
            <p className="mb-6 text-sm font-semibold text-red-400/80">
              Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={remove.isPending}
                className="btn btn-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="btn btn-danger"
              >
                <Corbeille className="h-3.5 w-3.5" />
                {remove.isPending ? "Suppression…" : "Oui, supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modale de formulaire (création + édition) ─────────────────────────────
function FieldModal({
  table,
  mode,
  title,
  subtitle,
  columns,
  initial,
  onClose,
  onSave,
  saving,
  loading,
}: {
  table: string;
  mode: "create" | "edit";
  title: string;
  subtitle: string;
  columns: string[];
  initial: Record<string, unknown>;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
  loading?: boolean;
}) {
  const adminCatalogText = useAdminCatalogText();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const battleCombatants = table === "db_battles" ? parseCombatants(draft.combatants ?? "[]") : [];
  const battleIsValid =
    table !== "db_battles" ||
    (battleCombatants.length >= 2 &&
      battleCombatants.every((item) => item.name.trim().length > 0) &&
      battleCombatants.some((item) => item.side === "a") &&
      battleCombatants.some((item) => item.side === "b"));

  // Réhydrate quand la ligne canonique arrive (édition).
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        columns.map((c) => [
          c,
          table === "db_battles" && (c === "combatants" || c === "techniquesUsed")
            ? JSON.stringify(Array.isArray(initial[c]) ? initial[c] : [])
            : initial[c] != null
              ? String(initial[c])
              : "",
        ]),
      ),
    );
  }, [columns, initial, table]);

  const submit = () => {
    onSave(buildSubmitBody(draft, initial, columns, { mode, table }));
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur">
      <div className="dbz-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="font-saiyan text-lg uppercase text-dbz-orange">{title}</h3>
            <p className="mt-0.5 font-mono text-xs text-white/50">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost px-2"
            aria-label="Fermer"
          >
            <Croix className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-white/50">
            <LoadingText />
          </div>
        ) : (
          <div className="space-y-3">
            {columns.map((c) => (
              <div key={c}>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-dbz-blue-light">
                  {table === "db_battles" && (c === "combatants" || c === "techniquesUsed")
                    ? adminCatalogText(`fields.${c}` as AdminWikiFieldKey)
                    : table === "db_character_variant_staff_credits" && c === "image"
                      ? adminCatalogText("fields.episodeImage")
                      : table === "db_character_variant_technique_uses" ||
                          table === "db_character_variant_appearances" ||
                          table === "db_character_variant_staff_credits" ||
                          table === "db_character_variant_voice_actors"
                        ? adminCatalogText(`fields.${c}` as AdminWikiFieldKey)
                        : colLabel(c)}
                  <span className="ml-2 font-mono text-white/25 normal-case font-normal">{c}</span>
                </label>
                {table === "db_battles" && c === "combatants" ? (
                  <BattleCombatantsField
                    value={draft[c] ?? "[]"}
                    onChange={(v) => setDraft((d) => ({ ...d, [c]: v }))}
                  />
                ) : table === "db_battles" && c === "techniquesUsed" ? (
                  <BattleTechniquesField
                    value={draft[c] ?? "[]"}
                    onChange={(v) => setDraft((d) => ({ ...d, [c]: v }))}
                  />
                ) : (
                  <SmartField
                    table={table}
                    col={c}
                    value={draft[c] ?? ""}
                    original={initial[c]}
                    onChange={(v) => setDraft((d) => ({ ...d, [c]: v }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-dbz-border/40 pt-4">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || loading || !battleIsValid}
            className="btn btn-primary"
          >
            <Enregistrer className="h-3 w-3" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

type BattleSide = "a" | "b" | "neutral";
type BattleCombatant = {
  characterId?: number;
  editorKey: string;
  name: string;
  role?: string;
  side: BattleSide;
};

function parseCombatants(value: string): BattleCombatant[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
      .map((item, index) => {
        const combatant: BattleCombatant = {
          editorKey:
            typeof item.editorKey === "string"
              ? item.editorKey
              : `${index}-${String(item.characterId ?? item.name ?? "new")}`,
          name: typeof item.name === "string" ? item.name : "",
          side: item.side === "b" || item.side === "neutral" ? item.side : "a",
        };
        const characterId = Number(item.characterId);
        if (Number.isSafeInteger(characterId) && characterId > 0) {
          combatant.characterId = characterId;
        }
        if (typeof item.role === "string") combatant.role = item.role;
        return combatant;
      });
  } catch {
    return [];
  }
}

function parseStringList(value: string): Array<{ editorKey: string; value: string }> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (typeof item === "string") return [{ editorKey: `${index}-${item}`, value: item }];
      if (item !== null && typeof item === "object" && typeof item.value === "string") {
        return [
          {
            editorKey:
              typeof item.editorKey === "string" ? item.editorKey : `${index}-${item.value}`,
            value: item.value,
          },
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function BattleCombatantsField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useAdminCatalogText();
  const combatants = parseCombatants(value);
  const update = (next: BattleCombatant[]) => onChange(JSON.stringify(next));
  const sideLabels: Record<BattleSide, string> = {
    a: t("fields.sideA"),
    b: t("fields.sideB"),
    neutral: t("fields.sideNeutral"),
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-white/55">{t("fields.combatantsHelp")}</p>
      {combatants.map((combatant, index) => (
        <fieldset
          key={combatant.editorKey}
          className="grid min-w-0 gap-2 rounded-lg border border-dbz-border/50 p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-[10px] uppercase tracking-wider text-dbz-blue-light">
            {t("fields.combatants")} {index + 1}
          </legend>
          <input
            className="input min-w-0 text-sm"
            aria-label={t("fields.combatantName")}
            placeholder={t("fields.combatantName")}
            value={combatant.name}
            onChange={(event) => {
              const next = [...combatants];
              next[index] = { ...combatant, name: event.target.value };
              update(next);
            }}
          />
          <label className="min-w-0">
            <span className="mb-1 block text-xs text-white/55">
              {t("fields.combatantCharacterId")}
            </span>
            <SmartField
              table="db_character_relations"
              col="relatedCharacterId"
              value={combatant.characterId ? String(combatant.characterId) : ""}
              original={combatant.characterId}
              onChange={(nextValue) => {
                const next = [...combatants];
                const characterId = Number(nextValue);
                next[index] = {
                  ...combatant,
                  ...(Number.isSafeInteger(characterId) && characterId > 0 ? { characterId } : {}),
                };
                if (!(Number.isSafeInteger(characterId) && characterId > 0)) {
                  delete next[index].characterId;
                }
                update(next);
              }}
            />
          </label>
          <input
            className="input min-w-0 text-sm"
            aria-label={t("fields.combatantRole")}
            placeholder={t("fields.combatantRole")}
            value={combatant.role ?? ""}
            onChange={(event) => {
              const next = [...combatants];
              next[index] = { ...combatant, role: event.target.value };
              update(next);
            }}
          />
          <label className="flex min-w-0 items-center gap-2 text-xs text-white/65">
            <span className="shrink-0">{t("fields.combatantSide")}</span>
            <select
              className="input min-w-0 text-sm"
              aria-label={t("fields.combatantSide")}
              value={combatant.side}
              onChange={(event) => {
                const next = [...combatants];
                next[index] = { ...combatant, side: event.target.value as BattleSide };
                update(next);
              }}
            >
              {(["a", "b", "neutral"] as const).map((side) => (
                <option key={side} value={side}>
                  {sideLabels[side]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost justify-self-start text-xs"
            aria-label={`${t("fields.removeCombatant")} ${index + 1}`}
            onClick={() => update(combatants.filter((_, itemIndex) => itemIndex !== index))}
          >
            {t("fields.removeCombatant")}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-ghost text-xs"
        onClick={() =>
          update([...combatants, { editorKey: crypto.randomUUID(), name: "", side: "a" }])
        }
      >
        {t("fields.addCombatant")}
      </button>
    </div>
  );
}

function BattleTechniquesField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useAdminCatalogText();
  const techniques = parseStringList(value);
  const update = (next: Array<{ editorKey: string; value: string }>) =>
    onChange(JSON.stringify(next));

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/55">{t("fields.techniquesUsedHelp")}</p>
      {techniques.map((technique, index) => (
        <div key={technique.editorKey} className="flex min-w-0 items-center gap-2">
          <input
            className="input min-w-0 flex-1 text-sm"
            aria-label={`${t("fields.techniquesUsed")} ${index + 1}`}
            value={technique.value}
            onChange={(event) => {
              const next = [...techniques];
              next[index] = { ...technique, value: event.target.value };
              update(next);
            }}
          />
          <button
            type="button"
            className="btn btn-ghost text-xs"
            aria-label={`${t("fields.removeTechnique")} ${index + 1}`}
            onClick={() => update(techniques.filter((_, itemIndex) => itemIndex !== index))}
          >
            {t("fields.removeTechnique")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost text-xs"
        onClick={() => update([...techniques, { editorKey: crypto.randomUUID(), value: "" }])}
      >
        {t("fields.addTechnique")}
      </button>
    </div>
  );
}
