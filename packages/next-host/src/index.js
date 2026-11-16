"use strict";
const { applyBunConfig, isTauriBuild } = require("./config.js");

/**
 * Wraps a Next.js config for Bun: Turbopack root and file tracing at the workspace root, aliases and
 * dedupe for Turbopack and webpack, TypeScript-source packages in `transpilePackages`, and
 * `next start` keeping the asset prefix and deployment id baked in by the build.
 * Next keeps its own bundler (Turbopack).
 *
 * @template T
 * @param {T} nextConfig a config object or a `(phase, ctx) => config` function
 * @param {{ alias?: Record<string, string>, dedupe?: string[], root?: string | false,
 *   transpileSources?: boolean, freezeBuildConfig?: boolean, projectDir?: string,
 *   reactCompiler?: boolean, typedRoutes?: boolean, cacheComponents?: boolean,
 *   tauri?: boolean | "auto" | { devHost?: string, devPort?: number, env?: Record<string, string> } }} [options]
 * @returns {(phase: string, ctx: any) => Promise<any>}
 */
function withBun(nextConfig, options = {}) {
  return async function bunNextConfig(phase, ctx) {
    const resolved = typeof nextConfig === "function" ? await nextConfig(phase, ctx) : nextConfig;
    return applyBunConfig(resolved, { ...options, phase, projectDir: options.projectDir ?? process.cwd() });
  };
}

module.exports = { isTauriBuild, withBun };
