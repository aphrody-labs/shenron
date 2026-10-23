import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";
import en from "../src/locales/en.json";
import fr from "../src/locales/fr.json";
import ja from "../src/locales/ja.json";
import {
  botLang,
  discordLocalizations,
  interactionLang,
  t,
  tn,
  tryT,
  type BotLang,
} from "../src/lib/i18n";

const DICTIONARIES: Record<BotLang, unknown> = { fr, en, ja };
const LANGS = Object.keys(DICTIONARIES) as BotLang[];

/** Every leaf of a dictionary as `dotted.key → text`. */
function leaves(node: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      for (const [k, v] of leaves(value, prefix ? `${prefix}.${key}` : key)) out.set(k, v);
    }
  } else {
    out.set(prefix, node);
  }
  return out;
}

const flat = Object.fromEntries(LANGS.map((lang) => [lang, leaves(DICTIONARIES[lang])])) as Record<
  BotLang,
  Map<string, unknown>
>;
const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).toSorted();

describe("dictionary parity (fr = reference, en and ja complete)", () => {
  test("the three dictionaries define exactly the same keys", () => {
    const reference = [...flat.fr.keys()].toSorted();
    for (const lang of ["en", "ja"] as const) {
      const keys = new Set(flat[lang].keys());
      const missing = reference.filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !flat.fr.has(key));
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] });
    }
  });

  test("every text is a non-empty string", () => {
    for (const lang of LANGS) {
      for (const [key, value] of flat[lang]) {
        expect(typeof value, `${lang}:${key}`).toBe("string");
        // A separator may legitimately be empty (Japanese joins durations without a space).
        if (!key.endsWith(".separator")) {
          expect((value as string).trim().length, `${lang}:${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  test("a text uses the same {placeholders} in every language", () => {
    for (const [key, value] of flat.fr) {
      const expected = placeholders(value as string);
      for (const lang of ["en", "ja"] as const) {
        expect(placeholders(flat[lang].get(key) as string), `${lang}:${key}`).toEqual(expected);
      }
    }
  });

  test("a plural group has `one` and `other` in every language", () => {
    const groups = [...flat.fr.keys()]
      .filter((key) => key.endsWith(".other"))
      .map((key) => key.slice(0, -".other".length));
    expect(groups.length).toBeGreaterThan(3);
    for (const group of groups) {
      for (const lang of LANGS) {
        expect(flat[lang].has(`${group}.one`), `${lang}:${group}.one`).toBe(true);
        expect(flat[lang].has(`${group}.other`), `${lang}:${group}.other`).toBe(true);
      }
    }
  });

  test("every dictionary key the UI kit and the pilot command reference exists", async () => {
    const root = join(import.meta.dir, "../src");
    const files = [
      ...(await Array.fromAsync(new Glob("ui/**/*.ts").scan({ cwd: root }))),
      "commands/admin/Help.ts",
    ];
    const used = new Set<string>();
    // Custom id namespaces share the `ui.` prefix but are not dictionary keys.
    const namespaces = new Set(["ui.pg", "ui.cf", "ui.sh"]);
    for (const file of files) {
      const source = await Bun.file(join(root, file)).text();
      for (const match of source.matchAll(
        /["'`]((?:ui|help|commands)\.[A-Za-z][A-Za-z0-9.]*)["'`]/g,
      )) {
        if (!namespaces.has(match[1]!)) used.add(match[1]!);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) {
      const exact = flat.fr.has(key);
      const plural = flat.fr.has(`${key}.other`);
      expect(exact || plural, `unknown dictionary key "${key}"`).toBe(true);
    }
  });
});

describe("Discord limits on the texts the UI kit puts in components", () => {
  test("button labels, modal titles and labels, command descriptions", () => {
    for (const lang of LANGS) {
      const get = (key: string, vars: Record<string, string | number> = {}) =>
        tryT(lang, key, vars)!;
      for (const key of ["previous", "next", "confirm", "cancel", "share"]) {
        expect(get(`ui.button.${key}`).length, `${lang}:${key}`).toBeLessThanOrEqual(80);
      }
      expect(get("ui.button.page", { page: 9999, total: 9999 }).length).toBeLessThanOrEqual(80);
      expect(get("ui.modal.goToTitle").length, `${lang} modal title`).toBeLessThanOrEqual(45);
      expect(
        get("ui.modal.goToLabel", { max: 9999 }).length,
        `${lang} modal label`,
      ).toBeLessThanOrEqual(45);
      expect(get("commands.help.description").length, `${lang} description`).toBeLessThanOrEqual(
        100,
      );
      expect(get("help.placeholder").length + 3).toBeLessThanOrEqual(150);
    }
  });

  test("help category titles and descriptions fit a select option (100)", () => {
    for (const lang of LANGS) {
      for (const [key, value] of flat[lang]) {
        if (key.startsWith("help.category.") || key.startsWith("help.home.")) {
          expect((value as string).length, `${lang}:${key}`).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe("interaction language", () => {
  test("fr, en and ja locales resolve; anything else is French", () => {
    expect(interactionLang({ locale: "fr" })).toBe("fr");
    expect(interactionLang({ locale: "en-US" })).toBe("en");
    expect(interactionLang({ locale: "en-GB" })).toBe("en");
    expect(interactionLang({ locale: "ja" })).toBe("ja");
    for (const locale of ["de", "zh-CN", "pt-BR", "", null, undefined]) {
      expect(interactionLang({ locale })).toBe("fr");
    }
    expect(interactionLang({})).toBe("fr");
    expect(interactionLang({ locale: "EN-us" })).toBe(botLang("EN-us"));
  });

  test("discordLocalizations gives the fr and ja texts for nameLocalizations", () => {
    expect(discordLocalizations("commands.help.description")).toEqual({
      fr: fr.commands.help.description,
      ja: ja.commands.help.description,
    });
    expect(discordLocalizations("ui.modal.goToLabel", { max: 3 })).toEqual({
      fr: "Numéro de page (1 à 3)",
      ja: "ページ番号（1〜3）",
    });
  });

  test("plurals of the help counters follow each language", () => {
    expect(tn("fr", "help.active", 0)).toBe("0 commande active");
    expect(tn("fr", "help.active", 1)).toBe("1 commande active");
    expect(tn("fr", "help.active", 2)).toBe("2 commandes actives");
    expect(tn("en", "help.active", 1)).toBe("1 active command");
    expect(tn("en", "help.active", 1234)).toBe("1,234 active commands");
    expect(tn("ja", "help.active", 5)).toBe("有効なコマンド5件");
    expect(t("en", "help.links.site")).toBe("Official site");
  });
});
