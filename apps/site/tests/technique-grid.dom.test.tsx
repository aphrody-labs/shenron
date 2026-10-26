// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { TechniqueGrid, type TechniqueCard } from "../src/components/wiki/TechniqueGrid";
import type { AccessSnapshot } from "../src/lib/wiki-launch";

const techniques: TechniqueCard[] = [
  {
    id: 1,
    slug: "kamehameha",
    name: "Kaméhaméha",
    nameJa: "かめはめ波",
    type: "beam",
    image: null,
    creatorName: "Kamé Sennin",
    description: "A concentrated energy wave.",
  },
  {
    id: 2,
    slug: "kikoho",
    name: "Kikōhō",
    nameJa: "気功砲",
    type: "blast",
    image: null,
    creatorName: "Tenshinhan",
    description: null,
  },
];
const access: AccessSnapshot = { openKeys: ["techniques"] };
const props = { techniques, access, libelles: { beam: "Rayon", blast: "Explosion" } };

test("technique catalogue starts with searchable cards and honest missing artwork", () => {
  const html = renderToStaticMarkup(<TechniqueGrid {...props} />);
  expect(html).toContain("Rechercher une technique");
  expect(html).toContain('href="/wiki/techniques/kamehameha"');
  expect(html).toContain("Illustration à documenter");
  expect(html).not.toContain("kinto-un-icone.svg");
  expect(html).not.toContain("HIÉRARCHIE");
});

test("technique messages have full French, English and Japanese key coverage", async () => {
  const dictionaries = await Promise.all(
    ["fr", "en", "ja"].map((locale) =>
      Bun.file(new URL(`../messages/techniques/${locale}.json`, import.meta.url)).json(),
    ),
  );
  const keys = Object.keys(dictionaries[0]).toSorted();
  for (const dictionary of dictionaries) {
    expect(Object.keys(dictionary).toSorted()).toEqual(keys);
    expect(
      Object.values(dictionary).every((value) => typeof value === "string" && value.length > 0),
    ).toBe(true);
  }
});

test("closed technique access never emits an unusable detail link", () => {
  const html = renderToStaticMarkup(<TechniqueGrid {...props} access={{ openKeys: [] }} />);
  expect(html).not.toContain('href="/wiki/techniques/');
  expect(html).toContain('aria-disabled="true"');
});

test.skipIf(typeof document === "undefined")(
  "a shared second-page URL restores after hydration and keeps the DOM bounded",
  async () => {
    const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, "", "/wiki/techniques?p=2");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const entries = Array.from({ length: 61 }, (_, index) => ({
      ...techniques[0]!,
      id: index,
      slug: `technique-${index}`,
      name: `Technique ${String(index).padStart(2, "0")}`,
    }));
    try {
      await act(async () => root.render(<TechniqueGrid {...props} techniques={entries} />));
      expect(container.querySelectorAll("article").length).toBe(1);
      expect(container.querySelector("article")!.textContent).toContain("Technique 60");
      expect(new URLSearchParams(window.location.search).get("p")).toBe("2");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      window.history.replaceState(null, "", "/wiki/techniques");
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);

test.skipIf(typeof document === "undefined")(
  "search and creator facets combine, then reset restores the catalogue",
  async () => {
    const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = globals.IS_REACT_ACT_ENVIRONMENT;
    globals.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<TechniqueGrid {...props} />));
      const search = container.querySelector(
        'input[aria-label="Rechercher une technique"]',
      ) as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!;
        setter.call(search, "kamehameha");
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.querySelectorAll("article").length).toBe(1);
      const tenshinhan = [...container.querySelectorAll("label")]
        .find((label) => label.textContent?.includes("Tenshinhan"))!
        .querySelector("input")!;
      await act(async () => tenshinhan.click());
      expect(container.querySelectorAll("article").length).toBe(0);
      expect(container.textContent).toContain("Aucun résultat");
      const reset = [...container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Réinitialiser"),
      )!;
      await act(async () => reset.click());
      expect(container.querySelectorAll("article").length).toBe(2);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globals.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);
