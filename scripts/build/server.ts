#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Build the autonomous `shenron-server` binary (front app + local APIs) and its CDN tree.
 *
 *   bun scripts/build/server.ts [--target linux-x64|windows-x64] [--flavor desktop|production]
 *                               [--skip-site] [--no-embed]
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
 * 4. One zstd payload embedded in a `bun build --compile` executable (unless --no-embed,
 *    which keeps site/ and the library beside the binary).
 * 5. dist/cdn/: what the nginx CDN adds (additively, never --delete) to /srv/shenron-cdn:
 *    _next/static/ and site/ (public/ of the site).
 *
 * Every step is measured (scripts/build/measure.ts JSONL in dist/server/measures.jsonl).
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { pack } from "../../apps/server/src/payload";

const ROOT = resolve(import.meta.dir, "../..");
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
    { cwd, env: { ...process.env, ...env }, stdio: ["inherit", "inherit", "inherit"] },
  );
  if ((await child.exited) !== 0) throw new Error(`${label} failed`);
}

// 1. Front app, without the editorial database and without a platform image optimizer.
if (!flag("--skip-site")) {
  rmSync(join(SITE, DIST_DIR), { recursive: true, force: true });
  await measured(
    "site-build-standalone",
    [
      process.execPath,
      "--bun",
      "--no-env-file",
      "next",
      "build",
      "--turbopack",
      "--experimental-build-mode=compile",
    ],
    SITE,
    {
      NEXT_OUTPUT: "standalone",
      NEXT_DIST_DIR: DIST_DIR,
      NEXT_TELEMETRY_DISABLED: "1",
      SHENRON_IMAGES_UNOPTIMIZED: "1",
      BUILD_CPUS: process.env.BUILD_CPUS ?? "4",
      ...(flavor === "production"
        ? { NEXT_PUBLIC_CDN_URL: CDN_URL, NEXT_PUBLIC_SHENRON_ASSETS_URL: CDN_URL }
        : { NEXT_PUBLIC_CDN_URL: "", NEXT_PUBLIC_SHENRON_ASSETS_URL: "" }),
    },
  );
}
const standalone = join(SITE, DIST_DIR, "standalone");
if (!existsSync(join(standalone, "apps/site/server.js")))
  throw new Error(`no standalone build in ${standalone}`);

/**
 * Bun's isolated linker leaves node_modules/.bun/<pkg>@<ver>/node_modules/<name> plus
 * symlinks; the payload must not depend on symlinks (Windows). Hoist every traced package to
 * site/node_modules/<name> (one version each) and drop the links.
 */
function flattenNodeModules(root: string) {
  const store = join(root, "node_modules/.bun");
  if (!existsSync(store)) return;
  const hoisted = new Map<string, string>();
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, "node_modules");
    if (!existsSync(modules)) continue;
    for (const name of readdirSync(modules)) {
      const scoped = name.startsWith("@")
        ? readdirSync(join(modules, name)).map((n) => `${name}/${n}`)
        : [name];
      for (const pkg of scoped) {
        const path = join(modules, pkg);
        if (lstatSync(path).isSymbolicLink()) continue;
        const previous = hoisted.get(pkg);
        if (previous && previous !== path)
          throw new Error(`two versions of ${pkg} in the trace: ${previous} and ${path}`);
        hoisted.set(pkg, path);
      }
    }
  }
  for (const [pkg, path] of hoisted)
    cpSync(path, join(root, "node_modules", pkg), { recursive: true, dereference: true });
  rmSync(store, { recursive: true, force: true });
  for (const link of [
    ...new Bun.Glob("**/node_modules/*").scanSync({
      cwd: root,
      onlyFiles: false,
      followSymlinks: false,
    }),
  ]) {
    const path = join(root, link);
    if (lstatSync(path).isSymbolicLink()) rmSync(path, { force: true });
  }
  console.error(JSON.stringify({ label: "flatten-node-modules", packages: hoisted.size }));
}

// 2. Release tree.
rmSync(OUT, { recursive: true, force: true });
const siteOut = join(OUT, "site");
cpSync(standalone, siteOut, { recursive: true, verbatimSymlinks: true });
flattenNodeModules(siteOut);
cpSync(join(SITE, "public"), join(siteOut, "apps/site/public"), {
  recursive: true,
  dereference: true,
});
cpSync(join(SITE, DIST_DIR, "static"), join(siteOut, "apps/site", DIST_DIR, "static"), {
  recursive: true,
});
// Server source maps only weigh the payload: drop them.
for (const map of [...new Bun.Glob("**/*.map").scanSync({ cwd: siteOut, dot: true })])
  rmSync(join(siteOut, map));
// Nothing private may ship: no database, env file or key.
const forbidden = new Bun.Glob("**/*.{db,db-wal,db-shm,sqlite,sqlite3,pem,key,p12,pfx}");
const leaks = [...forbidden.scanSync({ cwd: siteOut, dot: true })].concat([
  ...new Bun.Glob("**/.env*").scanSync({ cwd: siteOut, dot: true }),
]);
if (leaks.length)
  throw new Error(`private files in the release tree: ${leaks.slice(0, 10).join(", ")}`);

// 3. Native library of the target (optional; the local RAG API reports its absence).
const libCandidates = [
  join(ROOT, "target", spec.rust, "release", spec.lib),
  join(ROOT, "target/release", spec.lib),
].filter((path) => existsSync(path) && (target === "linux-x64" || path.includes(spec.rust)));
const nativeOut = join(OUT, "native");
if (libCandidates[0]) {
  mkdirSync(nativeOut, { recursive: true });
  cpSync(libCandidates[0], join(nativeOut, spec.lib));
}

// 4. Binary.
const buildDir = join(ROOT, "apps/server/.build");
mkdirSync(buildDir, { recursive: true });
const embed = !flag("--no-embed");
if (embed) {
  const started = performance.now();
  const payload = pack({ site: siteOut, ...(libCandidates[0] ? { native: nativeOut } : {}) });
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
await measured(
  `server-compile-${target}`,
  [
    process.execPath,
    "build",
    join(buildDir, "entry.ts"),
    "--compile",
    `--target=${spec.bun}`,
    "--minify",
    "--outfile",
    join(OUT, spec.exe),
  ],
  ROOT,
);
if (embed) {
  rmSync(siteOut, { recursive: true, force: true });
  rmSync(nativeOut, { recursive: true, force: true });
}

// 5. CDN tree for an external nginx (same paths as the binary serves).
const cdn = join(ROOT, "dist/cdn");
rmSync(cdn, { recursive: true, force: true });
cpSync(join(SITE, "public"), join(cdn, "site"), { recursive: true, dereference: true });
cpSync(join(SITE, DIST_DIR, "static"), join(cdn, "_next/static"), { recursive: true });
const buildId = readFileSync(join(SITE, DIST_DIR, "BUILD_ID"), "utf8").trim();
writeFileSync(join(cdn, "BUILD_ID"), `${buildId}\n`);

const size = statSync(join(OUT, spec.exe)).size;
console.log(
  JSON.stringify({
    target,
    flavor,
    binary: join(OUT, spec.exe),
    sizeMiB: Math.round(size / 1048576),
    embedded: embed,
    buildId,
    cdn,
  }),
);
