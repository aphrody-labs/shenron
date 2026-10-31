/* oxlint-disable jsx-a11y/control-has-associated-label -- legacy UI kept as-is (behavior-preserving lint pass) */
"use client";

/**
 * Champ d'édition « intelligent » partagé par TOUS les éditeurs admin (studio,
 * éditeur générique de tables, db-universe). Choisit le bon contrôle human-first
 * d'après la colonne :
 *   - image            → upload drag-drop (ImageField)
 *   - clé étrangère    → picker « choisir par nom » (EntityPicker)
 *   - booléen          → interrupteur
 *   - enum             → menu déroulant (strict) ou saisie + suggestions
 *   - date (epoch)     → sélecteur de date
 *   - jsonb            → zone de texte JSON
 *   - texte long       → zone de texte
 *   - sinon            → champ texte
 */
import { useT } from "@/components/T";
import { LoadingText } from "@/components/LoadingText";
import { useQuery } from "@tanstack/react-query";
import { ImageField } from "@/components/admin/ImageField";
import { MarkdownField } from "@/components/admin/MarkdownField";
import { apiAt } from "@/lib/admin-api";
import { crudBase } from "@/lib/wiki-tables";
import {
  enumOptionsFor,
  fkTarget,
  isBoolColumn,
  isDateColumn,
  isImageColumn,
  isLongTextColumn,
  isRichTextColumn,
  uploadSubdir,
} from "@/lib/wiki-fields";
import { PlainField } from "@/components/editor/PlainField";

interface Props {
  table: string;
  col: string;
  value: string;
  onChange: (v: string) => void;
  /** Valeur typée d'origine (détecte jsonb objet / unité epoch d'une date). */
  original?: unknown;
  onUploadStateChange?: (uploading: boolean) => void;
}

function epochToDateInput(v: string): string {
  if (!/^\d+$/.test(v)) return "";
  const n = Number(v);
  const ms = v.length >= 13 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function dateInputToEpoch(dateStr: string, original: string): string {
  if (!dateStr) return "";
  const ms = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(ms)) return "";
  // Préserve l'unité d'origine (ms si la valeur faisait 13 chiffres, sinon sec).
  return String(/^\d{13}$/.test(original) ? ms : Math.floor(ms / 1000));
}

export function SmartField({ table, col, value, onChange, original, onUploadStateChange }: Props) {
  const t = useT();
  if (
    table === "db_character_variants" &&
    (col === "transformationIds" || col === "techniqueIds")
  ) {
    return (
      <JsonIdArrayPicker
        targetTable={col === "transformationIds" ? "db_transformations" : "db_techniques"}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (isImageColumn(table, col)) {
    return (
      <ImageField
        value={value}
        onChange={onChange}
        subdir={uploadSubdir(table)}
        column={col}
        onUploadStateChange={onUploadStateChange}
      />
    );
  }

  const fk = fkTarget(col);
  if (fk) return <EntityPicker refTable={fk.table} value={value} onChange={onChange} />;

  if (isBoolColumn(col)) {
    const on = value === "true" || value === "1";
    return (
      <button
        type="button"
        onClick={() => onChange(on ? "false" : "true")}
        className={`btn w-full ${on ? "btn-primary" : "btn-ghost"}`}
      >
        {on ? "Oui / Activé" : "Non / Désactivé"}
      </button>
    );
  }

  const en = enumOptionsFor(table, col);
  if (en) {
    if (en.strict) {
      const known = en.options.includes(value);
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— Aucun —</option>
          {value && !known && <option value={value}>{value}</option>}
          {en.options.map((o) => (
            <option key={o} value={o}>
              {table === "media_editions" && col === "pageColor"
                ? t(`mangaCatalog.pageColor.${o}`)
                : o}
            </option>
          ))}
        </select>
      );
    }
    const listId = `enum-${table}-${col}`;
    return (
      <>
        <input
          className="input font-mono text-sm"
          list={listId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={listId}>
          {en.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </>
    );
  }

  if (isDateColumn(col)) {
    return (
      <input
        type="date"
        className="input text-sm"
        value={epochToDateInput(value)}
        onChange={(e) => onChange(dateInputToEpoch(e.target.value, value))}
      />
    );
  }

  if (original !== null && typeof original === "object") {
    // jsonb : lecture seule ici (l'édition structurée n'est pas supportée ;
    // `buildSubmitBody` ne réécrit jamais ces colonnes → zéro corruption).
    return (
      <div className="space-y-1">
        <PlainField value={value} readOnly monospace minRows={4} spellCheck={false} />
        <p className="text-[10px] text-white/50">
          Champ JSON structuré — non éditable ici (édité via les scripts/outils dédiés).
        </p>
      </div>
    );
  }

  if (isRichTextColumn(table, col)) {
    return <MarkdownField value={value} onChange={onChange} subdir={uploadSubdir(table)} />;
  }

  if (isLongTextColumn(col)) {
    return (
      <PlainField
        value={value}
        onChange={onChange}
        minRows={5}
        maxRows={20}
        placeholder="Texte libre…"
      />
    );
  }

  return (
    <input
      className="input font-mono text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function JsonIdArrayPicker({
  targetTable,
  value,
  onChange,
}: {
  targetTable: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fk-options", targetTable],
    queryFn: () =>
      apiAt(crudBase(targetTable)).get<{ options: { value: string; label: string }[] }>(
        `/${targetTable}?as=options`,
      ),
    staleTime: 5 * 60_000,
  });
  const selected = value
    .split(/[ ,]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id));
  const selectedSet = new Set(selected);
  const options = data?.options ?? [];
  const missing = selected
    .filter((id) => !options.some((option) => option.value === id))
    .map((id) => ({ value: id, label: `#${id}` }));

  if (isError) {
    return (
      <input
        className="input font-mono text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="IDs séparés par des virgules"
      />
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-white/50">
        {isLoading ? <LoadingText /> : `${selected.length} sélectionné(s)`}
      </p>
      <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-dbz-border/50 p-2">
        {[...missing, ...options].map((option) => (
          <label key={option.value} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selectedSet.has(option.value)}
              disabled={isLoading}
              onChange={(event) => {
                const next = new Set(selectedSet);
                if (event.target.checked) next.add(option.value);
                else next.delete(option.value);
                onChange([...next].join(","));
              }}
            />
            <span className="text-white/80">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Picker FK : menu déroulant « choisir par nom » alimenté par l'endpoint léger
 * `/<table>?as=options` (pk + libellé, trié, non tronqué). Type-ahead natif du
 * <select>. Sur erreur de chargement → repli en saisie d'id brut (champ utilisable).
 */
function EntityPicker({
  refTable,
  value,
  onChange,
}: {
  refTable: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fk-options", refTable],
    queryFn: () =>
      apiAt(crudBase(refTable)).get<{ options: { value: string; label: string }[] }>(
        `/${refTable}?as=options`,
      ),
    staleTime: 5 * 60_000,
  });

  if (isError) {
    return (
      <input
        className="input font-mono text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="id (liste indisponible)"
      />
    );
  }

  const options = data?.options ?? [];
  const inList = options.some((o) => o.value === value);

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading}
    >
      <option value="">{isLoading ? t("common.loading") : "— Aucun —"}</option>
      {value && !inList && <option value={value}>Actuel : {value}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label} · #{o.value}
        </option>
      ))}
    </select>
  );
}
