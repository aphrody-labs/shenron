import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The renderer draws texts it is given: no visible string may live in `src/render`
 * (the sample texts of `fixtures.ts` and the CLI scripts are not part of the module).
 */
const ROOT = join(import.meta.dir, "..", "src", "render");
const NOT_MODULE = /(^|[\\/])(fixtures|preview|build-assets|generate-tokens)\.ts$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") && !NOT_MODULE.test(path) && !path.endsWith(".generated.ts")
      ? [path]
      : [];
  });
}

/** Source without comments, so the doc comments may speak any language. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const LITERAL = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
const UI_WORDS =
  /\b(niveau|level|rang|rank|zeni|messages?|exp[eé]rience|victoire|victory|d[eé]faite|defeat|page|palier|tier|boutique|shop|solde|balance|classement|leaderboard|vies|essais|fusion[a-z]*|fused|combattants?|transformation)\b/i;

describe("the renderer contains no visible text", () => {
  const files = sources(ROOT);

  test("the module has sources to inspect", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test("no accented letter or non-Latin script outside comments", () => {
    for (const file of files) {
      // `…` and friends are escapes in the source, so a raw non-ASCII letter is real text
      const offenders = code(file).match(/[^\t\n\r -~]/g);
      expect(offenders, file).toBeNull();
    }
  });

  test("no UI word in a string literal (import paths excluded)", () => {
    for (const file of files) {
      for (const match of code(file).matchAll(LITERAL)) {
        // interpolated expressions are code, not text
        const literal = (match[1] ?? match[2] ?? match[3] ?? "").replace(/\$\{[^}]*\}/g, "");
        if (/^(\.|~|@|node:|bun:)/.test(literal)) continue;
        expect(UI_WORDS.test(literal), `${file}: ${literal}`).toBe(false);
      }
    }
  });
});
