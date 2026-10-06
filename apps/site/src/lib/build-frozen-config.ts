/**
 * Values a production build bakes into its client bundles and that `next start` must reuse.
 *
 * Turbopack writes `assetPrefix` into its browser runtime (the chunk base path) and the
 * deployment id into the client-reference manifests, at build time. `next start` reloads
 * `next.config.ts` and would read both again from the RUNTIME environment: when that
 * environment differs from the build's (a CDN URL only in the service env, no deployment id
 * at start), the HTML asks for chunks under one prefix while the runtime waits for them under
 * another. The runtime then never runs its entry module: React never hydrates, and every
 * button, menu and client handler of the site is dead while plain links still navigate.
 *
 * The build records the values it used in `<distDir>/required-server-files.json`; the server
 * phase takes them from there, so the HTML and the bundles always agree.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface BuiltClientConfig {
  assetPrefix: string;
  deploymentId: string | undefined;
}

/** The asset prefix and deployment id a build used, or `null` without a readable build. */
export function readBuiltClientConfig(distDir: string): BuiltClientConfig | null {
  const file = path.join(distDir, "required-server-files.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as {
      config?: { assetPrefix?: unknown; deploymentId?: unknown };
    };
    const config = parsed.config;
    if (!config) return null;
    return {
      assetPrefix: typeof config.assetPrefix === "string" ? config.assetPrefix : "",
      deploymentId:
        typeof config.deploymentId === "string" && config.deploymentId
          ? config.deploymentId
          : undefined,
    };
  } catch {
    return null;
  }
}
