/**
 * Every interface key the code asks for exists in the reference dictionary (and so in en/ja,
 * which `i18n.test.ts` holds equal to fr). An absent key renders nothing: a button or a badge
 * turns into an empty pill (the Top 3 podium, 2026-10-06).
 *
 * Read statically, namespaces included:
 *  - `<T k="a.b" />`, `t("a.b")` / `t.rich(...)` where `t = useT()` → `a.b`;
 *  - `t = useTranslations("ns")` / `await getTranslations("ns")` → `ns.<key>`, the nearest
 *    preceding binding of the same name in the file;
 *  - `…Key: "a.b"` / `…Key = "a.b"` constants handed to `<T k={…} />` later.
 * Template-literal keys are dynamic and not checked here.
 * Feature hooks aliased as useT use their registered dictionaries plus shared root keys.
 */
import { describe, expect, test } from "bun:test";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const read = async (lang: string) =>
  (await Bun.file(path.join(root, `messages/${lang}.json`)).json()) as Record<string, unknown>;
const fr = await read("fr");
const dictionaries = { fr, en: await read("en"), ja: await read("ja") };
const featureModules = {
  "wiki-admin-text": "wiki-admin",
  "wiki-explorer-text": "wiki-explorer",
} as const;
const featureDictionaries: Record<string, Record<string, Record<string, unknown>>> = {};
for (const feature of Object.values(featureModules)) {
  featureDictionaries[feature] = {};
  for (const lang of ["fr", "en", "ja"])
    featureDictionaries[feature]![lang] = await Bun.file(
      path.join(root, "messages", feature, `${lang}.json`),
    ).json();
}
const featureByFile = new Map<string, string>();

function exists(key: string, dictionary: Record<string, unknown> = fr): boolean {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return node !== undefined;
}

const KEY = String.raw`[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*`;

async function usedKeys(): Promise<Map<string, { key: string; file: string }>> {
  const used = new Map<string, { key: string; file: string }>();
  const add = (key: string, file: string) => {
    used.set(`${file}\0${key}`, { key, file });
  };
  for await (const file of new Bun.Glob("src/**/*.{ts,tsx}").scan(root)) {
    const code = (await Bun.file(path.join(root, file)).text())
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // Feature hooks aliased as useT resolve their own namespace and shared root strings.
    for (const [module, feature] of Object.entries(featureModules))
      if (
        new RegExp(
          String.raw`import\s*\{\s*\w+\s+as\s+useT\s*\}\s*from\s*["'][^"']*/${module}["']`,
        ).test(code)
      )
        featureByFile.set(file, feature);
    // Bindings: name → [position, namespace ("" for useT)].
    const bindings: { name: string; at: number; ns: string }[] = [];
    for (const m of code.matchAll(
      /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)"|\{\s*namespace:\s*"([^"]*)"[^}]*\})?\s*\)/g,
    ))
      bindings.push({ name: m[1]!, at: m.index!, ns: m[2] ?? m[3] ?? "" });
    for (const m of code.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*useT\(\)/g))
      bindings.push({ name: m[1]!, at: m.index!, ns: "" });
    for (const m of code.matchAll(new RegExp(String.raw`<T\s+k="(${KEY})"`, "g"))) add(m[1]!, file);
    for (const name of new Set(bindings.map((b) => b.name))) {
      const re = new RegExp(String.raw`\b${name}(?:\.rich|\.markup|\.raw)?\(\s*"(${KEY})"`, "g");
      for (const m of code.matchAll(re)) {
        const binding = bindings
          .filter((b) => b.name === name && b.at < m.index!)
          .toSorted((a, b) => b.at - a.at)[0];
        if (!binding) continue;
        add(binding.ns ? `${binding.ns}.${m[1]}` : m[1]!, file);
      }
    }
    for (const m of code.matchAll(
      new RegExp(String.raw`\b\w*[kK]ey\s*[:=]\s*"(${KEY}\.${KEY})"`, "g"),
    )) {
      const top = m[1]!.split(".")[0]!;
      if (top in fr) add(m[1]!, file);
    }
  }
  return used;
}

describe("i18n keys", () => {
  test("every key used by the code exists in fr, en and ja", async () => {
    const used = [...(await usedKeys()).values()];
    expect(used.length).toBeGreaterThan(500);
    for (const [lang, dictionary] of Object.entries(dictionaries)) {
      const missing = used
        .filter(({ key, file }) => {
          const feature = featureByFile.get(file);
          const local = feature ? featureDictionaries[feature]?.[lang] : undefined;
          return !exists(key, local ? { ...dictionary, ...local } : dictionary);
        })
        .map(({ key, file }) => `${lang}: ${key}  (${file})`);
      expect(missing).toEqual([]);
    }
  });
});
