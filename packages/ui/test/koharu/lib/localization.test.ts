import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

import { resources, supportedLanguages } from "@shenron/ui/koharu/lib/i18n";
import { orderedLanguageChoices } from "@shenron/ui/koharu/lib/translation";

const localesDir = fileURLToPath(new URL("../../../src/koharu/locales/", import.meta.url));

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return item && typeof item === "object" ? keys(item, path) : [path];
  });
}

function strings(value: object, prefix = ""): Array<[string, string]> {
  return Object.entries(value).flatMap(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof item === "string" ? [[path, item]] : strings(item, path);
  });
}

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/{{\s*([^},\s]+).*?}}/g), ([, name]) => name).toSorted();
}

describe("editor localization", () => {
  it("speaks exactly the three locales of the site, French first", () => {
    expect(Object.keys(resources)).toEqual(["fr-FR", "en-US", "ja-JP"]);
    expect(supportedLanguages).toEqual(["fr-FR", "en-US", "ja-JP"]);
    expect(Object.keys(resources["fr-FR"].translation.languages).toSorted()).toEqual(
      [...supportedLanguages].toSorted(),
    );
    const files = [...new Bun.Glob("*/translation.json").scanSync(localesDir)]
      .map((file) => file.replaceAll("\\", "/"))
      .toSorted();
    expect(files).toEqual(
      supportedLanguages.toSorted().map((language) => `${language}/translation.json`),
    );
  });

  it("defines in every locale exactly the keys of French, the reference", () => {
    const reference = keys(resources["fr-FR"].translation).toSorted();
    for (const [locale, resource] of Object.entries(resources)) {
      expect("native" in resource.translation, locale).toBe(false);
      const own = keys(resource.translation).toSorted();
      expect(
        reference.filter((key) => !own.includes(key)),
        `${locale}: missing keys`,
      ).toEqual([]);
      expect(
        own.filter((key) => !reference.includes(key)),
        `${locale}: extra keys`,
      ).toEqual([]);
    }
  });

  it("shows the product name, never the code name, in any visible string", () => {
    for (const [locale, resource] of Object.entries(resources)) {
      for (const [key, value] of strings(resource.translation)) {
        expect(value, `${locale}: ${key}`).not.toMatch(/koharu/i);
      }
    }
  });

  it("keeps the code name out of the visible text of the sources", async () => {
    const root = fileURLToPath(new URL("../../../src/koharu/", import.meta.url));
    const hits: string[] = [];
    for (const file of new Bun.Glob("**/*.{ts,tsx}").scanSync(root)) {
      const text = (await Bun.file(`${root}${file}`).text())
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/^(?:import|export)\b[^;]*?\bfrom\s*"[^"]*";?/gm, "");
      // A string literal that is not a code identifier (module path, key, model id, attribute).
      for (const [literal] of text.matchAll(/"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
        if (/koharu/i.test(literal) && (/\s/.test(literal) || /Koharu/.test(literal))) {
          hits.push(`${file}: ${literal}`);
        }
      }
      // JSX text.
      for (const [jsx] of text.matchAll(/>[^<>{}=;]*koharu[^<>{}=;]*</gi))
        hits.push(`${file}: ${jsx}`);
    }
    expect(hits).toEqual([]);
  });

  it("preserves interpolation variables and valid text in every locale", () => {
    const reference = new Map(strings(resources["fr-FR"].translation));

    for (const [locale, resource] of Object.entries(resources)) {
      for (const [key, value] of strings(resource.translation)) {
        expect(value.trim(), `${locale}: ${key}`).not.toBe("");
        expect(placeholders(value), `${locale}: ${key}`).toEqual(
          placeholders(reference.get(key) ?? ""),
        );
        expect(value, `${locale}: ${key}`).not.toMatch(/[ÃƒÃ‚]|Ã¢(?:â‚¬|â„¢|Å“)|Ã¯Â¿Â½|ï¿½/);
      }
    }
  });

  it("distinguishes a font origin from source text", () => {
    for (const [locale, resource] of Object.entries(resources)) {
      expect(resource.translation.fontPicker.source, locale).not.toBe(
        resource.translation.inspector.source,
      );
    }
  });

  it("orders language choices by their displayed name without mutating the source", () => {
    const languages = [
      { tag: "ja-JP", name: "Japanese" },
      { tag: "zh-CN", name: "Simplified Chinese" },
      { tag: "en-US", name: "English" },
      { tag: "de-DE", name: "German" },
    ];

    expect(orderedLanguageChoices(languages).map((language) => language.name)).toEqual([
      "English",
      "German",
      "Japanese",
      "Simplified Chinese",
    ]);
    expect(languages.map((language) => language.name)).toEqual([
      "Japanese",
      "Simplified Chinese",
      "English",
      "German",
    ]);
  });
});
