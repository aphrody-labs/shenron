// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { CanvasPublicExamples } from "../src/components/site/CanvasPublicExamples";
import fr from "../messages/canvas-ui/fr.json";
import en from "../messages/canvas-ui/en.json";
import ja from "../messages/canvas-ui/ja.json";

test("public canvas examples do not load an arbitrary member and preserve both API cards", () => {
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: "fr", messages: {} },
      createElement(CanvasPublicExamples),
    ),
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("853295213473038376");
  expect(html).toContain("/api/public/profile/:id/card.png");
  expect(html).toContain("/api/public/profile/:id/scan.png");
  expect(html).toContain("/eprofil");
  expect(html).toContain("/scan @membre");
  expect(html).toMatch(/inputmode="numeric"/i);
  expect(html).toContain("disabled");
});

test("canvas states and descriptions are translated in every supported locale", () => {
  for (const [locale, dictionary] of Object.entries({ fr, en, ja })) {
    expect(Object.keys(dictionary).toSorted()).toEqual(Object.keys(fr).toSorted());
    expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale, messages: {} },
        createElement(CanvasPublicExamples),
      ),
    );
    expect(html).toContain(dictionary.samples);
    expect(html).toContain(dictionary.empty);
  }
});
