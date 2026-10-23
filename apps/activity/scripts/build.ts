#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Builds the Activity client with `Bun.build` (HTML entry, React, the Embedded App SDK) into
 * `dist/client/`: an `index.html` plus content-hashed scripts, styles, fonts and images.
 *
 *   bun scripts/build.ts                 production bundle (no stand-in SDK, minified)
 *   bun scripts/build.ts --mock          development bundle: `?mock=1` works (dist/dev, never shipped)
 *   bun scripts/build.ts --outdir <dir>  another output directory
 *   bun scripts/build.ts --no-minify     readable output
 *
 * The production bundle is checked for the stand-in SDK: if any trace of it remains the build fails,
 * because it would let a window pick its own identity against a misconfigured server.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tokensCss } from "./tokens";

/** The text face of the site (SIL OFL), shipped by apps/site; the Activity reuses the files. */
const FONT_DIR = resolve(import.meta.dir, "../../site/public/fonts/shenron-text");
const FONTS = [
  { file: "ShenronText-Medium.woff2", weight: 500 },
  { file: "ShenronText-Bold.woff2", weight: 700 },
] as const;

export const APP_ROOT = resolve(import.meta.dir, "..");

export interface BuildOptions {
  readonly outdir?: string;
  /** Bundle the `?mock=1` stand-in SDK (development only). */
  readonly mock?: boolean;
  readonly minify?: boolean;
}

export interface BuildSummary {
  readonly outdir: string;
  readonly files: ReadonlyArray<{ path: string; bytes: number }>;
}

/** Strings that only the stand-in SDK and the development identities contain. */
const MOCK_MARKERS = ["mock-code-", "dev-token-"];

function tokensPlugin(): Bun.BunPlugin {
  return {
    name: "shenron-tokens",
    setup(build) {
      build.onResolve({ filter: /^virtual:shenron-tokens\.css$/ }, () => ({
        path: "shenron-tokens.css",
        namespace: "shenron-tokens",
      }));
      build.onLoad({ filter: /.*/, namespace: "shenron-tokens" }, () => ({
        contents: tokensCss(),
        loader: "css",
      }));
    },
  };
}

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listFiles(join(dir, entry.name), base)
      : [
          join(dir, entry.name)
            .slice(base.length + 1)
            .split("\\")
            .join("/"),
        ],
  );
}

function shortHash(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 10);
}

/**
 * Copies the text face into the output under hashed names, writes its @font-face rules, and wires
 * both into the page (a stylesheet link and a preload of the regular weight). Done here rather than
 * in the stylesheet because the CSS bundler inlines fonts as data URLs, which would make the
 * stylesheet 200 KB and defeat the cache.
 */
async function emitFonts(outdir: string): Promise<void> {
  const rules: string[] = [];
  const preloads: string[] = [];
  for (const { file, weight } of FONTS) {
    const bytes = new Uint8Array(await Bun.file(join(FONT_DIR, file)).arrayBuffer());
    const name = `${file.replace(/\.woff2$/, "")}-${shortHash(bytes)}.woff2`;
    await Bun.write(join(outdir, name), bytes);
    rules.push(
      `@font-face{font-family:"Shenron Text";src:url("./${name}") format("woff2");font-style:normal;font-weight:${weight};font-display:swap}`,
    );
    if (weight === 500)
      preloads.push(
        `<link rel="preload" href="./${name}" as="font" type="font/woff2" crossorigin>`,
      );
  }
  const css = rules.join("\n");
  const cssName = `fonts-${shortHash(new TextEncoder().encode(css))}.css`;
  await Bun.write(join(outdir, cssName), css);
  const htmlPath = join(outdir, "index.html");
  const html = await Bun.file(htmlPath).text();
  const head = `${preloads.join("")}<link rel="stylesheet" href="./${cssName}">`;
  if (!html.includes("</head>")) throw new Error("index.html has no <head>");
  await Bun.write(htmlPath, html.replace("</head>", `${head}</head>`));
}

export async function buildClient(options: BuildOptions = {}): Promise<BuildSummary> {
  const mock = options.mock ?? false;
  const outdir = resolve(options.outdir ?? join(APP_ROOT, "dist", mock ? "dev" : "client"));
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });

  const result = await Bun.build({
    entrypoints: [join(APP_ROOT, "client", "index.html")],
    outdir,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: options.minify ?? true,
    sourcemap: "none",
    naming: {
      entry: "[name].[ext]",
      chunk: "[name]-[hash].[ext]",
      asset: "[name]-[hash].[ext]",
    },
    define: {
      __ACTIVITY_MOCK__: JSON.stringify(mock),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    plugins: [tokensPlugin()],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error("client build failed");
  }

  await emitFonts(outdir);
  const files = listFiles(outdir);
  if (!files.includes("index.html")) throw new Error("the build produced no index.html");
  if (!mock) {
    for (const file of files.filter((name) => /\.(?:js|mjs|html|css)$/.test(name))) {
      const text = readFileSync(join(outdir, file), "utf8");
      const marker = MOCK_MARKERS.find((candidate) => text.includes(candidate));
      if (marker)
        throw new Error(
          `${file} contains "${marker}": the stand-in SDK leaked into the production bundle`,
        );
    }
  }
  return {
    outdir,
    files: files.map((path) => ({ path, bytes: Bun.file(join(outdir, path)).size })),
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const outdirIndex = args.indexOf("--outdir");
  const summary = await buildClient({
    mock: args.includes("--mock"),
    minify: !args.includes("--no-minify"),
    outdir: outdirIndex >= 0 ? args[outdirIndex + 1] : undefined,
  });
  const total = summary.files.reduce((sum, file) => sum + file.bytes, 0);
  for (const file of summary.files) console.log(`${String(file.bytes).padStart(9)}  ${file.path}`);
  console.log(
    `${String(total).padStart(9)}  total (${summary.files.length} files) -> ${summary.outdir}`,
  );
}
