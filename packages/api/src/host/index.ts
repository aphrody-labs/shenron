// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/api/host` — composition of the single Shenron API server from an explicit
 * environment record: VFS database (file or embedded), RAG with the corpus embedder, chat
 * engine (Gemini web → local llama-server), MCP tools (`shenron-mcp`), OCR
 * (`shenron ocr image`), conversation store (SQLite or PostgreSQL), owner/admin auth, static
 * assets with precompressed siblings and the MCP reverse proxy. `serveShenronApi(env)` starts
 * it with `Bun.serve`. Hosts: `apps/server`, the desktop sidecar, the bot. Runtime class: `bun`.
 *
 * The caller passes the environment (`process.env` in an entry point): nothing is read at
 * module load. Variables are listed in docs/architecture/STACK.md §3.6.
 */
import type { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve, sep } from "node:path";
import { verifyActingUser } from "@shenron/auth/acting-user";
import { hmacSha256Hex, parseBearer, timingSafeEqualString } from "@shenron/auth/crypto";
import {
  ENV_ALIASES,
  envFirst,
  envString,
  type EnvSource,
  isProduction,
} from "@shenron/config/env";
import { clientIpFromHeaders, isDirectLoopback } from "@shenron/config/net";
import { DEV_SITE_ORIGIN, originOf, resolveSiteUrl } from "@shenron/config/public-urls";
import { resolveShenronApiBind } from "@shenron/config/services";
import { PgConversationStore, SqliteConversationStore } from "@shenron/db/conversations";
import type { ConversationStore } from "@shenron/db/conversations/types";
import {
  createE5Embedder,
  defaultCdn,
  type OpenedVfs,
  openShenronVfs,
  RAG_EMBED_MODEL,
} from "@shenron/db/vfs";
import { createChatEngine } from "../chat/engine";
import { agentHomeFromDir, agentHomeFromVfs } from "../chat/home";
import { backendsFromEnv } from "../chat/llm";
import { createStdioMcpClient } from "../chat/mcp";
import { createCliOcr } from "../chat/ocr";
import type { RagHit, RagSearchQuery } from "../contract/schemas";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../http";
import {
  type AuthPort,
  type ChatSocketData,
  createShenronApi,
  type RagPort,
  type ShenronApi,
  type ShenronApiService,
  type VfsPort,
} from "../server";

/** Owner headers of a signed site session user or desktop account. */
export const OWNER_HEADERS = Object.freeze({
  owner: "x-shenron-owner",
  ts: "x-shenron-owner-ts",
  sig: "x-shenron-owner-sig",
} as const);

/** Accepted clock skew of a signed owner: ±5 minutes. */
const OWNER_SKEW_MS = 5 * 60_000;
const OWNER_ID = /^[A-Za-z0-9_:@.-]{1,128}$/;

/** Headers of a signed owner (site session user, desktop account): `X-Shenron-Owner{,-Ts,-Sig}`. */
export function signOwner(
  secret: string,
  ownerId: string,
  nowMs = Date.now(),
): Record<string, string> {
  const ts = String(nowMs);
  return {
    [OWNER_HEADERS.owner]: ownerId,
    [OWNER_HEADERS.ts]: ts,
    [OWNER_HEADERS.sig]: hmacSha256Hex(secret, `${ownerId}:${ts}`),
  };
}

/**
 * Owner resolution, first match wins: signed owner headers (`SHENRON_OWNER_SECRET`), signed
 * Discord acting user (`SHENRON_USER_SECRET`/`API_USER_SECRET`, owner `discord:<id>`), then —
 * direct loopback only — the local desktop owner (`SHENRON_LOCAL_OWNER`, default `local`; an
 * empty value disables it). Admin: Bearer equal to `SHENRON_ADMIN_TOKEN`/`API_ADMIN_TOKEN`.
 */
export function createEnvAuth(env: EnvSource, isLoopback: (request: Request) => boolean): AuthPort {
  return {
    async owner(request) {
      const ownerSecret = envString(env, "SHENRON_OWNER_SECRET");
      const owner = request.headers.get(OWNER_HEADERS.owner);
      if (ownerSecret && owner) {
        const ts = Number(request.headers.get(OWNER_HEADERS.ts));
        const sig = request.headers.get(OWNER_HEADERS.sig)?.toLowerCase() ?? "";
        const valid =
          OWNER_ID.test(owner) &&
          Number.isFinite(ts) &&
          Math.abs(Date.now() - ts) <= OWNER_SKEW_MS &&
          timingSafeEqualString(hmacSha256Hex(ownerSecret, `${owner}:${ts}`), sig);
        return valid ? owner : null;
      }
      const acting = verifyActingUser(request.headers, {
        secret: envFirst(env, ENV_ALIASES.actingUserSecret)?.value,
      });
      if (acting.ok) return `discord:${acting.discordId}`;
      if (isLoopback(request) && env.SHENRON_LOCAL_OWNER !== "") {
        return envString(env, "SHENRON_LOCAL_OWNER") ?? "local";
      }
      return null;
    },
    async admin(request) {
      const token = envFirst(env, ENV_ALIASES.adminToken)?.value;
      const presented = parseBearer(request.headers, { caseSensitive: true });
      return Boolean(token) && presented !== null && timingSafeEqualString(presented, token!);
    },
  };
}

/** Default locations (all private, outside the repository). */
export function hostPaths(env: EnvSource) {
  const home = envString(env, "HOME") ?? homedir();
  const data =
    envString(env, "SHENRON_DATA_DIR") ??
    join(envString(env, "XDG_DATA_HOME") ?? join(home, ".local", "share"), "shenron");
  return {
    data,
    vfs: envString(env, "SHENRON_VFS_DB") ?? join(data, "shenron-vfs.sqlite"),
    conversations: envString(env, "SHENRON_CHAT_STORE") ?? join(data, "conversations.sqlite"),
    agentHome:
      envString(env, "APHRODY_WORKSPACE") ??
      join(envString(env, "APHRODY_HOME") ?? join(home, ".aphrody"), "workspaces", "dbfr"),
  };
}

/**
 * CORS allowlist: `SHENRON_CORS_ORIGINS` (comma list), else the public site origin and its
 * `www` twin, the Tauri webview and, outside production, the local Next dev server.
 */
export function hostCorsOrigins(env: EnvSource): string[] {
  const configured = envString(env, "SHENRON_CORS_ORIGINS")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured?.length) return configured;
  const site = originOf(resolveSiteUrl(env));
  const origins = [site];
  try {
    const url = new URL(site);
    url.hostname = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    origins.push(url.origin);
  } catch {
    // an unparsable site URL keeps the single configured value
  }
  origins.push("tauri://localhost");
  if (!isProduction(env)) origins.push(DEV_SITE_ORIGIN);
  return [...new Set(origins)];
}

/** Contract `RagHit` view of the VFS retrieval. */
export function createVfsRagPort(
  opened: OpenedVfs,
  embed: ((text: string) => Promise<Float32Array>) | null,
  publicOnly: boolean,
): RagPort {
  return {
    async search(query: RagSearchQuery) {
      const result = await opened.rag.searchWith(query.q, query.lexicalOnly ? null : embed, {
        limit: query.limit ?? 8,
        ...(query.kind ? { kinds: [query.kind] } : {}),
        publicOnly,
      });
      const hits: RagHit[] = [];
      for (const hit of result.hits) {
        if (query.lang && hit.lang !== query.lang) continue;
        if (query.sourceId && hit.sourceId !== query.sourceId) continue;
        hits.push({
          rowid: hit.chunkId,
          kind: hit.kind,
          title: hit.title,
          url: hit.url ?? "",
          snippet: hit.snippet,
          score: Math.round(hit.score * 10_000) / 10_000,
          ...(hit.sourceId ? { sourceId: hit.sourceId } : {}),
          ...(hit.lang ? { lang: hit.lang } : {}),
          content: hit.content,
        });
      }
      return {
        mode: result.mode,
        hits,
        ...(result.embedError ? { error: `embedder: ${result.embedError}` } : {}),
      };
    },
  };
}

/** Regular file of `assetsDir` serving `/assets/<rel>`, never outside the directory. */
function assetFile(assetsDir: string | null, path: string): string | null {
  if (!assetsDir || !path.startsWith("/assets/")) return null;
  const root = resolve(assetsDir);
  const file = normalize(join(root, path.slice("/assets/".length)));
  if (!file.startsWith(root + sep)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/** `VfsPort` of the API over an opened VFS; `assetsDir` serves local files without a copy. */
export function createVfsPort(
  opened: OpenedVfs,
  options: { publicOnly: boolean; assetsDir?: string | null },
): VfsPort {
  const { vfs, rag } = opened;
  return {
    publicOnly: options.publicOnly,
    info() {
      const stats = vfs.stats();
      const wiki = vfs.query<{ n: number }>("SELECT COUNT(*) AS n FROM wiki_entities")[0]?.n ?? 0;
      return {
        profile: vfs.profile,
        schemaVersion: vfs.meta("schema_version"),
        generatedAt: vfs.meta("generated_at"),
        files: stats.files,
        dirs: stats.dirs,
        bytes: stats.bytes,
        counts: stats.counts,
        rag: rag.stats(),
        wiki,
      };
    },
    stat: (path) => {
      const s = vfs.stat(path);
      return {
        kind: s.kind,
        size: s.size,
        sha256: s.sha256,
        mime: s.mime,
        storage: s.storage,
        sourceUrl: s.sourceUrl,
        visibility: s.visibility,
      };
    },
    readDir: (path) => vfs.readDir(path),
    read: (path) => vfs.read(path),
    localFile(path) {
      const file = assetFile(options.assetsDir ?? null, path);
      return file ? Bun.file(file) : null;
    },
    query: (sql, params) => vfs.query(sql, params),
  };
}

/** Static file with a precompressed sibling (`.br`, `.gz`) chosen from `Accept-Encoding`. */
export function staticFileResponse(
  request: Request,
  file: string,
  headers: Record<string, string> = {},
): Response {
  const accept = request.headers.get("accept-encoding") ?? "";
  const type = Bun.file(file).type;
  for (const [encoding, ext] of [
    ["br", ".br"],
    ["gzip", ".gz"],
  ] as const) {
    if (!new RegExp(`\\b${encoding}\\b`).test(accept)) continue;
    const sibling = `${file}${ext}`;
    if (existsSync(sibling)) {
      return new Response(Bun.file(sibling), {
        headers: {
          ...headers,
          "Content-Type": type,
          "Content-Encoding": encoding,
          Vary: "Accept-Encoding",
        },
      });
    }
  }
  return new Response(Bun.file(file), {
    headers: { ...headers, "Content-Type": type, Vary: "Accept-Encoding" },
  });
}

export interface LocalApiOptions {
  service?: ShenronApiService;
  /** Already-open VFS database (embedded binary) instead of `SHENRON_VFS_DB`. */
  vfsDatabase?: Database;
  /** VFS path → `$bunfs` path of embedded files. */
  embedded?: Readonly<Record<string, string>>;
  /** Conversation store override (tests); `null` disables the store. */
  conversations?: ConversationStore | null;
  fetch?: typeof fetch;
}

export interface LocalApi {
  api: ShenronApi;
  vfs: OpenedVfs | null;
  conversations: ConversationStore | null;
  /** Bun.serve options (`routes`, `websocket`, `fetch`) with loopback detection and `/assets/*`. */
  serveOptions(): Bun.Serve.Options<ChatSocketData>;
  close(): Promise<void>;
}

type HostRoute = (
  request: Request,
  server: Bun.Server<ChatSocketData>,
) => Response | Promise<Response>;

export function createLocalApi(env: EnvSource, options: LocalApiOptions = {}): LocalApi {
  const paths = hostPaths(env);
  const publicOnly = env.SHENRON_PROFILE === "public" || env.SHENRON_VFS_PUBLIC_ONLY === "1";
  const cdn = defaultCdn(env);
  let opened: OpenedVfs | null = null;
  if (options.vfsDatabase) {
    opened = openShenronVfs(options.vfsDatabase, {
      readOnly: true,
      embedded: options.embedded ?? {},
      cdn,
    });
  } else if (existsSync(paths.vfs)) {
    opened = openShenronVfs(paths.vfs, { readOnly: true, cdn });
  }
  const embedModel = envString(env, "APHRODY_AI_EMBED_MODEL") ?? RAG_EMBED_MODEL;
  const embedBase = envString(env, "APHRODY_AI_EMBED_BASE_URL");
  const embedder = embedBase
    ? createE5Embedder({
        baseUrl: embedBase,
        model: embedModel,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      })
    : null;

  let conversations: ConversationStore | null = options.conversations ?? null;
  let pg: InstanceType<typeof Bun.SQL> | null = null;
  if (options.conversations === undefined) {
    const pgUrl = envString(env, "SHENRON_CHAT_PG_URL");
    if (pgUrl) {
      pg = new Bun.SQL(pgUrl);
      conversations = new PgConversationStore(pg, {
        schema: envString(env, "SHENRON_CHAT_PG_SCHEMA") ?? "chat",
      });
    } else if (env.SHENRON_CHAT_STORE !== "off") {
      conversations = new SqliteConversationStore(paths.conversations);
    }
  }

  // Direct loopback requests, marked by the Bun.serve entry points from the socket address.
  const loopback = new WeakSet<Request>();
  const isLoopback = (request: Request) => loopback.has(request);
  const mcpBin =
    envString(env, "SHENRON_MCP_BIN") ?? (Bun.which("shenron-mcp") ? "shenron-mcp" : "");
  const mcp =
    mcpBin && env.SHENRON_CHAT_TOOLS !== "0"
      ? createStdioMcpClient({
          command: [mcpBin],
          env: existsSync(paths.vfs) ? { SHENRON_VFS_DB: paths.vfs } : {},
        })
      : null;
  const ocr = createCliOcr({ binary: envString(env, "SHENRON_CLI_BIN") ?? "shenron" });
  const ocrPort = ocr.available() ? ocr : null;

  const engine = createChatEngine({
    rag: opened?.rag ?? null,
    embed: embedder?.query ?? null,
    embedderModel: embedModel,
    publicOnly,
    backends: backendsFromEnv(env),
    home: () =>
      opened && opened.vfs.exists("/home/SOUL.md")
        ? agentHomeFromVfs(opened.vfs)
        : agentHomeFromDir(paths.agentHome),
    mcp,
    ocr: ocrPort,
    store: conversations,
    defaultPersona: envString(env, "SHENRON_CHAT_PERSONA") ?? "shenron",
    log: (event) => console.error(JSON.stringify(event)),
  });

  const assetsDir = envString(env, "SHENRON_ASSETS_DIR") ?? null;
  const mcpUrl = envString(env, "SHENRON_MCP_URL");
  const api = createShenronApi(
    {
      wiki: opened ? opened.wiki : null,
      rag: opened ? createVfsRagPort(opened, embedder?.query ?? null, publicOnly) : null,
      chat: engine,
      conversations,
      vfs: opened ? createVfsPort(opened, { publicOnly, assetsDir }) : null,
      ocr: ocrPort,
      auth: createEnvAuth(env, isLoopback),
      mcp: mcpUrl ? { url: mcpUrl } : null,
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: hostCorsOrigins(env) },
      clientIp: (request) => clientIpFromHeaders(request.headers),
      isDirectLoopback: isLoopback,
      log: (event) => {
        if ((event.status ?? 0) >= 500) console.error(JSON.stringify(event));
      },
    },
    { service: options.service ?? "shenron-server" },
  );

  const mark = (request: Request, server: Bun.Server<ChatSocketData>) => {
    if (isDirectLoopback(request.headers, server.requestIP(request)?.address))
      loopback.add(request);
  };

  const serveAsset: HostRoute = async (request, server) => {
    mark(request, server);
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = assetFile(assetsDir, path);
    if (file)
      return staticFileResponse(request, file, { "Cache-Control": "public, max-age=86400" });
    if (opened && opened.vfs.exists(path)) {
      const stat = opened.vfs.stat(path);
      if (!(publicOnly && stat.visibility === "private")) {
        try {
          return new Response((await opened.vfs.read(path)) as Uint8Array<ArrayBuffer>, {
            headers: {
              "Content-Type": stat.mime ?? "application/octet-stream",
              "Cache-Control": "public, max-age=86400",
            },
          });
        } catch (error) {
          return Response.json(
            { error: "asset unavailable", code: "upstream_unavailable", message: String(error) },
            { status: 502 },
          );
        }
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };

  return {
    api,
    vfs: opened,
    conversations,
    serveOptions() {
      const routes: Record<string, Record<string, HostRoute>> = {};
      for (const [path, methods] of Object.entries(api.routes)) {
        const entry: Record<string, HostRoute> = {};
        for (const [method, handler] of Object.entries(methods)) {
          if (!handler) continue;
          entry[method] = (request, server) => {
            mark(request, server);
            return handler(request, server);
          };
        }
        routes[path] = entry;
      }
      routes["/assets/*"] = { GET: serveAsset };
      return {
        routes,
        websocket: api.websocket,
        fetch: (request: Request, server: Bun.Server<ChatSocketData>) => {
          mark(request, server);
          return api.fetch(request, server);
        },
        idleTimeout: 120,
      } as unknown as Bun.Serve.Options<ChatSocketData>;
    },
    async close() {
      mcp?.close();
      opened?.vfs.db.close();
      await pg?.close();
    },
  };
}

/** Start the API with `Bun.serve` on `SHENRON_API_HOST`:`SHENRON_API_PORT` (`@shenron/config/services`). */
export function serveShenronApi(env: EnvSource, options: LocalApiOptions = {}) {
  const local = createLocalApi(env, options);
  const bind = resolveShenronApiBind(env);
  const server = Bun.serve({
    port: bind.port,
    hostname: bind.hostname,
    ...local.serveOptions(),
  } as Bun.Serve.Options<ChatSocketData>);
  return { ...local, server };
}
