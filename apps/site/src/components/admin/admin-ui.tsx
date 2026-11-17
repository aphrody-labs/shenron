"use client";

/**
 * Liaison entre les primitives d'administration de `@aphrody/shenron-ui/admin` et le
 * site : libellés traduits (`admin.*` de `messages/*.json`) et liens Next. Rien
 * n'est redessiné ici — la table, la confirmation et l'en-tête vivent dans le
 * paquet ; ce module ne fait que leur passer la langue de l'interface.
 *
 * Utilisable depuis une page serveur comme depuis un composant client : les
 * props restent sérialisables (cellules déjà rendues, actions serveur).
 */
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode } from "react";
import {
  AdminPageHeader,
  ConfirmButton as UiConfirmButton,
  ConfirmDialog as UiConfirmDialog,
  DataTable as UiDataTable,
  useConfirm as useUiConfirm,
  type ConfirmLabels,
  type DataTableLabels,
} from "@aphrody/shenron-ui/admin";
import type { AdminPageId } from "./admin-pages";

const TABLE_KEYS = [
  "empty",
  "noMatch",
  "search",
  "searchPlaceholder",
  "clearSearch",
  "sortBy",
  "sortDefault",
  "ascending",
  "descending",
  "pagination",
  "previous",
  "next",
  "pageOf",
  "range",
  "selectAll",
  "selectRow",
  "selected",
  "clearSelection",
  "detailTitle",
  "detailEmpty",
  "showDetail",
  "closeDetail",
  "shortcutsTitle",
  "shortcutMove",
  "shortcutOpen",
  "shortcutSelect",
  "shortcutFilter",
  "shortcutPage",
] as const satisfies readonly (keyof DataTableLabels)[];

/** Gabarits bruts (`{page}` intact) : la table les remplit elle-même. */
function useTableLabels(): DataTableLabels {
  const t = useTranslations("admin.table");
  return Object.fromEntries(
    TABLE_KEYS.map((key) => [key, t.raw(key) as string]),
  ) as unknown as DataTableLabels;
}

export function useConfirmLabels(): ConfirmLabels {
  const t = useTranslations("admin.confirm");
  return { confirm: t("confirm"), cancel: t("cancel"), pending: t("pending") };
}

export function DataTable(
  props: Omit<ComponentProps<typeof UiDataTable>, "labels" | "linkComponent">,
) {
  return <UiDataTable {...props} labels={useTableLabels()} linkComponent={Link} />;
}

export function ConfirmDialog(props: Omit<ComponentProps<typeof UiConfirmDialog>, "labels">) {
  return <UiConfirmDialog {...props} labels={useConfirmLabels()} />;
}

export function ConfirmButton(props: Omit<ComponentProps<typeof UiConfirmButton>, "labels">) {
  return <UiConfirmButton {...props} labels={useConfirmLabels()} />;
}

/** `const { confirm, dialog } = useConfirm()` — à la place de `window.confirm`. */
export function useConfirm() {
  return useUiConfirm(useConfirmLabels());
}

/**
 * En-tête d'une page d'administration : titre et description traduits depuis
 * `admin.pages.<page>`. Pas de surtitre : le fil d’Ariane du shell porte déjà la
 * rubrique, et une étiquette au-dessus du titre la répéterait. `title` et `description`
 * remplacent le texte du dictionnaire quand la page affiche une donnée (nom
 * d'une persona, d'une table, d'un databook).
 */
export function AdminPageHeading({
  page,
  title,
  description,
  meta,
  actions,
}: {
  page: AdminPageId;
  title?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations("admin");
  return (
    <AdminPageHeader
      title={title ?? t(`pages.${page}.title`)}
      description={description ?? t(`pages.${page}.description`)}
      meta={meta}
      actions={actions}
    />
  );
}
