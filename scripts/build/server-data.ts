// SPDX-License-Identifier: Apache-2.0
/**
 * Public editorial data of the `shenron-server` payload (`data/`), beside the site, the native
 * library, the public VFS and the agent home template, and the guard that keeps private files
 * out of the release tree.
 *
 * Only the files listed here ship. `data/` otherwise holds private material (databases,
 * corpora, `data/home/`), so nothing is copied by pattern and each listed file is checked first.
 *
 * - `lexique-db-canonique.json`: the canonical Dragon Ball lexicon (`ja` → `fr`, versioned).
 *   With the `koharu` feature, `shenron-manga` installs it as Koharu's glossary for French
 *   translation (looked up through `SHENRON_LEXIQUE`, then
 *   `$SHENRON_HOME/data/lexique-db-canonique.json`, then `./data/lexique-db-canonique.json`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LEXIQUE_FILE = "lexique-db-canonique.json";

/** Fields of a lexicon entry; any other field could carry what the public build must not. */
const LEXIQUE_FIELDS: Readonly<Record<string, "string" | "number">> = {
  ja: "string",
  fr: "string",
  kind: "string",
  length: "number",
};

/** Why `path` cannot ship as the public canonical lexicon (empty when it can). */
export function lexiqueProblems(path: string): string[] {
  if (!existsSync(path)) return [`missing ${path}`];
  let entries: unknown;
  try {
    entries = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return [`not JSON: ${String(error)}`];
  }
  if (!Array.isArray(entries)) return ["not an array of entries"];
  if (entries.length === 0) return ["no entry"];
  const problems: string[] = [];
  entries.forEach((entry: unknown, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`entry ${index} is not an object`);
      return;
    }
    const fields = entry as Record<string, unknown>;
    for (const name of ["ja", "fr"])
      if (typeof fields[name] !== "string" || !(fields[name] as string).trim())
        problems.push(`entry ${index} has no ${name}`);
    for (const [name, value] of Object.entries(fields)) {
      const type = LEXIQUE_FIELDS[name];
      if (!type) problems.push(`entry ${index} has an unexpected field ${name}`);
      else if (typeof value !== type) problems.push(`entry ${index}: ${name} is not a ${type}`);
    }
  });
  return problems.length > 10
    ? [...problems.slice(0, 10), `… ${problems.length - 10} more`]
    : problems;
}

/** Copy the public data files of `<root>/data` into `outDir` once checked; returns their names. */
export function stagePublicData(root: string, outDir: string): string[] {
  const source = join(root, "data", LEXIQUE_FILE);
  const problems = lexiqueProblems(source);
  if (problems.length)
    throw new Error(`data/${LEXIQUE_FILE} cannot ship in a public payload: ${problems.join("; ")}`);
  mkdirSync(outDir, { recursive: true });
  cpSync(source, join(outDir, LEXIQUE_FILE));
  return [LEXIQUE_FILE];
}

/** Databases, environment files and keys under `dir` (paths relative to it). */
export function privateFiles(dir: string): string[] {
  const forbidden = new Bun.Glob("**/*.{db,db-wal,db-shm,sqlite,sqlite3,pem,key,p12,pfx}");
  return [
    ...forbidden.scanSync({ cwd: dir, dot: true }),
    ...new Bun.Glob("**/.env*").scanSync({ cwd: dir, dot: true }),
  ];
}
