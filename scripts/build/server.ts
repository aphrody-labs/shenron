#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the autonomous `shenron-server` binary (front app + local APIs) and its CDN tree.
 *
 *   bun scripts/build/server.ts [--target linux-x64|linux-x64-musl|windows-x64] [--flavor desktop|production]
 *                               [--skip-site | --site-only] [--no-embed] [--vfs FILE | --no-vfs]
 *                               [--no-bytecode] [--no-aot]
 *
 * Flavors: `desktop` (default; the desktop app and the public release) loads every asset from
 * the binary, offline. `production` bakes NEXT_PUBLIC_CDN_URL = NEXT_PUBLIC_SHENRON_ASSETS_URL =
 * https://cdn.dragonballfr.com: browsers fetch /_next/static and public/ from the nginx CDN,
 * and the binary still serves them itself as a fallback.
 *
 * 1. Next 16 standalone build of apps/site without the editorial database
 *    (`--experimental-build-mode=compile`: every route renders on demand).
 * 2. Release tree dist/server/<target>/site: standalone server, public assets, static chunks.
 * 3. Native library (shenron-ffi) of the target, when built (local RAG API).
 * 3b. Public VFS (default dist/vfs/shenron-vfs.public.sqlite, built by
 *    `bun scripts/data/build-vfs.ts --profile public`): wiki, RAG and VFS routes offline. It must
 *    pass the public guard (profile public, no private node or passage, no conversation, no
 *    embedded node); without it the API reports its VFS groups unavailable. Plus the public
 *    agent home template (templates/agent-home: the seven native documents of aphrody-agent-home)
 *    for the chat persona and the per-user homes, checked like the VFS (no private entry, no
 *    filled-in USER.md, no database or env file).
 * 3c. Public editorial data (scripts/build/server-data.ts): the versioned canonical lexicon
 *    data/lexique-db-canonique.json, checked, as data/ (Koharu's glossary for French
 *    translation, which shenron-manga looks up through SHENRON_LEXIQUE).
 * 4. One zstd payload embedded in a `bun build --compile` executable (unless --no-embed,
 *    which keeps site/, the library, vfs/, home/, data/ and plugin/ beside the binary).
 * 5. dist/cdn/: what the nginx CDN adds (additively, never --delete) to /srv/shenron-cdn:
 *    _next/static/ and site/ (public/ of the site).
 *
 * `--site-only` runs step 1 alone so a factory can overlap it with the native lanes, then package
 * with `--skip-site`. `SHENRON_NEXT_BUILD_CACHE=1` keeps Turbopack's filesystem cache
 * (`<distDir>/cache`) between builds of one reusable worktree; `SHENRON_PAYLOAD_ZSTD_LEVEL`
 * (default 12) trades payload size for packaging time.
 *
 * Every step is measured (scripts/build/measure.ts JSONL in dist/server/measures.jsonl).
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { nextCommand } from "@aphrody/next-bun/run";
import { flattenStandaloneExternals } from "./standalone-externals";
import { getHlsPublicAssets } from "@aphrody/bun-video/hls";
import { stageVideoPublic } from "./video-assets";

import { pack, publicVfsProblems } from "../../apps/server/src/payload";
import { requireProductionVfs } from "./server-vfs-policy";
import { ensureKoharuWasm } from "./koharu-wasm.ts";
import { findDbxv2Leaks } from "../../packages/dbxv2/src/guard.ts";
import { privateFiles, stagePublicData } from "./server-data.ts";
import { templateProblems } from "@aphrody/shenron-db/agent-homes/template";
import { AGENT_HOME_DOCUMENTS } from "@aphrody/shenron-db/agent-homes/types";
import { syncUiAssets } from "../../packages/ui/scripts/sync-assets";
import {
  aotBun,
  aotRequested,
  chooseCompileMode,
  compileModeFlags,
  type CompileMode,
} from "./compile-mode";

const ROOT = resolve(import.meta.dir, "../..");
const videoAssets = await getHlsPublicAssets();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]! : fallback;
};
const TARGETS = {
  "linux-x64": {
    bun: "bun-linux-x64",
    exe: "shenron-server",
    rust: "x86_64-unknown-linux-gnu",
    lib: "libshenron_ffi.so",
  },
  "linux-x64-musl": {
    bun: "bun-linux-x64-musl",
    exe: "shenron-server",
    rust: "x86_64-unknown-linux-musl",
    lib: "libshenron_ffi.so",
  },
  "windows-x64": {
    bun: "bun-windows-x64",
    exe: "shenron-server.exe",
    rust: "x86_64-pc-windows-msvc",
    lib: "shenron_ffi.dll",
  },
} as const;
type Target = keyof typeof TARGETS;
const flavor = option("--flavor", "desktop");
if (flavor !== "desktop" && flavor !== "production") throw new Error("--flavor desktop|production");
const vfsSource = resolve(option("--vfs", join(ROOT, "dist/vfs/shenron-vfs.public.sqlite")));
const siteOnly = flag("--site-only");
if (siteOnly && flag("--skip-site"))
  throw new Error("--site-only and --skip-site exclude each other");
if (flavor === "production" && !siteOnly) requireProductionVfs(vfsSource, flag("--no-vfs"));
const CDN_URL = "https://cdn.dragonballfr.com";
const target = option(
  "--target",
  process.platform === "win32" ? "windows-x64" : "linux-x64",
) as Target;
const spec = TARGETS[target];
if (!spec) throw new Error(`unknown --target ${target} (${Object.keys(TARGETS).join(", ")})`);

const SITE = join(ROOT, "apps/site");
const DIST_DIR = ".next-standalone";
const OUT = join(ROOT, "dist/server", target);
const MEASURES = join(ROOT, "dist/server/measures.jsonl");
mkdirSync(join(ROOT, "dist/server"), { recursive: true });

/** `base` without its PATH (any case) when `env` sets one: Windows spells it `Path`. */
function withoutPath(base: NodeJS.ProcessEnv, env: Record<string, string>) {
  if (!("PATH" in env)) return base;
  return Object.fromEntries(Object.entries(base).filter(([key]) => key.toUpperCase() !== "PATH"));
}

async function measured(
  label: string,
  command: string[],
  cwd: string,
  env: Record<string, string> = {},
) {
  const child = Bun.spawn(
    [
      process.execPath,
      join(ROOT, "scripts/build/measure.ts"),
      "--out",
      MEASURES,
      "--label",
      label,
      "--",
      ...command,
    ],
    {
      cwd,
      env: { ...withoutPath(process.env, env), ...env },
      stdio: ["inherit", "inherit", "inherit"],
    },
  );
  if ((await child.exited) !== 0) throw new Error(`${label} failed`);
}

// 1. Front app, without the editorial database and without a platform image optimizer.
await syncUiAssets(join(SITE, "public"));
if (!flag("--skip-site")) {
  ensureKoharuWasm();
  resetDistDir(join(SITE, DIST_DIR), process.env.SHENRON_NEXT_BUILD_CACHE === "1");
  // next-bun: Next and its Turbopack workers on this Bun (`node` on PATH is Bun).
  const siteBuild = nextCommand(
    ["build", "--turbopack", "--experimental-build-mode=compile"],
    SITE,
  );
  siteBuild.cmd.splice(1, 0, "--no-env-file");
  await measured("site-build-standalone", siteBuild.cmd, SITE, {
    PATH: siteBuild.env.PATH!,
    NEXT_OUTPUT: "standalone",
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
    SHENRON_IMAGES_UNOPTIMIZED: "1",
    BUILD_CPUS: process.env.BUILD_CPUS ?? "4",
    SHENRON_NEXT_BUILD_CACHE: process.env.SHENRON_NEXT_BUILD_CACHE ?? "",
    ...(flavor === "production"
      ? { NEXT_PUBLIC_CDN_URL: CDN_URL, NEXT_PUBLIC_SHENRON_ASSETS_URL: CDN_URL }
      : { NEXT_PUBLIC_CDN_URL: "", NEXT_PUBLIC_SHENRON_ASSETS_URL: "" }),
  });
}
if (siteOnly) process.exit(0);
const standalone = join(SITE, DIST_DIR, "standalone");
if (!existsSync(join(standalone, "apps/site/server.js")))
  throw new Error(`no standalone build in ${standalone}`);

// 2. Release tree.
rmSync(OUT, { recursive: true, force: true });
const siteOut = join(OUT, "site");
cpSync(standalone, siteOut, { recursive: true, verbatimSymlinks: true });
// Bun's isolated store and its symlinks: the payload must not depend on symlinks (Windows).
console.error(
  JSON.stringify({ label: "flatten-node-modules", ...flattenStandaloneExternals(siteOut) }),
);
cpSync(join(SITE, "public"), join(siteOut, "apps/site/public"), {
  recursive: true,
  dereference: true,
});
stageVideoPublic(videoAssets, join(siteOut, "apps/site/public"));
cpSync(join(SITE, DIST_DIR, "static"), join(siteOut, "apps/site", DIST_DIR, "static"), {
  recursive: true,
});
// Server source maps only weigh the payload: drop them.
for (const map of new Bun.Glob("**/*.map").scanSync({ cwd: siteOut, dot: true }))
  rmSync(join(siteOut, map));
// Next file tracing may copy the repository dist/ (staged VFS, earlier releases); the VFS ships separately.
rmSync(join(siteOut, "dist"), { recursive: true, force: true });
// The private DBXV2 package is loaded by a runtime path: file tracing copies its sources; never ship them.
rmSync(join(siteOut, "packages/dbxv2"), { recursive: true, force: true });
// Nothing private may ship: no database, env file or key.
const leaks = privateFiles(siteOut);
if (leaks.length)
  throw new Error(`private files in the release tree: ${leaks.slice(0, 10).join(", ")}`);

// 3. Native library of the target (optional; the local RAG API reports its absence).
const libCandidate = [
  join(ROOT, "target", spec.rust, "release", spec.lib),
  join(ROOT, "target/release", spec.lib),
].find((path) => existsSync(path) && (target === "linux-x64" || path.includes(spec.rust)));
const nativeOut = join(OUT, "native");
if (libCandidate) {
  mkdirSync(nativeOut, { recursive: true });
  cpSync(libCandidate, join(nativeOut, spec.lib));
}

// 3b. Public VFS and agent home template (both public by construction, the VFS checked).
const vfsOut = join(OUT, "vfs");
let vfsShipped = false;
if (!flag("--no-vfs")) {
  if (existsSync(vfsSource)) {
    const problems = publicVfsProblems(vfsSource);
    if (problems.length)
      throw new Error(`${vfsSource} cannot ship in a public payload: ${problems.join("; ")}`);
    mkdirSync(vfsOut, { recursive: true });
    cpSync(vfsSource, join(vfsOut, "shenron-vfs.sqlite"));
    vfsShipped = true;
  } else if (args.includes("--vfs")) {
    throw new Error(`--vfs ${vfsSource} does not exist`);
  } else {
    console.error(
      JSON.stringify({
        label: "vfs",
        missing: vfsSource,
        hint: "bun scripts/data/build-vfs.ts --profile public (the API VFS groups stay disabled)",
      }),
    );
  }
}
const homeOut = join(OUT, "home");
mkdirSync(homeOut, { recursive: true });
const templateDir = join(ROOT, "templates/agent-home");
const templateFiles: Record<string, string> = {};
for (const name of AGENT_HOME_DOCUMENTS) {
  cpSync(join(templateDir, name), join(homeOut, name));
  templateFiles[name] = readFileSync(join(homeOut, name), "utf8");
}
const homeProblems = [
  ...templateProblems(
    templateFiles,
    readdirSync(templateDir, { recursive: true }).map((entry) =>
      String(entry).replaceAll("\\", "/"),
    ),
  ),
  ...privateFiles(homeOut).map((file) => `private file ${file}`),
];
if (homeProblems.length)
  throw new Error(
    `templates/agent-home cannot ship in a public payload: ${homeProblems.join("; ")}`,
  );

// 3b. The public `shenron` plugin (its index joins every chat prompt, `/api/public/plugin*`).
const pluginOut = join(OUT, "plugin");
rmSync(pluginOut, { recursive: true, force: true });
cpSync(join(ROOT, "plugin"), pluginOut, { recursive: true });
const pluginLeaks = privateFiles(pluginOut);
if (pluginLeaks.length)
  throw new Error(`private files in plugin/: ${pluginLeaks.slice(0, 10).join(", ")}`);

// DBXV2 is private (Bandai Namco / Dimps): no generated module, declaration or marker may ship.
const dbxv2Leaks = findDbxv2Leaks(OUT);
if (dbxv2Leaks.length)
  throw new Error(
    `DBXV2 private modules in the release tree: ${dbxv2Leaks.slice(0, 10).join(", ")}`,
  );

// 3c. Public editorial data: only the listed, checked files of data/ (never data/home/ or a base).
const dataOut = join(OUT, "data");
const dataShipped = stagePublicData(ROOT, dataOut);

// 4. Binary.
const buildDir = join(ROOT, "apps/server/.build");
mkdirSync(buildDir, { recursive: true });
const embed = !flag("--no-embed");
if (embed) {
  const started = performance.now();
  const payload = pack(
    {
      site: siteOut,
      ...(libCandidate ? { native: nativeOut } : {}),
      ...(vfsShipped ? { vfs: vfsOut } : {}),
      home: homeOut,
      data: dataOut,
      plugin: pluginOut,
    },
    payloadLevel(),
  );
  writeFileSync(join(buildDir, "payload.pak.zst"), payload);
  writeFileSync(
    join(buildDir, "entry.ts"),
    `// Generated by scripts/build/server.ts\nimport payload from "./payload.pak.zst" with { type: "file" };\nimport { main } from "../src/main";\n\nawait main(process.argv.slice(2), { embeddedPayload: payload });\n`,
  );
  console.error(
    JSON.stringify({
      label: "payload",
      bytes: payload.byteLength,
      ms: Math.round(performance.now() - started),
    }),
  );
} else {
  writeFileSync(
    join(buildDir, "entry.ts"),
    `// Generated by scripts/build/server.ts\nimport { main } from "../src/main";\n\nawait main(process.argv.slice(2));\n`,
  );
}
// AOT (Bun 1.4.4 `--aot`) compiles the server to machine code. An AOT executable has no Bun
// command line, so BUN_BE_BUN=1 cannot run the Next standalone server.js child: the build ships a
// real Bun at runtime/bun[.exe] beside the executable instead (next-startup.ts finds it). Any
// failure of the AOT compile, or --no-aot / SHENRON_AOT=0, keeps the bytecode cache build.
let compileMode: CompileMode = flag("--no-bytecode")
  ? "bundle"
  : chooseCompileMode({
      target,
      aot: aotRequested(args),
      compileBun: process.env.SHENRON_COMPILE_BUN,
    }).mode;
const compileServer = (mode: CompileMode) =>
  measured(
    `server-compile-${target}-${mode}`,
    [
      aotBun(mode),
      "build",
      join(buildDir, "entry.ts"),
      "--compile",
      `--target=${spec.bun}`,
      // Cross-compiling: the fork's runtime for the target (upstream has no build of the fork's version).
      ...(process.env.SHENRON_COMPILE_BUN
        ? [`--compile-executable-path=${process.env.SHENRON_COMPILE_BUN}`]
        : []),
      "--minify",
      ...compileModeFlags(mode),
      "--outfile",
      join(OUT, spec.exe),
    ],
    ROOT,
  );
try {
  await compileServer(compileMode);
} catch (error) {
  if (compileMode !== "aot") throw error;
  console.error(
    JSON.stringify({ label: "server-compile-mode", mode: "bytecode", reason: "aot failed" }),
  );
  compileMode = "bytecode";
  await compileServer(compileMode);
}
const runtimeDir = join(OUT, "runtime");
rmSync(runtimeDir, { recursive: true, force: true });
if (compileMode === "aot") {
  mkdirSync(runtimeDir, { recursive: true });
  cpSync(aotBun(compileMode), join(runtimeDir, target === "windows-x64" ? "bun.exe" : "bun"));
}
if (embed) {
  for (const dir of [siteOut, nativeOut, vfsOut, homeOut, dataOut])
    rmSync(dir, { recursive: true, force: true });
}

// 5. CDN tree for an external nginx (same paths as the binary serves).
const cdn = join(ROOT, "dist/cdn");
rmSync(cdn, { recursive: true, force: true });
cpSync(join(SITE, "public"), join(cdn, "site"), { recursive: true, dereference: true });
stageVideoPublic(videoAssets, join(cdn, "site"));
cpSync(join(SITE, DIST_DIR, "static"), join(cdn, "_next/static"), { recursive: true });
const buildId = readFileSync(join(SITE, DIST_DIR, "BUILD_ID"), "utf8").trim();
writeFileSync(join(cdn, "BUILD_ID"), `${buildId}\n`);

const size = statSync(join(OUT, spec.exe)).size;
console.log(
  JSON.stringify({
    target,
    flavor,
    binary: join(OUT, spec.exe),
    compileMode,
    sizeMiB: Math.round(size / 1048576),
    embedded: embed,
    vfs: vfsShipped,
    data: dataShipped,
    buildId,
    cdn,
  }),
);

/** Empty the Next dist dir, keeping only its Turbopack filesystem cache when asked to. */
function resetDistDir(dir: string, keepCache: boolean) {
  if (!keepCache || !existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  for (const entry of readdirSync(dir)) {
    if (entry !== "cache") rmSync(join(dir, entry), { recursive: true, force: true });
  }
}

function payloadLevel(): number {
  const level = Number(process.env.SHENRON_PAYLOAD_ZSTD_LEVEL ?? 12);
  if (!Number.isInteger(level) || level < 1 || level > 22)
    throw new Error("SHENRON_PAYLOAD_ZSTD_LEVEL must be an integer from 1 to 22");
  return level;
}
