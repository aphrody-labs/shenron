// SPDX-License-Identifier: Apache-2.0
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { pack } from "../../apps/server/src/payload";
import { LEXIQUE_FILE, lexiqueProblems, privateFiles, stagePublicData } from "./server-data";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = mkdtempSync(join(tmpdir(), "shenron-server-data-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function lexique(name: string, content: unknown): string {
  const path = join(scratch, name);
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

describe("public payload data", () => {
  test("the versioned canonical lexicon can ship", () => {
    expect(lexiqueProblems(join(ROOT, "data", LEXIQUE_FILE))).toEqual([]);
  });

  test("only the lexicon is staged, byte for byte, and it travels in the payload under data/", () => {
    const out = join(scratch, "stage", "data");
    expect(stagePublicData(ROOT, out)).toEqual([LEXIQUE_FILE]);
    expect(readdirSync(out)).toEqual([LEXIQUE_FILE]);
    const original = readFileSync(join(ROOT, "data", LEXIQUE_FILE));
    expect(readFileSync(join(out, LEXIQUE_FILE)).equals(original)).toBe(true);
    // The payload keeps the archive prefix: extracted as <payload>/data/lexique-db-canonique.json.
    const raw = Bun.zstdDecompressSync(pack({ data: out }, 1));
    expect(new TextDecoder().decode(raw)).toContain(`"path":"data/${LEXIQUE_FILE}"`);
  });

  test("a lexicon that is not a list of ja/fr entries is refused", () => {
    expect(lexiqueProblems(join(scratch, "absent.json"))[0]).toStartWith("missing");
    expect(lexiqueProblems(lexique("broken.json", "{"))[0]).toStartWith("not JSON");
    expect(lexiqueProblems(lexique("object.json", { ja: "悟空", fr: "Goku" }))).toEqual([
      "not an array of entries",
    ]);
    expect(lexiqueProblems(lexique("empty.json", []))).toEqual(["no entry"]);
    expect(
      lexiqueProblems(
        lexique("entries.json", [
          { ja: "悟空", fr: "Goku", kind: "personnage", length: 2 },
          { ja: "ベジータ", fr: " " },
          { ja: "ピッコロ", fr: "Piccolo", length: "4" },
          { ja: "ブルマ", fr: "Bulma", email: "x@gemini.google.com" },
          "クリリン",
        ]),
      ),
    ).toEqual([
      "entry 1 has no fr",
      "entry 2: length is not a number",
      "entry 3 has an unexpected field email",
      "entry 4 is not an object",
    ]);
  });

  test("staging refuses an invalid lexicon instead of shipping it", () => {
    const root = join(scratch, "bad-root");
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(join(root, "data", LEXIQUE_FILE), JSON.stringify([{ ja: "悟空" }]));
    expect(() => stagePublicData(root, join(root, "out"))).toThrow("cannot ship");
  });

  test("databases, environment files and keys are reported as private", () => {
    const dir = join(scratch, "tree");
    mkdirSync(join(dir, "nested"), { recursive: true });
    for (const name of ["bot.db", "nested/shenron-vfs.sqlite", ".env.local", "nested/tls.key"])
      writeFileSync(join(dir, name), "x");
    writeFileSync(join(dir, LEXIQUE_FILE), "[]");
    expect(
      privateFiles(dir)
        .map((file) => file.replaceAll("\\", "/"))
        .toSorted(),
    ).toEqual([".env.local", "bot.db", "nested/shenron-vfs.sqlite", "nested/tls.key"].toSorted());
  });
});
