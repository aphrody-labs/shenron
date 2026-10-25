// SPDX-License-Identifier: Apache-2.0
import { expect, mock, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "../src/lib/i18n/client";
import type { SupportedLocale } from "../src/lib/i18n";
import { getWikiAdminDictionary } from "../src/lib/wiki-admin-text";
mock.module("next/navigation", () => ({
  useRouter: () => ({ back() {}, push() {}, replace() {} }),
}));
mock.module("../src/components/admin/SmartField", () => ({
  SmartField: ({
    col,
    value,
    onChange,
  }: {
    col: string;
    value: string;
    onChange: (v: string) => void;
  }) => <input aria-label={col} value={value} onChange={(e) => onChange(e.target.value)} />,
}));
for (const name of [
  "RelationsPanel",
  "WikiEntityPreview",
  "WikiHistory",
  "WikiSectionsPanel",
  "WikiAiAssistant",
  "DatabookPagesPanel",
  "GameMediaPanel",
  "CharacterStatsPanel",
  "TransformationsPanel",
]) {
  mock.module(`../src/components/admin/${name}`, () => ({ [name]: () => null }));
}
const { WikiStudio } = await import("../src/components/admin/WikiStudio");
const { WikiManager } = await import("../src/app/admin/wiki/WikiManager");
const domTest = test.skipIf(typeof document === "undefined");

async function mount() {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    container,
    root,
    qc,
    async close() {
      await act(async () => root.unmount());
      container.remove();
      qc.clear();
    },
  };
}

domTest("studio remounts drafts across tables with the same id and edit to create", async () => {
  const view = await mount();
  view.qc.setQueryData(["wiki-studio", "db_characters", "2"], {
    id: 2,
    name: "Vegeta",
    slug: "vegeta",
  });
  view.qc.setQueryData(["wiki-studio", "db_planets", "2"], { id: 2, name: "Namek", slug: "namek" });
  try {
    for (const [table, id, name] of [
      ["db_characters", "2", "Vegeta"],
      ["db_planets", "2", "Namek"],
      ["db_planets", "new", ""],
    ]) {
      await act(async () =>
        view.root.render(
          <QueryClientProvider client={view.qc}>
            <WikiStudio table={table!} id={id!} />
          </QueryClientProvider>,
        ),
      );
      expect(
        view.container.querySelector<HTMLInputElement>('input[aria-label="name"]')?.value,
      ).toBe(name);
    }
  } finally {
    await view.close();
  }
});

domTest("studio failed CAS keeps the draft and exposes a persistent accessible error", async () => {
  const view = await mount();
  view.qc.setQueryData(["wiki-studio", "db_planets", "2"], {
    id: 2,
    name: "Namek",
    slug: "namek",
    image: null,
  });
  const requests: Record<string, unknown>[] = [];
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_input: RequestInfo | URL, opts?: RequestInit) => {
        requests.push(JSON.parse(String(opts?.body)));
        return Response.json({ error: "conflict" }, { status: 409 });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    await act(async () =>
      view.root.render(
        <QueryClientProvider client={view.qc}>
          <WikiStudio table="db_planets" id="2" />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      view.container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.expected).toEqual({ id: 2, name: "Namek", slug: "namek", image: null });
    expect(requests[0]?.expectedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("brouillon");
    expect(view.container.querySelector<HTMLInputElement>('input[aria-label="name"]')?.value).toBe(
      "Namek",
    );
  } finally {
    fetchMock.mockRestore();
    await view.close();
  }
});

domTest("manager exposes labelled search and editing actions without hover", async () => {
  const view = await mount();
  try {
    await act(async () =>
      view.root.render(
        <WikiManager
          categories={[
            {
              id: "c",
              name: "Saiyans",
              slug: "saiyans",
              order: 0,
              pages: [{ id: "p", title: "Vegeta", slug: "vegeta" }],
              children: [],
            },
          ]}
        />,
      ),
    );
    const search = view.container.querySelector<HTMLInputElement>("#wiki-manager-search")!;
    expect(view.container.querySelector('label[for="wiki-manager-search"]')?.textContent).toBe(
      "Recherche",
    );
    expect(search.type).toBe("search");
    const edit = view.container.querySelector('a[href="/admin/wiki/page/p"]')!;
    expect(edit.textContent).toContain("Éditer");
    expect(edit.parentElement?.className).not.toContain("opacity-0");
  } finally {
    await view.close();
  }
});

for (const locale of ["fr", "en", "ja"] as SupportedLocale[]) {
  domTest(`manager and studio resolve all interface labels in ${locale}`, async () => {
    const view = await mount();
    const missing: string[] = [];
    const warning = spyOn(console, "warn").mockImplementation((message) =>
      missing.push(String(message)),
    );
    document.cookie = `NEXT_LOCALE=${locale}; path=/`;
    try {
      await act(async () =>
        view.root.render(
          <LocaleProvider>
            <QueryClientProvider client={view.qc}>
              <WikiManager
                categories={[]}
                stats={[
                  {
                    table: "db_characters",
                    total: 4,
                    hidden: 1,
                    missingImage: 1,
                    missingDesc: 1,
                    missingJa: 1,
                    imageCol: "image",
                    descCol: "description",
                    jaCol: "nameJa",
                    hasVisibility: true,
                  },
                ]}
                recent={[
                  {
                    id: "revision",
                    tableName: "db_characters",
                    rowId: "1",
                    action: "update",
                    label: "Goku",
                    editorName: null,
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                  },
                ]}
              />
              <WikiStudio table="db_characters" id="new" />
            </QueryClientProvider>
          </LocaleProvider>,
        ),
      );
      const dictionary = getWikiAdminDictionary(locale);
      const translatedTitle = dictionary.adminWiki.manager.title;
      expect(view.container.querySelector("h1")?.textContent).toBe(translatedTitle);
      expect(view.container.textContent).toContain(dictionary.adminWiki.fields.name);
      expect(view.container.textContent).toContain(dictionary.adminWiki.studio.saveCharacterStats);
      expect(view.container.textContent).toContain(dictionary.adminWiki.manager.tools.assets);
      expect(missing.filter((message) => message.includes("[i18n]"))).toEqual([]);
    } finally {
      warning.mockRestore();
      document.cookie = "NEXT_LOCALE=fr; path=/";
      await view.close();
    }
  });
}
