// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TechniqueArtworkPanel } from "../src/components/wiki/TechniqueArtworkPanel";

test("a missing attack illustration stays explicit and does not use a character portrait", () => {
  const html = renderToStaticMarkup(<TechniqueArtworkPanel name="Kamehameha" artwork={null} />);
  expect(html).toContain("reste à documenter");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("xv2");
});

test("a reviewed attack scene has an independent SVG icon and a link to its primary source", () => {
  const html = renderToStaticMarkup(
    <TechniqueArtworkPanel
      name="Kamehameha"
      artwork={{
        image: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol02/100.webp",
        icon: "/techniques/kamehameha.svg",
        medium: "manga",
        source: {
          label: "Dragon Ball, tome 2",
          url: "https://dragonballfr.com/wiki/manga/1421?page=100",
        },
      }}
    />,
  );
  expect(html).toContain('href="https://dragonballfr.com/wiki/manga/1421?page=100"');
  expect(html).toContain('src="/techniques/kamehameha.svg"');
  expect(html).toContain("Source manga");
  expect(html).toContain("object-contain");
  expect(html).not.toContain("creator");
});

test("every artwork status label has all three interface translations", async () => {
  const dictionaries = await Promise.all(
    ["fr", "en", "ja"].map((locale) =>
      Bun.file(new URL(`../messages/technique-artwork/${locale}.json`, import.meta.url)).json(),
    ),
  );
  for (const dictionary of dictionaries) {
    expect(Object.keys(dictionary).toSorted()).toEqual(Object.keys(dictionaries[0]).toSorted());
    for (const value of Object.values(dictionary))
      expect(typeof value === "string" && value.length > 0).toBe(true);
  }
});

test("an administrative upload is shown without inventing a primary source or an SVG", () => {
  const html = renderToStaticMarkup(
    <TechniqueArtworkPanel
      name="Reviewed by an editor"
      artwork={{
        image: "./assets/wiki/techniques/55b2d3a4-5c67-4890-8abc-df0123456789.webp",
        icon: null,
        medium: "editorial",
        source: null,
      }}
    />,
  );
  expect(html).toContain("Illustration éditoriale");
  expect(html).not.toContain("Source manga");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain(".svg");
});
