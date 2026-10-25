// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { WikiListLayout, WikiSearchField, WikiFacet } from "../src/components/wiki/WikiListLayout";
import { WIKI_CATEGORIES } from "../src/lib/wiki-categories";
import { SITE_DESTINATIONS } from "../src/lib/site-map";

mock.module("next/navigation", () => ({ usePathname: () => "/wiki/techniques/kamehameha" }));
const { WikiExplorer } = await import("../src/components/wiki/WikiExplorer");

test("every public wiki destination has a name in all interface languages", async () => {
  for (const locale of ["fr", "en", "ja"]) {
    const dictionary = await Bun.file(
      new URL(`../messages/wiki-explorer/${locale}.json`, import.meta.url),
    ).json();
    for (const destination of SITE_DESTINATIONS.filter(
      (entry) =>
        entry.audience === "public" &&
        entry.href.startsWith("/wiki/") &&
        entry.href !== "/wiki/search",
    )) {
      expect(
        dictionary.wikiExplorer.categories[destination.href.slice("/wiki/".length)]?.length,
      ).toBeGreaterThan(0);
    }
  }
});

test("deep wiki pages expose a labelled GET search and the current category", () => {
  const html = renderToStaticMarkup(<WikiExplorer categories={WIKI_CATEGORIES} />);
  expect(html).toContain('action="/wiki/search"');
  expect(html).toContain('method="get"');
  expect(html).toContain('name="q"');
  expect(html).toContain('for="wiki-explorer-query"');
  expect(html).toContain('aria-current="location" href="/wiki/techniques"');
  expect(html).toContain("Rechercher dans le wiki");
  expect(html).not.toContain("wikiExplorer.");
});

test("directory only includes categories supplied by the server access gate", () => {
  const html = renderToStaticMarkup(
    <WikiExplorer categories={WIKI_CATEGORIES.filter((c) => c.key === "characters")} />,
  );
  expect(html).toContain('href="/wiki/characters"');
  expect(html).not.toContain('href="/wiki/techniques"');
});

test("index search has a visible associated label and preserves complete facet names", () => {
  const html = renderToStaticMarkup(
    <>
      <WikiSearchField value="" onChange={() => {}} label="Find a technique" />
      <WikiFacet
        title="Series"
        options={[{ value: "series", label: "A long source series name" }]}
        selected={[]}
        onChange={() => {}}
      />
    </>,
  );
  expect(html).toMatch(/<label for="([^"]+)"[^>]*>Find a technique<\/label>/);
  expect(html).toContain("A long source series name");
  expect(html).not.toContain("truncate");
});

test.skipIf(typeof document === "undefined")(
  "empty filtered indexes offer a working reset action",
  async () => {
    const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let resets = 0;
    try {
      await act(async () =>
        root.render(
          <WikiListLayout
            resultCount={0}
            resultLabel="0 techniques"
            onReset={() => {
              resets += 1;
            }}
          >
            <div>Stale results</div>
          </WikiListLayout>,
        ),
      );
      expect(container.textContent).toContain("Aucun résultat avec ces filtres");
      expect(container.textContent).not.toContain("Stale results");
      await act(async () => container.querySelector("button")!.click());
      expect(resets).toBe(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);

test.skipIf(typeof document === "undefined")(
  "Escape closes the directory and restores focus to its summary",
  async () => {
    const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<WikiExplorer categories={WIKI_CATEGORIES} />));
      const details = container.querySelector("details")!;
      details.open = true;
      const link = details.querySelector("a")!;
      link.focus();
      await act(async () =>
        link.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
      );
      expect(details.open).toBe(false);
      expect(document.activeElement).toBe(details.querySelector("summary"));
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);
