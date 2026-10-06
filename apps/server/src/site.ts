// SPDX-License-Identifier: Apache-2.0
/**
 * The Shenron front app (Next 16 standalone output) behind a Bun front server.
 *
 * Bun answers the local APIs (`/api/local/*`) and the Shenron API (`/api/v1/*`, VFS-backed
 * `/api/public/*`, chat WebSocket, MCP proxy: ./backend.ts), serves the immutable assets
 * (`/_next/static`, `public/`) straight from disk, and proxies every other request to the Next
 * server it starts on a loopback port (routing order: ./front.ts). In production an external
 * nginx CDN may serve the same asset tree (see scripts/build/server.ts); the binary works with
 * or without it.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type Backend, startBackend } from "./backend";
import type { ServerPaths } from "./config";
import { type FrontHost, freePort, serveFront } from "./front";
import { localApi } from "./local-api";

export interface SiteLayout {
  /** Standalone root (contains `apps/site/server.js` and the traced `node_modules`). */
  root: string;
  /** `apps/site` inside the standalone root. */
  app: string;
  /** `.next` directory of the build (`static/`, manifests, BUILD_ID). */
  dist: string;
  /** Public directory served at `/`. */
  publicDir: string;
  buildId: string;
}

/** Find the standalone build: SHENRON_SITE_DIR, then `site/` beside the executable. */
export function locateSite(paths: ServerPaths, env: NodeJS.ProcessEnv = process.env): SiteLayout {
  const candidates = [
    env.SHENRON_SITE_DIR?.trim(),
    join(paths.exeDir, "site"),
    join(paths.exeDir, "..", "site", ".next-standalone", "standalone"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const root = resolve(candidate);
    const app = join(root, "apps", "site");
    if (!existsSync(join(app, "server.js"))) continue;
    const dist = [".next-standalone", ".next"]
      .map((d) => join(app, d))
      .find((d) => existsSync(join(d, "BUILD_ID")));
    if (!dist) continue;
    return {
      root,
      app,
      dist,
      publicDir: join(app, "public"),
      buildId: readFileSync(join(dist, "BUILD_ID"), "utf8").trim() || "unknown",
    };
  }
  throw new Error(
    `Shenron site build not found (looked in ${candidates.join(", ")}); set SHENRON_SITE_DIR or run bun run build:server`,
  );
}

/** Whether this process is a `bun build --compile` executable (virtual module root). */
const COMPILED =
  import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(import.meta.path);

/**
 * Start the Next standalone server on a loopback port, in a child Bun runtime: the same
 * executable with BUN_BE_BUN=1 when compiled (a compiled binary does not resolve the payload's
 * node_modules for modules it imports), else the current `bun`.
 */
async function startNext(
  layout: SiteLayout,
  port: number,
  extraEnv: Record<string, string>,
): Promise<ReturnType<typeof Bun.spawn>> {
  const child = Bun.spawn([process.execPath, join(layout.app, "server.js")], {
    cwd: layout.app,
    env: {
      ...process.env,
      ...extraEnv,
      ...(COMPILED ? { BUN_BE_BUN: "1" } : {}),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Next standalone server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/robots.txt`, { redirect: "manual" });
      if (response.status < 500) return child;
    } catch {
      // not listening yet
    }
    await Bun.sleep(25);
  }
  child.kill();
  throw new Error("Next standalone server did not start within 120 s");
}

export interface RunningSite {
  url: string;
  port: number;
  layout: SiteLayout;
  stop(): void;
}

/** The host as the front sees it: `/mcp` falls back to Next once the MCP sidecar is down. */
export function frontHost(backend: Backend): FrontHost | null {
  const host = backend.host;
  if (!host) return null;
  return {
    handles: (pathname) =>
      (pathname === "/mcp" || pathname.startsWith("/mcp/")) && !backend.mcpRouted()
        ? false
        : host.handles(pathname),
    fetch: (request, server) => host.fetch(request, server),
    websocket: host.websocket,
  };
}

/** Serve the front app on `hostname:port` (port 0 picks a free one). */
export async function serveSite(
  paths: ServerPaths,
  options: { hostname: string; port: number; startedAt: number; payloadDir?: string },
): Promise<RunningSite> {
  const layout = locateSite(paths);
  const nextPort = freePort();
  const backend = await startBackend(paths, process.env, { payloadDir: options.payloadDir });
  const base = localApi(
    paths,
    () => ({ site: true, buildId: layout.buildId, groups: backend.groups() }),
    process.env,
    undefined,
    backend.koharu,
    backend.chatModel,
  );
  // `/api/local/agent-home*` (the agent homes of this machine) before the other local APIs.
  const api: typeof base = async (request, url, isReady, peer) =>
    (await backend.agentHomes?.handle(request, url, peer)) ?? base(request, url, isReady, peer);
  let ready = false;
  const front = serveFront({
    hostname: options.hostname,
    port: options.port,
    layout,
    local: api,
    host: frontHost(backend),
    nextPort,
    ready: () => ready,
  });
  // The editor engine's agent searches the local corpus of this server.
  backend.koharu.setServerUrl(`http://127.0.0.1:${front.port}`);
  let next: ReturnType<typeof Bun.spawn>;
  try {
    next = await startNext(layout, nextPort, backend.nextEnv);
  } catch (error) {
    void front.stop(true);
    await backend.stop();
    throw error;
  }
  ready = true;
  const url = `http://${options.hostname === "0.0.0.0" ? "127.0.0.1" : options.hostname}:${front.port}`;
  const groups = backend.groups();
  console.error(
    JSON.stringify({
      event: "shenron.site.ready",
      url,
      buildId: layout.buildId,
      groups: Object.keys(groups).filter((name) => groups[name as keyof typeof groups].available),
      startupMs: Math.round(performance.now() - options.startedAt),
    }),
  );
  return {
    url,
    port: front.port ?? options.port,
    layout,
    stop: () => {
      next.kill();
      void front.stop(true);
      void backend.stop();
    },
  };
}

/** Names of the top-level entries of the standalone root (diagnostics). */
export function describeSite(layout: SiteLayout): string[] {
  return readdirSync(layout.root);
}
