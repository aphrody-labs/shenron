// SPDX-License-Identifier: Apache-2.0
/** What each side may import: the browser bundle never reaches server code, and the server never React. */
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function imports(dir: string, pattern: string): Array<{ file: string; specifier: string }> {
  const found: Array<{ file: string; specifier: string }> = [];
  for (const file of new Glob(pattern).scanSync({ cwd: join(ROOT, dir) })) {
    const text = readFileSync(join(ROOT, dir, file), "utf8");
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))
      found.push({ file: `${dir}/${file}`, specifier: match[1]! });
  }
  return found;
}

describe("client bundle", () => {
  const CLIENT_ALLOWED = [
    /^\.\.?\//, // relative
    /^react(?:-dom(?:\/client)?)?$/,
    /^@discord\/embedded-app-sdk$/,
    /^@aphrody\/shenron-activity\/(?:protocol|i18n)$/, // pure: zod schemas and dictionaries
    /^virtual:shenron-tokens\.css$/,
    /^@aphrody\/shenron-ui\/assets\/[a-z/-]+\.svg$/, // brand images, bundled as files
  ];

  test("imports only the browser-safe packages", () => {
    const all = imports("client", "**/*.{ts,tsx}");
    expect(all.length).toBeGreaterThan(20);
    const offences = all.filter(
      ({ specifier }) => !CLIENT_ALLOWED.some((allowed) => allowed.test(specifier)),
    );
    expect(offences).toEqual([]);
  });

  test("reaches no Node or Bun API", () => {
    for (const file of new Glob("**/*.{ts,tsx}").scanSync({ cwd: join(ROOT, "client") })) {
      const text = readFileSync(join(ROOT, "client", file), "utf8");
      expect(text).not.toMatch(/\bBun\./);
      expect(text).not.toMatch(/\bprocess\.env\b/);
      expect(text).not.toMatch(/from ["']node:/);
    }
  });

  test("reaches other workspaces through their package exports, never by relative path", () => {
    const outside = imports("client", "**/*.{ts,tsx}").filter(({ specifier }) =>
      specifier.startsWith("../../"),
    );
    expect(outside).toEqual([]);
  });
});

describe("server", () => {
  test("never imports React, the client, or the stand-in SDK", () => {
    for (const { specifier } of imports("src", "**/*.ts")) {
      expect(specifier).not.toMatch(/^react/);
      expect(specifier).not.toMatch(/client|fake-sdk|mock-bots/);
      expect(specifier).not.toBe("@discord/embedded-app-sdk");
    }
  });

  test("development identities are reachable only through the configuration switch", () => {
    const users = imports("src", "**/*.ts").filter(({ specifier }) =>
      /auth\/dev$|\.\/dev$/.test(specifier),
    );
    expect(users.map(({ file }) => file)).toEqual(["src/server.ts"]);
    const server = readFileSync(join(ROOT, "src", "server.ts"), "utf8");
    expect(server).toMatch(/config\.devAuth\s*\?\s*createDevPort\(\)/);
  });

  test("reads secrets from the environment only, never from a literal", () => {
    for (const file of new Glob("**/*.ts").scanSync({ cwd: join(ROOT, "src") })) {
      const text = readFileSync(join(ROOT, "src", file), "utf8");
      expect(text).not.toMatch(/client_secret\s*[:=]\s*["'][^"']{6,}["']/);
    }
  });
});
