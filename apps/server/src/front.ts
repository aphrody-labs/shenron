// SPDX-License-Identifier: Apache-2.0
/**
 * The front `Bun.serve` of `shenron-server`: one origin for the local APIs, the Shenron API,
 * the immutable assets and the Next front app. Priority, first match wins:
 *
 *   1. `/api/local/*`            local APIs (health with the API groups, native search, the
 *                                editor engine bridge `/api/local/koharu`)
 *      `/v1/models`, `/v1/chat/completions`
 *                                OpenAI-compatible local model endpoints, loopback only
 *   2. `/api/auth/*`            Better Auth of the host when it serves it (DATABASE_URL, Discord
 *                                application), else Next; the client address is the socket peer
 *      `/api/v1/*`               the Shenron API host, authoritative: a disabled group answers
 *                                its JSON 404, never a Next page (Next has no `/api/v1`)
 *      `/api/public/*`, `/mcp`   the host when it serves that path (wiki and RAG from the VFS,
 *                                OpenAPI, MCP proxy), else Next (`app/api/public/[...route]` on
 *                                PostgreSQL in production, `app/mcp`)
 *   3. `/_next/static/*`, public/ files from disk
 *   4. `/assets/*`               the host (VFS nodes, lazy CDN) when public/ has no such file
 *   5. everything else           proxied to the Next standalone server (503 while it starts)
 *
 * The chat WebSocket (`/api/v1/chat/ws`) is upgraded by the host on this server. Chat SSE
 * streams write a keepalive comment every 15 s (`SSE_KEEPALIVE_MS`), well below the idle
 * timeout (120 s): Bun counts every write as activity, so a long generation is never cut.
 */
import type { ServerWebSocket, WebSocketHandler } from "bun";
import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import type { ChatSocketData } from "@shenron/api/server";

import type { LocalApi } from "./local-api";

/** Idle timeout of the front server, in seconds (Bun's maximum is 255). */
export const FRONT_IDLE_TIMEOUT_S = 120;

/** The part of the Shenron API host (`@shenron/api/host`) the front server uses. */
export interface FrontHost {
  handles(pathname: string): boolean;
  fetch(request: Request, server: Bun.Server<ChatSocketData>): Promise<Response>;
  websocket: WebSocketHandler<ChatSocketData>;
}

export interface FrontOptions {
  hostname: string;
  /** 0 picks a free port. */
  port: number;
  /** `.next` directory (static chunks) and public directory of the site build. */
  layout: { dist: string; publicDir: string };
  local: LocalApi;
  /** `null` when the API host could not be created: only the local APIs and Next answer. */
  host: FrontHost | null;
  /** Loopback port of the Next standalone server. */
  nextPort: number;
  /** Whether the Next server answers yet. */
  ready(): boolean;
  idleTimeout?: number;
}

/** Resolve `pathname` under `base`, refusing traversal. */
function inside(base: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = normalize(join(base, decoded));
  return target === base || target.startsWith(base + sep) ? target : null;
}

/** WebAssembly (the editor canvas) must be `application/wasm` for streaming compilation. */
function assetHeaders(file: string, cacheControl: string): Record<string, string> {
  return file.endsWith(".wasm")
    ? { "cache-control": cacheControl, "content-type": "application/wasm" }
    : { "cache-control": cacheControl };
}

export async function staticAsset(
  layout: FrontOptions["layout"],
  pathname: string,
): Promise<Response | null> {
  if (pathname.startsWith("/_next/static/")) {
    const file = inside(join(layout.dist, "static"), pathname.slice("/_next/static".length));
    if (file && existsSync(file) && statSync(file).isFile()) {
      return new Response(Bun.file(file), {
        headers: assetHeaders(file, "public, max-age=31536000, immutable"),
      });
    }
    return null;
  }
  if (pathname === "/" || pathname.startsWith("/api/") || pathname.startsWith("/_next/"))
    return null;
  const file = inside(layout.publicDir, pathname);
  if (file && existsSync(file) && statSync(file).isFile()) {
    return new Response(Bun.file(file), {
      headers: assetHeaders(file, "public, max-age=86400"),
    });
  }
  return null;
}

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Step 2: the API paths the host answers before the assets and Next. */
export function hostClaims(host: FrontHost, pathname: string): boolean {
  if (under(pathname, "/api/v1")) return true;
  if (under(pathname, "/api/auth")) return host.handles(pathname);
  if (pathname.startsWith("/api/public/") || under(pathname, "/mcp")) return host.handles(pathname);
  return false;
}

/**
 * Better Auth reads the client address from `x-real-ip` / `x-forwarded-for` (rate limit, session
 * IP): this front server is the first hop, so those headers are replaced by the socket peer.
 */
export function withPeerAddress(request: Request, peer?: string): Request {
  const headers = new Headers(request.headers);
  headers.delete("x-real-ip");
  headers.delete("x-forwarded-for");
  if (peer) headers.set("x-real-ip", plainAddress(peer));
  return new Request(request, { headers });
}

export function freePort(): number {
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) });
  const port = probe.port ?? 0;
  void probe.stop(true);
  if (!port) throw new Error("no free loopback port");
  return port;
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-connection",
]);

/** IPv4-mapped IPv6 form of a socket address (`::ffff:127.0.0.1` reported by dual-stack listeners). */
function plainAddress(address: string): string {
  return address.startsWith("::ffff:") ? address.slice(7) : address;
}

/**
 * The relay is the trust boundary of the front app: the client address it forwards is the socket
 * peer, never a header the caller sent (`x-real-ip` / `x-forwarded-for` feed the admin-by-address
 * rule of the site, `SHENRON_ADMIN_IPS`, which the desktop profile sets to the loopback).
 */
async function relay(
  request: Request,
  url: URL,
  nextPort: number,
  peer?: string,
): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  headers.delete("x-real-ip");
  headers.delete("x-forwarded-for");
  if (peer) headers.set("x-real-ip", plainAddress(peer));
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
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

/** Page shown while Next starts: HTML navigations reload themselves, other requests retry. */
const STARTING_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="1"><title>Shenron</title><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#0b0b10;color:#f5f5f5;font-family:system-ui,sans-serif}.s{width:40px;height:40px;border:4px solid #ffffff33;border-top-color:#f5a623;border-radius:50%;animation:r 1s linear infinite}@keyframes r{to{transform:rotate(1turn)}}</style></head><body><div class="s" role="progressbar" aria-busy="true"></div></body></html>`;

export function startingResponse(request: Request): Response {
  const headers = { "retry-after": "1", "cache-control": "no-store" };
  if (request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html"))
    return new Response(STARTING_PAGE, {
      status: 503,
      headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  return new Response("Shenron démarre…", { status: 503, headers });
}

/** No API host: a socket can still open on another path, it is closed at once. */
const NO_WEBSOCKET: WebSocketHandler<ChatSocketData> = {
  message(ws: ServerWebSocket<ChatSocketData>) {
    ws.close(1011, "API unavailable");
  },
};

export function serveFront(o: FrontOptions): Bun.Server<ChatSocketData> {
  const host = o.host;
  return Bun.serve<ChatSocketData>({
    hostname: o.hostname,
    port: o.port,
    // Explicit: Bun derives the default from NODE_ENV, which only the Next child sets.
    development: false,
    idleTimeout: o.idleTimeout ?? FRONT_IDLE_TIMEOUT_S,
    websocket: host?.websocket ?? NO_WEBSOCKET,
    async fetch(request, server) {
      const url = new URL(request.url);
      const peer = server.requestIP(request)?.address;
      const local = await o.local(request, url, o.ready(), peer);
      if (local) return local;
      // The host returns no response once it has upgraded the chat WebSocket.
      if (host && hostClaims(host, url.pathname))
        return host.fetch(
          under(url.pathname, "/api/auth") ? withPeerAddress(request, peer) : request,
          server,
        );
      const asset = await staticAsset(o.layout, url.pathname);
      if (asset) return asset;
      if (host && url.pathname.startsWith("/assets/") && host.handles(url.pathname))
        return host.fetch(request, server);
      if (!o.ready()) return startingResponse(request);
      return relay(request, url, o.nextPort, peer);
    },
  });
}
