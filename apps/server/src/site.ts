// SPDX-License-Identifier: Apache-2.0
/**
 * The Shenron front app (Next 16 standalone output) behind a Bun front server.
 *
 * Bun serves the immutable assets (`/_next/static`, `public/`) straight from disk, answers the
 * local APIs (`/api/local/*`), and proxies every other request to the Next server it starts
 * in-process on a loopback port. In production an external nginx CDN may serve the same
 * asset tree (see scripts/build/server.ts --cdn); the binary works with or without it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";

import type { ServerPaths } from "./config";
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
    const dist = [".next-standalone", ".next"].map((d) => join(app, d)).find((d) => existsSync(join(d, "BUILD_ID")));
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

/** Resolve `pathname` under `base`, refusing traversal. */
function inside(base: string, pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0")) return null;
  const target = normalize(join(base, decoded));
  return target === base || target.startsWith(base + sep) ? target : null;
}

async function staticAsset(layout: SiteLayout, pathname: string): Promise<Response | null> {
  if (pathname.startsWith("/_next/static/")) {
    const file = inside(join(layout.dist, "static"), pathname.slice("/_next/static".length));
    if (file && existsSync(file) && statSync(file).isFile()) {
      return new Response(Bun.file(file), {
        headers: { "cache-control": "public, max-age=31536000, immutable" },
      });
    }
    return null;
  }
  if (pathname === "/" || pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return null;
  const file = inside(layout.publicDir, pathname);
  if (file && existsSync(file) && statSync(file).isFile()) {
    return new Response(Bun.file(file), { headers: { "cache-control": "public, max-age=86400" } });
  }
  return null;
}

/** Whether this process is a `bun build --compile` executable (virtual module root). */
const COMPILED = import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:\\~BUN\\/.test(import.meta.path);

/**
 * Start the Next standalone server on a loopback port, in a child Bun runtime: the same
 * executable with BUN_BE_BUN=1 when compiled (a compiled binary does not resolve the payload's
 * node_modules for modules it imports), else the current `bun`.
 */
async function startNext(layout: SiteLayout, port: number): Promise<ReturnType<typeof Bun.spawn>> {
  const child = Bun.spawn([process.execPath, join(layout.app, "server.js")], {
    cwd: layout.app,
    env: {
      ...process.env,
      ...(COMPILED ? { BUN_BE_BUN: "1" } : {}),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next standalone server exited with ${child.exitCode}`);
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

function freePort(): number {
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) });
  const port = probe.port ?? 0;
  void probe.stop(true);
  if (!port) throw new Error("no free loopback port");
  return port;
}

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection"]);

export interface RunningSite {
  url: string;
  port: number;
  layout: SiteLayout;
  stop(): void;
}

/** Serve the front app on `hostname:port` (port 0 picks a free one). */
export async function serveSite(
  paths: ServerPaths,
  options: { hostname: string; port: number; startedAt: number },
): Promise<RunningSite> {
  const layout = locateSite(paths);
  const nextPort = freePort();
  const api = localApi(paths, () => ({ site: true, buildId: layout.buildId }));
  let ready = false;
  const front = Bun.serve({
    hostname: options.hostname,
    port: options.port,
    idleTimeout: 120,
    async fetch(request) {
      const url = new URL(request.url);
      const local = await api(request, url, ready);
      if (local) return local;
      const asset = await staticAsset(layout, url.pathname);
      if (asset) return asset;
      if (!ready) return new Response("Shenron démarre…", { status: 503, headers: { "retry-after": "1" } });
      const headers = new Headers(request.headers);
      for (const name of HOP_BY_HOP) headers.delete(name);
      headers.set("x-forwarded-host", url.host);
      headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
      const upstream = await fetch(`http://127.0.0.1:${nextPort}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
        // Forward the encoded bytes untouched: the content-encoding header stays truthful.
        decompress: false,
      });
      const responseHeaders = new Headers(upstream.headers);
      for (const name of HOP_BY_HOP) responseHeaders.delete(name);
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
    },
  });
  const next = await startNext(layout, nextPort);
  ready = true;
  const url = `http://${options.hostname === "0.0.0.0" ? "127.0.0.1" : options.hostname}:${front.port}`;
  console.error(
    JSON.stringify({
      event: "shenron.site.ready",
      url,
      buildId: layout.buildId,
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
    },
  };
}

/** Names of the top-level entries of the standalone root (diagnostics). */
export function describeSite(layout: SiteLayout): string[] {
  return readdirSync(layout.root);
}
