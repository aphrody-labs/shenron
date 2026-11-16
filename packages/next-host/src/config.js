"use strict";
// Config rewrites `withBun()` applies to every Next.js app on Bun, whatever the
// bundler: workspace root for Turbopack and file tracing, aliases and dedupes
// written once for both Turbopack and webpack, TypeScript-source packages added
// to `transpilePackages`, and `next start` pinned to the client config of its build.

const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { dirname, isAbsolute, join, relative, resolve, sep } = require("node:path");

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * The root of the workspace `projectDir` belongs to: the nearest ancestor whose
 * package.json declares `workspaces`, else `projectDir`. With Bun's isolated
 * linker, packages live in the root `node_modules/.bun` store, which Turbopack
 * and file tracing must see.
 */
function findWorkspaceRoot(projectDir) {
  const start = resolve(projectDir);
  if (readJson(join(start, "package.json"))?.workspaces) return start;
  for (let dir = dirname(start); dirname(dir) !== dir; dir = dirname(dir)) {
    if (readJson(join(dir, "package.json"))?.workspaces) return dir;
  }
  return start;
}

/** Node's lookup of `<name>/package.json` from `fromDir`, ignoring `exports` (which may hide package.json). */
function findPackageDir(name, fromDir) {
  for (let dir = resolve(fromDir); ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    if (dirname(dir) === dir) return undefined;
  }
}

const TS_SOURCE = /\.[cm]?tsx?$/;

/** Conditions Next.js bundlers resolve with; `types` and custom ones (`@zod/source`, `bun`…) are not followed. */
const BUNDLER_CONDITIONS = new Set([
  "import",
  "require",
  "default",
  "module",
  "node",
  "browser",
  "edge-light",
  "worker",
  "react-server",
  "development",
  "production",
]);

function exportTargets(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) exportTargets(v, out);
  else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith(".") || BUNDLER_CONDITIONS.has(key)) exportTargets(v, out);
    }
  }
  return out;
}

/** True when a package manifest points an entry point at TypeScript source (`.ts`/`.tsx`, not `.d.ts`). */
function shipsTypeScriptSource(manifest) {
  const targets = [...exportTargets(manifest.exports), manifest.main, manifest.module].filter(Boolean);
  return targets.some(t => TS_SOURCE.test(t) && !/\.d\.[cm]?tsx?$/.test(t));
}

/**
 * Every package reachable from the app's dependencies that ships TypeScript
 * sources (workspace packages and published Bun-first packages alike), following
 * the dependencies of those packages. Next only compiles them reliably when they
 * are listed in `transpilePackages`.
 */
function typeScriptSourcePackages(projectDir) {
  const found = new Set();
  const seen = new Set();
  const visit = (pkgDir, fields) => {
    const manifest = readJson(join(pkgDir, "package.json")) ?? {};
    for (const field of fields) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        const dir = findPackageDir(name, pkgDir);
        if (!dir || seen.has(dir)) continue;
        seen.add(dir);
        const dep = readJson(join(dir, "package.json"));
        if (!dep || !shipsTypeScriptSource(dep)) continue;
        found.add(dep.name ?? name);
        visit(dir, ["dependencies", "optionalDependencies", "peerDependencies"]);
      }
    }
  };
  visit(resolve(projectDir), ["dependencies", "devDependencies", "optionalDependencies"]);
  return [...found].sort();
}

/** `target` as Turbopack wants it in `resolveAlias`: a module name, or a path relative to the project. */
function turbopackTarget(target, projectDir) {
  if (!isAbsolute(target)) return target;
  const rel = relative(projectDir, target).split(sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

/** `target` as webpack wants it in `resolve.alias`: a module name, or an absolute path. */
function webpackTarget(target, projectDir) {
  return target.startsWith("./") || target.startsWith("../") ? resolve(projectDir, target) : target;
}

/**
 * One alias table for both bundlers. Values are module names, paths relative to
 * the project (`./src/x.ts`) or absolute paths. `dedupe` names resolve from the
 * project to one installed copy, subpaths included.
 */
function aliasTables(projectDir, alias = {}, dedupe = []) {
  const absolute = {};
  for (const [name, target] of Object.entries(alias)) {
    absolute[name] = target.startsWith("./") || target.startsWith("../") ? resolve(projectDir, target) : target;
  }
  for (const name of dedupe) {
    const dir = findPackageDir(name, projectDir);
    if (!dir) throw new Error(`@shenron/next-host: dedupe: ${name} is not installed for ${projectDir}`);
    absolute[name] = dir;
    absolute[`${name}/*`] = `${dir}/*`;
  }
  const turbopack = {};
  const webpack = {};
  for (const [name, target] of Object.entries(absolute)) {
    turbopack[name] = turbopackTarget(target, projectDir);
    if (name.endsWith("/*")) continue;
    webpack[name] = webpackTarget(target, projectDir);
  }
  return { turbopack, webpack };
}

/**
 * The asset prefix and deployment id a production build baked into its client
 * bundles, from `<distDir>/required-server-files.json`; `null` without a build.
 */
function readBuiltClientConfig(distDir) {
  const config = readJson(join(distDir, "required-server-files.json"))?.config;
  if (!config) return null;
  return {
    assetPrefix: typeof config.assetPrefix === "string" ? config.assetPrefix : "",
    deploymentId: typeof config.deploymentId === "string" && config.deploymentId ? config.deploymentId : undefined,
  };
}

const PHASE_PRODUCTION_SERVER = "phase-production-server";

/** `true` when the Tauri CLI drives this process (it sets `TAURI_ENV_PLATFORM` for `beforeBuildCommand` and `beforeDevCommand`). */
function isTauriBuild(env = process.env) {
  return env.TAURI_ENV_PLATFORM !== undefined || env.TAURI_ENV_ARCH !== undefined;
}

/**
 * Static export a Tauri webview loads: `output: "export"`, unoptimized images, trailing slashes, no Cache
 * Components (no server renders the shell on demand), `tauri.env` merged under the config's `env`, and the
 * dev server as asset prefix outside production when a dev host is known (`devHost`, else `TAURI_DEV_HOST`).
 */
function applyStaticExport(out, config, tauri, env) {
  const { devHost = env.TAURI_DEV_HOST, devPort = 3000, env: exportEnv } = tauri === true ? {} : tauri;
  out.output ??= "export";
  out.trailingSlash ??= true;
  out.images = { unoptimized: true, ...config.images };
  if (config.cacheComponents === undefined) out.cacheComponents = false;
  if (exportEnv) out.env = { ...exportEnv, ...config.env };
  if (devHost !== undefined && env.NODE_ENV !== "production") out.assetPrefix ??= `http://${devHost}:${devPort}`;
}

/**
 * Applies the generic rewrites to a resolved Next.js config object.
 *
 * @param {Record<string, any>} config
 * @param {{ phase: string, projectDir: string, alias?: Record<string, string>, dedupe?: string[],
 *   root?: string | false, transpileSources?: boolean, freezeBuildConfig?: boolean, reactCompiler?: boolean,
 *   typedRoutes?: boolean, cacheComponents?: boolean,
 *   tauri?: boolean | "auto" | { devHost?: string, devPort?: number, env?: Record<string, string> },
 *   env?: Record<string, string | undefined> }} options
 */
function applyBunConfig(config, options) {
  const { phase, projectDir } = options;
  const out = { ...config };

  if (options.root !== false) {
    const root = options.root ?? out.turbopack?.root ?? out.outputFileTracingRoot ?? findWorkspaceRoot(projectDir);
    out.turbopack = { ...out.turbopack, root: out.turbopack?.root ?? root };
    out.outputFileTracingRoot ??= root;
  }

  const tables = aliasTables(projectDir, options.alias, options.dedupe);
  if (Object.keys(tables.turbopack).length) {
    out.turbopack = { ...out.turbopack, resolveAlias: { ...tables.turbopack, ...out.turbopack?.resolveAlias } };
    const userWebpack = out.webpack;
    out.webpack = (webpackConfig, context) => {
      webpackConfig.resolve ??= {};
      webpackConfig.resolve.alias = { ...tables.webpack, ...webpackConfig.resolve.alias };
      return typeof userWebpack === "function" ? userWebpack(webpackConfig, context) : webpackConfig;
    };
  }

  for (const key of ["reactCompiler", "typedRoutes", "cacheComponents"]) {
    if (options[key] !== undefined) out[key] ??= options[key];
  }
  const env = options.env ?? process.env;
  const tauri = options.tauri === "auto" ? isTauriBuild(env) : options.tauri;
  if (tauri !== undefined && tauri !== false) applyStaticExport(out, config, tauri, env);

  if (options.transpileSources !== false) {
    const external = new Set(out.serverExternalPackages ?? []);
    const listed = new Set(out.transpilePackages ?? []);
    for (const name of typeScriptSourcePackages(projectDir)) if (!external.has(name)) listed.add(name);
    if (listed.size) out.transpilePackages = [...listed];
  }

  if (phase === PHASE_PRODUCTION_SERVER && options.freezeBuildConfig !== false) {
    const built = readBuiltClientConfig(resolve(projectDir, out.distDir ?? ".next"));
    if (built) {
      out.assetPrefix = built.assetPrefix || undefined;
      out.deploymentId = built.deploymentId;
    }
  }
  return out;
}

module.exports = {
  aliasTables,
  applyBunConfig,
  findPackageDir,
  findWorkspaceRoot,
  isTauriBuild,
  readBuiltClientConfig,
  shipsTypeScriptSource,
  typeScriptSourcePackages,
};
