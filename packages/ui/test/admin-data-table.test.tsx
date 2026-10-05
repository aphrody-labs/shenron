// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AdminPageHeader,
  ConfirmButton,
  DataTable,
  FormField,
  FormGrid,
  Metric,
  MetricGrid,
  StatusBadge,
  hotkeyOf,
  isTypingTarget,
  type DataTableColumn,
  type DataTableRow,
} from "../src/admin";
import {
  ariaSortOf,
  clampPage,
  fillLabel,
  filterRows,
  fold,
  moveIndex,
  nextSort,
  pageCountOf,
  pageHref,
  paginate,
  selectionState,
  sortRows,
} from "../src/admin/data-table-model";

const rows: DataTableRow[] = [
  { id: 1, cells: { name: "Végéta", power: 18_000 } },
  { id: 2, cells: { name: "Goku", power: 9_001 } },
  { id: 3, cells: { name: "Krilin", power: null }, sort: { power: null } },
  { id: 4, cells: { name: "Freezer", power: 530_000 }, search: "Freezer empereur" },
];

describe("modèle de la table d'administration", () => {
  test("trie les nombres numériquement et laisse les valeurs absentes en bas dans les deux sens", () => {
    expect(sortRows(rows, { key: "power", direction: "asc" }).map((r) => r.id)).toEqual([
      2, 1, 4, 3,
    ]);
    expect(sortRows(rows, { key: "power", direction: "desc" }).map((r) => r.id)).toEqual([
      4, 1, 2, 3,
    ]);
    expect(sortRows(rows, null).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  test("trie le texte sans tenir compte des accents ni de la casse", () => {
    expect(sortRows(rows, { key: "name", direction: "asc" }).map((r) => r.id)).toEqual([
      4, 2, 3, 1,
    ]);
  });

  test("filtre par termes, accents et casse ignorés, avec le texte de recherche explicite", () => {
    expect(fold("Végéta")).toBe("vegeta");
    expect(filterRows(rows, "VEGETA").map((r) => r.id)).toEqual([1]);
    expect(filterRows(rows, "empereur").map((r) => r.id)).toEqual([4]);
    expect(filterRows(rows, "  ").length).toBe(4);
    expect(filterRows(rows, "goku freezer")).toEqual([]);
  });

  test("pagine et borne la page demandée", () => {
    expect(pageCountOf(0, 25)).toBe(1);
    expect(pageCountOf(51, 25)).toBe(3);
    expect(pageCountOf(51, 0)).toBe(1);
    expect(clampPage(9, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(paginate(rows, 1, 3).map((r) => r.id)).toEqual([4]);
    expect(paginate(rows, 7, 3).map((r) => r.id)).toEqual([4]);
    expect(paginate(rows, 0, 0)).toHaveLength(4);
    expect(pageHref("/admin/audit?page={page}", 1)).toBe("/admin/audit?page=2");
  });

  test("cycle de tri d'un en-tête : croissant, décroissant, ordre d'origine", () => {
    const asc = nextSort(null, "name");
    expect(asc).toEqual({ key: "name", direction: "asc" });
    const desc = nextSort(asc, "name");
    expect(desc).toEqual({ key: "name", direction: "desc" });
    expect(nextSort(desc, "name")).toBeNull();
    expect(nextSort(desc, "power")).toEqual({ key: "power", direction: "asc" });
    expect(ariaSortOf(desc, "name")).toBe("descending");
    expect(ariaSortOf(desc, "power")).toBe("none");
  });

  test("navigation clavier bornée", () => {
    expect(moveIndex(-1, 4, "next")).toBe(0);
    expect(moveIndex(-1, 4, "previous")).toBe(3);
    expect(moveIndex(3, 4, "next")).toBe(3);
    expect(moveIndex(0, 4, "previous")).toBe(0);
    expect(moveIndex(2, 4, "first")).toBe(0);
    expect(moveIndex(0, 4, "last")).toBe(3);
    expect(moveIndex(0, 0, "next")).toBe(-1);
  });

  test("case « tout sélectionner » : aucune, partielle, complète", () => {
    expect(selectionState([1, 2], new Set())).toBe("none");
    expect(selectionState([1, 2], new Set([2, 9]))).toBe("some");
    expect(selectionState([1, 2], new Set([1, 2]))).toBe("all");
    expect(selectionState([], new Set([1]))).toBe("none");
    expect(fillLabel("Page {page} sur {count}", { page: 2, count: 5 })).toBe("Page 2 sur 5");
    expect(fillLabel("{inconnu}", {})).toBe("{inconnu}");
  });
});

const columns: DataTableColumn[] = [
  { key: "name", header: "Nom", sortable: true },
  { key: "power", header: "Puissance", align: "end", sortable: true },
  {
    key: "actions",
    header: <span className="sr-only">Actions</span>,
    label: "Actions",
    mobile: "actions",
  },
];
const withActions = rows.map((row) => ({
  ...row,
  cells: { ...row.cells, actions: <button type="button">Modifier</button> },
}));

describe("DataTable : une seule structure, cartes sur mobile, tableau dense sur desktop", () => {
  const html = renderToStaticMarkup(
    <DataTable
      columns={columns}
      rows={withActions}
      caption="Combattants"
      selectable
      searchable
      pageSize={2}
    />,
  );

  test("le même <table> se replie en cartes sous md", () => {
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain("max-md:block");
    expect(html).toContain("max-md:rounded-xl");
    expect(html).toMatch(/<thead class="[^"]*max-md:hidden/);
    // Étiquette visible sur la carte mobile, masquée sur desktop.
    expect(html).toContain('<span class="shrink-0 text-xs text-os/50 md:hidden">Puissance</span>');
  });

  test("le desktop expose tri, sélection, pagination et légende accessible", () => {
    expect(html).toContain('<caption class="sr-only">Combattants</caption>');
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('aria-label="Sélectionner les lignes affichées"');
    expect(html).toContain("Sélectionner 1");
    expect(html).toContain('aria-label="Pagination du tableau"');
    expect(html).toContain("Page 1 sur 2");
    expect(html).toContain("1–2 sur 4");
    // Deux lignes par page, la première seule dans l'ordre de tabulation.
    expect(html.match(/data-row-index=/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
  });

  test("le mobile propose le tri par liste et des cibles tactiles de 44 px", () => {
    expect(html).toMatch(
      /<label class="[^"]*md:hidden"><span class="shrink-0">Trier par<\/span><select/,
    );
    expect(html).toContain("Puissance (décroissant)");
    expect(html).toContain("min-h-11");
  });

  test("libellés injectés et pagination par URL côté serveur", () => {
    const linked = renderToStaticMarkup(
      <DataTable
        columns={columns}
        rows={withActions}
        caption="Journal"
        labels={{ pageOf: "Page {page} of {count}", next: "Next" }}
        pagination={{
          page: 1,
          pageCount: 3,
          total: 120,
          pageSize: 50,
          hrefTemplate: "?page={page}",
        }}
      />,
    );
    expect(linked).toContain("Page 2 of 3");
    expect(linked).toContain('href="?page=3"');
    expect(linked).toContain('href="?page=1"');
    expect(linked).toContain("51–54 sur 120");
  });

  test("état vide lisible", () => {
    const empty = renderToStaticMarkup(
      <DataTable columns={columns} rows={[]} caption="Vide" empty="Aucun combattant." />,
    );
    expect(empty).toContain("Aucun combattant.");
    expect(empty).not.toContain("<table");
  });
});

describe("primitives d'administration", () => {
  test("en-tête : titre unique, surtitre de rubrique et actions", () => {
    const html = renderToStaticMarkup(
      <AdminPageHeader
        eyebrow="Sécurité"
        title="Journal"
        description="Actions du bot"
        actions={<a href="/x">Exporter</a>}
      />,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Sécurité");
    expect(html).toContain("Exporter");
    expect(html).not.toContain("<nav");
  });

  test("badge d'état : le texte porte l'information, le ton suit les jetons", () => {
    const html = renderToStaticMarkup(
      <StatusBadge tone="success" dot>
        En ligne
      </StatusBadge>,
    );
    expect(html).toContain('data-tone="success"');
    expect(html).toContain("En ligne");
    expect(html).toContain("border-dbz-green/50");
  });

  test("compteurs : deux colonnes sur mobile, « — » pour une valeur inconnue", () => {
    const html = renderToStaticMarkup(
      <MetricGrid>
        <Metric label="Membres" value={null} />
        <Metric label="Serveurs" value="3" href="/admin/discord" />
      </MetricGrid>,
    );
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("—");
    expect(html).toContain('href="/admin/discord"');
  });

  test("formulaire : une colonne sur mobile, deux sur desktop", () => {
    const html = renderToStaticMarkup(
      <FormGrid>
        <FormField label="Titre" htmlFor="t" required>
          <input id="t" />
        </FormField>
        <FormField label="Corps" span="full">
          <textarea />
        </FormField>
      </FormGrid>,
    );
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("md:col-span-2");
    expect(html).toContain('for="t"');
  });

  test("bouton destructif : rien ne part sans la boîte de confirmation", () => {
    const html = renderToStaticMarkup(
      <ConfirmButton confirm={{ title: "Supprimer ?" }} formId="f">
        Supprimer
      </ConfirmButton>,
    );
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('type="button"');
    expect(html).not.toContain("Supprimer ?");
  });

  test("raccourcis : jamais avec Ctrl, ⌘ ou Alt, jamais pendant la saisie", () => {
    expect(hotkeyOf({ key: "/", ctrlKey: false, metaKey: false, altKey: false })).toBe("/");
    expect(hotkeyOf({ key: "K", ctrlKey: false, metaKey: false, altKey: false })).toBe("k");
    expect(hotkeyOf({ key: "k", ctrlKey: false, metaKey: true, altKey: false })).toBeNull();
    expect(hotkeyOf({ key: "Escape", ctrlKey: false, metaKey: false, altKey: false })).toBe(
      "Escape",
    );
    expect(isTypingTarget(null)).toBe(false);
  });
});
