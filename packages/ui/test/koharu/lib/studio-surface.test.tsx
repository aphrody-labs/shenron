/* oxlint-disable eslint/no-unused-vars -- behavior-preserving legacy pattern, reviewed */
// SPDX-License-Identifier: MIT OR Apache-2.0
// The editor is Shenron Studio in a browser tab: no native window controls outside Tauri, the
// site locale drives its language, no visible text names the internal code name, and the
// engine channel never comes from the Tauri-only module.
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";

import { StartupView } from "@aphrody/shenron-ui/koharu/components/app/StartupView";
import { WindowControls } from "@aphrody/shenron-ui/koharu/components/app/WindowChrome";
import i18n, { editorLanguage, resources } from "@aphrody/shenron-ui/koharu/lib/i18n";
import { useSiteLocale } from "@aphrody/shenron-ui/koharu/lib/site-locale";

const host = window as unknown as { __TAURI_INTERNALS__?: unknown };

function withoutTauri<T>(run: () => T): T {
  const internals = host.__TAURI_INTERNALS__;
  host.__TAURI_INTERNALS__ = undefined;
  try {
    return run();
  } finally {
    host.__TAURI_INTERNALS__ = internals;
  }
}

function strings(value: object, prefix = ""): Array<[string, string]> {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof item === "string" ? [[path, item]] : strings(item, path);
  });
}

afterEach(cleanup);

describe("window controls", () => {
  it("renders the native controls inside Tauri", () => {
    render(<WindowControls />);
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("renders nothing in a browser tab", () => {
    withoutTauri(() => {
      const view = render(<WindowControls />);
      expect(view.container).toBeEmptyDOMElement();
      expect(document.querySelector("[data-window-resize-handle]")).toBeNull();
    });
  });

  it("opens the startup screen in a browser tab without window buttons", () => {
    withoutTauri(() => {
      render(<StartupView />);
      expect(screen.getByRole("heading", { name: "Preparing Shenron Studio" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Minimize" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    });
  });
});

describe("site locale", () => {
  it("maps the three site locales to the editor languages", () => {
    expect(editorLanguage("fr")).toBe("fr-FR");
    expect(editorLanguage("en")).toBe("en-US");
    expect(editorLanguage("ja")).toBe("ja-JP");
    expect(editorLanguage("de")).toBeUndefined();
    expect(editorLanguage(undefined)).toBeUndefined();
    expect(editorLanguage("constructor")).toBeUndefined();
  });

  it("follows the locale of the site and each change of it", async () => {
    const view = renderHook(({ locale }) => useSiteLocale(locale), {
      initialProps: { locale: "ja" as string | undefined },
    });
    expect(i18n.language).toBe("ja-JP");
    expect(i18n.t("start.title")).toBe("プロジェクト");

    view.rerender({ locale: "fr" });
    expect(i18n.language).toBe("fr-FR");
    expect(i18n.t("startup.opening")).toBe("Ouverture de Shenron Studio…");

    // An unknown or missing locale keeps the language in use.
    view.rerender({ locale: "de" });
    expect(i18n.language).toBe("fr-FR");
    view.rerender({ locale: undefined });
    expect(i18n.language).toBe("fr-FR");

    view.rerender({ locale: "en" });
    expect(i18n.language).toBe("en-US");
    await i18n.changeLanguage("en-US");
  });
});

describe("product name", () => {
  it("ships French, English and Japanese complete", () => {
    for (const language of ["fr-FR", "en-US", "ja-JP"] as const) {
      expect(Object.keys(resources), language).toContain(language);
      expect(resources[language].translation.app.name).toBe("Shenron Studio");
    }
    expect(resources["fr-FR"].translation.languages["fr-FR"]).toBe("Français");
  });

  it("never takes the engine channel from the Tauri-only module", async () => {
    const files = [
      ...new Bun.Glob("src/koharu/**/*.{ts,tsx}").scanSync(
        Bun.fileURLToPath(new URL("../../../", import.meta.url)),
      ),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = await Bun.file(new URL(`../../../${file}`, import.meta.url)).text();
      if (/import\s*\{[^}]*\bChannel\b[^}]*\}\s*from\s*"@aphrody\/api\/core"/.test(text)) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });
});
