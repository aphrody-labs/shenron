// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PKG_DIR = join(import.meta.dir, "../..");
const manifest = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8")) as {
  exports: Record<string, string>;
  shenron: { runtime: Record<string, string> };
  sideEffects: boolean;
  private: boolean;
};

const SUBPATHS = [
  "./ai",
  ...[
    "config",
    "wire",
    "aphrody",
    "embeddings",
    "chat",
    "provider",
    "prompts",
    "generate",
    "grounding",
    "eval",
    "ports",
    "canon-judgment",
  ].map((name) => `./ai/${name}`),
];

/** Pure AI sources kept off the export map (reached through package-internal imports only). */
const INTERNAL_PURE_SOURCES = ["./src/ai/training-hashes.ts", "./src/ai/canon-eval.ts"];

describe("@aphrody/shenron-pipeline/ai manifest", () => {
  test("exports every subpath of docs/architecture/STACK.md §3.4 with its runtime class", () => {
    expect(
      Object.keys(manifest.exports)
        .filter((key) => key === "./ai" || key.startsWith("./ai/"))
        .toSorted(),
    ).toEqual(
      [
        ...SUBPATHS,
        "./ai/native",
        "./ai/jev-provider",
        "./ai/vector-reader",
        "./ai/vector-sidecar",
      ].toSorted(),
    );
    expect(manifest.shenron.runtime["./ai/native"]).toBe("bun");
    expect(manifest.shenron.runtime["./ai/jev-provider"]).toBe("bun");
    expect(manifest.shenron.runtime["./ai/vector-reader"]).toBe("bun");
    expect(manifest.shenron.runtime["./ai/vector-sidecar"]).toBe("bun");
    // These three load the `ai` runtime, whose @ai-sdk/provider-utils bundle carries a
    // guarded `process.getBuiltinModule("node:module")` string that the browser-purity
    // check rejects. They are server-only targets (Next server, bot, scripts) anyway;
    // their own source stays pure (checked below).
    const serverOnly = new Set(["./ai/embeddings", "./ai/provider", "./ai/generate"]);
    for (const key of SUBPATHS) {
      expect(manifest.shenron.runtime[key]).toBe(serverOnly.has(key) ? "server" : "pure");
    }
    expect(manifest.private).toBe(false);
    expect(manifest.sideEffects).toBe(false);
  });

  const pureSources = [
    ...SUBPATHS.map((key) => [key, manifest.exports[key] ?? "missing"] as const),
    ...INTERNAL_PURE_SOURCES.map((path) => [path, path] as const),
  ];
  for (const [key, path] of pureSources) {
    test(`${key}: pure source (no node:, bun:, process, Bun., host literal)`, async () => {
      const file = join(PKG_DIR, path);
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(source).not.toMatch(/from\s+["'](?:node:|bun(?::|["']))/);
      expect(source).not.toMatch(/\bprocess\.|\bBun\.|\bimport\.meta\b/);
      expect(source).not.toMatch(
        /@aphrody\/shenron-(?:pipeline\/aphrody|db)|sqlite|redis|@huggingface/i,
      );
      expect(source).not.toMatch(/127\.0\.0\.1|localhost/);
      const mod = (await import(file)) as Record<string, unknown>;
      expect(Object.keys(mod).length).toBeGreaterThan(0);
    });
  }
});
