#!/usr/bin/env bun
/**
 * Produit le contrat multilingue commun de Shenron.
 *
 * Le script ne traduit jamais automatiquement du contenu éditorial : il fusionne
 * les arbres de clés existants, signale les écarts et génère un rapport stable
 * consommable par le site, le bot, la configuration, la DB et Shenron Studio.
 *
 * Usage: bun scripts/i18n/complete-contract.ts [--out var/reports/i18n/contract.json]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type LocaleFile = { domain: string; locale: string; path: string; value: Json };

const root = process.cwd();
const output = option("out") ?? join("var", "reports", "i18n", "contract.json");
const localeRoots = [
  join(root, "apps", "site", "messages"),
  join(root, "packages", "ui", "src", "koharu", "locales"),
];
const files = await findJsonFiles(localeRoots);
const entries: LocaleFile[] = [];
for (const path of files) {
  const locale = localeFromPath(path);
  if (!locale) continue;
  const value = JSON.parse(await Bun.file(path).text()) as Json;
  entries.push({ domain: domainFromPath(path), locale, path: relative(root, path), value });
}

const domains = new Map<string, Map<string, Set<string>>>();
for (const entry of entries) {
  const locales = domains.get(entry.domain) ?? new Map<string, Set<string>>();
  locales.set(entry.locale, new Set(flattenKeys(entry.value)));
  domains.set(entry.domain, locales);
}

const report = {
  generatedAt: new Date().toISOString(),
  // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
  locales: [...new Set(entries.map((entry) => entry.locale))].sort(),
  // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
  domains: [...domains.entries()].sort().map(([domain, locales]) => {
    // oxlint-disable-next-line oxc/no-map-spread -- immutable copy intended
    const union = new Set([...locales.values()].flatMap((keys) => [...keys]));
    return {
      domain,
      keys: union.size,
      // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
      locales: [...locales.entries()].sort().map(([locale, keys]) => ({
        locale,
        keys: keys.size,
        // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
        missing: [...union].filter((key) => !keys.has(key)).sort(),
        // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
        extra: [...keys].filter((key) => !union.has(key)).sort(),
      })),
    };
  }),
};

const missing = report.domains.flatMap((domain) =>
  domain.locales.flatMap((locale) =>
    locale.missing.map((key) => `${domain.domain}/${locale.locale}:${key}`),
  ),
);
await mkdir(dirname(join(root, output)), { recursive: true });
await Bun.write(join(root, output), `${JSON.stringify(report, null, 2)}\n`);
console.log(`i18n contract: ${entries.length} fichiers, ${missing.length} clés manquantes`);
if (missing.length > 0) {
  console.log(missing.slice(0, 20).join("\n"));
  if (missing.length > 20) console.log(`… +${missing.length - 20}`);
  process.exitCode = 1;
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

async function findJsonFiles(roots: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const base of roots) {
    try {
      for await (const entry of new Bun.Glob("**/*.json").scan({ cwd: base, absolute: true }))
        found.push(entry);
    } catch {
      // Un domaine absent reste documenté par les domaines présents.
    }
  }
  // oxlint-disable-next-line unicorn/no-array-sort -- array is a local copy or sorted in place on purpose
  return found.sort();
}

function localeFromPath(path: string): string | undefined {
  const name = path
    .split(/[\\/]/)
    .at(-1)
    ?.replace(/\.json$/, "");
  const directory = path.split(/[\\/]/).at(-2);
  if (directory && /^(?:[a-z]{2}(?:-[A-Z]{2})?)$/.test(directory)) return directory;
  return name && /^(?:[a-z]{2}(?:-[A-Z]{2})?)$/.test(name) ? name : undefined;
}

function domainFromPath(path: string): string {
  return path.includes(`${join("packages", "ui", "src", "koharu")}`) ? "koharu" : "site";
}

function flattenKeys(value: Json, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}
