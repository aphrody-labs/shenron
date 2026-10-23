// SPDX-License-Identifier: Apache-2.0
/** The client build: what the production bundle contains and, above all, what it does not. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClient, type BuildSummary } from "../scripts/build";
import { directoryAssets, isImmutableName } from "../src/http/assets";

let work: string;
let production: BuildSummary;
let development: BuildSummary;

const read = (summary: BuildSummary, file: string) =>
  readFileSync(join(summary.outdir, file), "utf8");

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "activity-build-"));
  production = await buildClient({ outdir: join(work, "prod") });
  development = await buildClient({ mock: true, outdir: join(work, "dev") });
}, 120_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe("production bundle", () => {
  test("is one page plus hashed files", () => {
    const names = production.files.map((file) => file.path);
    expect(names).toContain("index.html");
    for (const name of names.filter((candidate) => candidate !== "index.html"))
      expect(isImmutableName(name)).toBe(true);
    expect(names.some((name) => name.endsWith(".woff2"))).toBe(true);
    expect(names.some((name) => name.endsWith(".js"))).toBe(true);
    expect(names.some((name) => name.endsWith(".css"))).toBe(true);
  });

  test("has no trace of the stand-in SDK or the development identities", () => {
    for (const file of production.files.filter((entry) => /\.(?:js|css|html)$/.test(entry.path))) {
      const text = read(production, file.path);
      expect(text).not.toContain("mock-code-");
      expect(text).not.toContain("dev-token-");
      expect(text).not.toContain("bots=");
    }
    expect(production.files.some((file) => /fake-sdk|mock-bots/.test(file.path))).toBe(false);
  });

  test("the development bundle does have them", () => {
    const scripts = development.files.filter((file) => file.path.endsWith(".js"));
    const text = scripts.map((file) => read(development, file.path)).join("\n");
    expect(text).toContain("mock-code-");
    expect(text).toContain("dev-token-");
  });

  test("the page links the script, the stylesheets and the preloaded text face by relative URLs", () => {
    const html = read(production, "index.html");
    expect(html).toMatch(/<script type="module"[^>]* src="\.\/index-[0-9a-z]+\.js"/);
    expect(html).toMatch(/<link rel="stylesheet"[^>]* href="\.\/index-[0-9a-z]+\.css"/);
    expect(html).toMatch(/<link rel="stylesheet" href="\.\/fonts-[0-9a-f]+\.css">/);
    expect(html).toMatch(
      /<link rel="preload" href="\.\/ShenronText-Medium-[0-9a-f]+\.woff2" as="font"/,
    );
    // Nothing absolute: the Discord proxy maps `/` to this host, not `/assets`.
    expect(html).not.toMatch(/(?:src|href)="\/[^/]/);
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
  });

  test("the font rules point at files that exist, with swap", () => {
    const css = read(
      production,
      production.files.find((file) => file.path.startsWith("fonts-"))!.path,
    );
    expect(css).toContain("font-display:swap");
    for (const match of css.matchAll(/url\("\.\/([^"]+)"\)/g))
      expect(production.files.map((file) => file.path)).toContain(match[1]!);
    expect(css.match(/@font-face/g)).toHaveLength(2);
  });

  test("the stylesheet carries the tokens, not copies of the fonts", () => {
    const sheet = production.files.find((file) => /^index-.*\.css$/.test(file.path))!;
    const css = read(production, sheet.path);
    expect(css).toContain("--dbz-orange:#e78220");
    expect(css).not.toContain("data:font/woff2");
    expect(sheet.bytes).toBeLessThan(60_000);
  });

  test("the first script stays reasonable and the SDK is a separate chunk", () => {
    const main = production.files.find((file) => /^index-.*\.js$/.test(file.path))!;
    expect(main.bytes).toBeLessThan(450_000);
    const sdk = production.files.find((file) => /^discord-sdk-.*\.js$/.test(file.path));
    expect(sdk).toBeDefined();
  });

  test("is served as it was built, with the page uncached and the files immutable", async () => {
    const store = directoryAssets(production.outdir);
    expect(await store.hasIndex()).toBe(true);
    const page = await store.read("/");
    expect(page?.immutable).toBe(false);
    expect(page?.type).toContain("text/html");
    for (const file of production.files.filter((entry) => entry.path !== "index.html")) {
      const asset = await store.read(`/${file.path}`);
      expect(asset?.immutable).toBe(true);
      expect(asset?.bytes.length).toBe(file.bytes);
    }
  });
});
