// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  checkNoEscapingImports,
  checkPackageRuntimes,
  importSpecifiers,
  stripNonCode,
} from "@shenron/config/guards";

const PKG_DIR = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as {
  exports: Record<string, string>;
  shenron: { runtime: Record<string, string> };
  sideEffects: boolean;
  private: boolean;
};

/** Exports and runtime classes of docs/architecture/STACK.md §3.6. */
const RUNTIME: Record<string, string> = {
  "./contract": "pure",
  "./client": "pure",
  "./http": "pure",
  "./server": "server",
  "./next": "server",
  "./chat": "bun",
  "./host": "bun",
  "./plugin": "server",
  "./openapi.json": "json",
};

/** Doctrine subpaths of `@shenron/pipeline` that `./chat` and `./host` may import (§4.1). */
const PIPELINE_SUBPATHS = new Set(["@shenron/pipeline/ai/prompts", "@shenron/pipeline/agent-home"]);

/** Source files reached from an export through relative imports (type-only ones included). */
function closure(key: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { specifier } of importSpecifiers(readFileSync(file, "utf8"))) {
      if (!specifier.startsWith(".")) continue;
      const base = join(dirname(file), specifier);
      const target = [`${base}.ts`, join(base, "index.ts")].find((candidate) =>
        existsSync(candidate),
      );
      if (target) visit(target);
    }
  };
  visit(join(PKG_DIR, manifest.exports[key]!));
  return [...seen];
}

/** Bare specifiers imported anywhere in the closure of an export, with the importing file. */
function bareImports(key: string): { file: string; specifier: string; typeOnly: boolean }[] {
  return closure(key).flatMap((file) =>
    importSpecifiers(readFileSync(file, "utf8"))
      .filter(({ specifier }) => !specifier.startsWith("."))
      .map((ref) => ({ file: relative(PKG_DIR, file), ...ref })),
  );
}

describe("@shenron/api manifest", () => {
  test("exports and runtime classes of docs/architecture/STACK.md §3.6, no root export", () => {
    expect(manifest.exports).not.toHaveProperty(".");
    expect(Object.keys(manifest.exports).toSorted()).toEqual(Object.keys(RUNTIME).toSorted());
    expect(manifest.shenron.runtime).toEqual(RUNTIME);
    expect(manifest.private).toBe(true);
    expect(manifest.sideEffects).toBe(false);
  });

  for (const key of ["./contract", "./client", "./http"]) {
    test(`${key}: pure (no node:, bun, process, Bun., next)`, async () => {
      const runtime = bareImports(key).filter(({ typeOnly }) => !typeOnly);
      expect(
        runtime.filter(({ specifier }) =>
          /^(?:node:|bun(?::|$)|next(?:\/|$)|hono|@hono\/)/.test(specifier),
        ),
      ).toEqual([]);
      for (const file of closure(key)) {
        expect(stripNonCode(readFileSync(file, "utf8"))).not.toMatch(
          /\bprocess\.|\bBun\.|\bimport\.meta\b/,
        );
      }
      const mod = (await import(join(PKG_DIR, manifest.exports[key]!))) as Record<string, unknown>;
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  }

  test("./server and ./next never import next, server-only, DI containers, discord.js or bun at runtime", () => {
    for (const key of ["./server", "./next"]) {
      const offending = bareImports(key).filter(
        ({ specifier, typeOnly }) =>
          /^(?:next(?:\/|$)|server-only$|tsyringe$|@aphrody\/di$|discord\.js$)/.test(specifier) ||
          (!typeOnly && /^bun(?::|$)/.test(specifier)),
      );
      expect(offending).toEqual([]);
      for (const file of closure(key)) {
        const code = stripNonCode(readFileSync(file, "utf8"));
        expect(code).not.toContain("container.resolve");
        expect(code).not.toMatch(/(?<![\w$.])Bun\s*\./);
      }
    }
  });

  test("only ./chat and ./host reach @shenron/pipeline (§4.1), through its doctrine subpaths", () => {
    for (const key of ["./contract", "./client", "./http", "./server", "./next"]) {
      expect(
        bareImports(key).filter(({ specifier }) => specifier.startsWith("@shenron/pipeline")),
      ).toEqual([]);
    }
    const reached = ["./chat", "./host"].flatMap((key) =>
      bareImports(key).filter(({ specifier }) => specifier.startsWith("@shenron/pipeline")),
    );
    expect(reached.length).toBeGreaterThan(0);
    expect(reached.filter(({ specifier }) => !PIPELINE_SUBPATHS.has(specifier))).toEqual([]);
  });

  test("./openapi.json is valid JSON", () => {
    const doc = JSON.parse(
      readFileSync(join(PKG_DIR, manifest.exports["./openapi.json"]!), "utf8"),
    );
    expect(doc.openapi).toBe("3.1.0");
  });

  test("runtime-class guard and escaping-import guard are clean", async () => {
    expect(await checkPackageRuntimes(PKG_DIR)).toEqual([]);
    expect(await checkNoEscapingImports(PKG_DIR)).toEqual([]);
  }, 60_000);
});
