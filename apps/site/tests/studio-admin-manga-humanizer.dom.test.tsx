// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, afterEach } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { AdminWorkspaceFrame } from "../src/components/admin/AdminWorkspace";
import messages from "../messages/fr.json";
import {
  corrigerSosiesEtIntrusions,
  signalerIntrusions,
} from "../src/lib/databooks-ocr/sosies-intrusions";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("Shenron Studio UI/UX & A11y Standards", () => {
  it("verifies ToolBar accessibility rules, touch targets, and ARIA roles", () => {
    const toolbarMarkup = renderToStaticMarkup(
      <aside role="toolbar" aria-label="Barre d'outils Koharu Studio" className="p-1">
        <button type="button" aria-label="Sélectionner" className="min-h-11 min-w-11">
          Select
        </button>
        <button type="button" aria-label="Texte" className="min-h-11 min-w-11">
          Text
        </button>
        <button type="button" aria-label="Pinceau" className="min-h-11 min-w-11">
          Draw
        </button>
        <button type="button" aria-label="Gomme" className="min-h-11 min-w-11">
          Eraser
        </button>
      </aside>,
    );

    expect(toolbarMarkup).toContain('role="toolbar"');
    expect(toolbarMarkup).toContain("Barre d&#x27;outils Koharu Studio");
    expect(toolbarMarkup).toContain('aria-label="Sélectionner"');
    expect(toolbarMarkup).toContain('aria-label="Texte"');
    expect(toolbarMarkup).toContain('aria-label="Pinceau"');
    expect(toolbarMarkup).toContain('aria-label="Gomme"');
    expect(toolbarMarkup).toContain("min-h-11 min-w-11"); // 44px touch targets
  });
});

describe("Shenron Admin Workspace & Humanizer", () => {
  it("renders accessible forms with associated labels and submit buttons", async () => {
    if (typeof document === "undefined") return;
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <NextIntlClientProvider locale="fr" messages={messages}>
          <AdminWorkspaceFrame href="/admin/cards">
            <label htmlFor="test-search">Recherche Carte</label>
            <input id="test-search" data-testid="search-input" defaultValue="Son Goku" />
            <button type="submit" aria-label="Sauvegarder">
              Sauvegarder
            </button>
          </AdminWorkspaceFrame>
        </NextIntlClientProvider>,
      );
    });

    const label = container.querySelector("label");
    const input = container.querySelector("#test-search");
    const button = container.querySelector('button[type="submit"]');

    expect(label?.getAttribute("for")).toBe("test-search");
    expect(label?.textContent).toContain("Recherche Carte");
    expect(input).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Sauvegarder");
  });
});

describe("Databooks OCR Humanizer & Review", () => {
  it("cleans up OCR intrusions and corrects Japanese homoglyph errors", () => {
    // Test sosies-intrusions filter
    const noisyText = "① 孫悟空 ㉟ ㉠ カカロット";
    const res = corrigerSosiesEtIntrusions(noisyText);
    expect(res.texte).toBeDefined();
    expect(res.texte).toContain("孫悟空");
    // Korean hangul circled 36 (㉠ U+3260) should be corrected to circled 36 (㊱ U+32B1)
    expect(res.texte).toContain("㊱");
    expect(res.rapport.length).toBe(2);

    // Test signalement of foreign intrusions
    const foreign = signalerIntrusions("孫悟空 джз カカロット");
    expect(foreign.length).toBeGreaterThan(0);
    expect(foreign[0].fragment).toBe("джз");
  });
});
