// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/api/host` — composition of the single Shenron API server from the environment:
 * VFS database (file or embedded), RAG with the corpus embedder, chat engine (Gemini web →
 * local llama-server), MCP tools (`shenron-mcp`), OCR (`shenron ocr image`), conversation
 * store (SQLite or PostgreSQL), owner/admin auth, static assets with precompressed siblings
 * and the MCP reverse proxy. `serveShenronApi()` starts it with `Bun.serve`.
 * Hosts: `apps/server`, the desktop sidecar, the bot. Runtime class: `bun`.
 */
import type { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve, sep } from "node:path";
import { verifyActingUser } from "@shenron/auth/acting-user";
import { PgConversationStore, SqliteConversationStore } from "@shenron/db/conversations";
import type { ConversationStore } from "@shenron/db/conversations/types";
import {
  createE5Embedder,
  defaultCdn,
  type OpenedVfs,
  openShenronVfs,
  RAG_EMBED_MODEL,
} from "@shenron/db/vfs";
import { agentHomeFromDir, agentHomeFromVfs } from "../chat/home";
import { backendsFromEnv } from "../chat/llm";
import { createStdioMcpClient } from "../chat/mcp";
import { createCliOcr } from "../chat/ocr";
import { createChatEngine } from "../chat/engine";
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

export type Env = Record<string, string | undefined>;

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** HMAC-SHA256 hex (`Bun.CryptoHasher`). */
export function hmacHex(secret: string, message: string): string {
  return new Bun.CryptoHasher("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Headers of a signed owner (site session user, desktop account): `X-Shenron-Owner{,-Ts,-Sig}`. */
export function signOwner(secret: string, ownerId: string, nowMs = Date.now()): Record<string, string> {
  const ts = String(nowMs);
  return {
    "X-Shenron-Owner": ownerId,
    "X-Shenron-Owner-Ts": ts,
    "X-Shenron-Owner-Sig": hmacHex(secret, `${ownerId}:${ts}`),
  };
}

const OWNER_SKEW_MS = 5 * 60_000;

/**
 * Owner resolution, first match wins: signed owner headers (`SHENRON_OWNER_SECRET`), signed
 * Discord acting user (`API_USER_SECRET`, owner `discord:<id>`), then — direct loopback only —
 * the local desktop owner (`SHENRON_LOCAL_OWNER`, default `local`). Admin: bearer equal to
 * `SHENRON_API_ADMIN_TOKEN`.
 */
export function createEnvAuth(env: Env, isLoopback: (request: Request) => boolean): AuthPort {
  return {
    async owner(request) {
      const ownerSecret = env.SHENRON_OWNER_SECRET?.trim();
      const owner = request.headers.get("x-shenron-owner");
      if (ownerSecret && owner) {
        const ts = Number(request.headers.get("x-shenron-owner-ts"));
        const sig = request.headers.get("x-shenron-owner-sig")?.toLowerCase() ?? "";
        if (
          /^[A-Za-z0-9_:@.-]{1,128}$/.test(owner) &&
          Number.isFinite(ts) &&
          Math.abs(Date.now() - ts) <= OWNER_SKEW_MS &&
          safeEqual(hmacHex(ownerSecret, `${owner}:${ts}`), sig)
        )
          return owner;
        return null;
      }
      const acting = verifyActingUser(request.headers, { secret: env.API_USER_SECRET?.trim() });
      if (acting.ok) return `discord:${acting.discordId}`;
      if (isLoopback(request) && env.SHENRON_LOCAL_OWNER !== "") return env.SHENRON_LOCAL_OWNER?.trim() || "local";
      return null;
    },
    async admin(request) {
      const token = env.SHENRON_API_ADMIN_TOKEN?.trim();
      const header = request.headers.get("authorization") ?? "";
      return Boolean(token) && header.startsWith("Bearer ") && safeEqual(header.slice(7).trim(), token!);
    },
  };
}

/** Default locations (all private, outside the repository). */
export function hostPaths(env: Env) {
  const home = env.HOME ?? homedir();
  const data = env.SHENRON_DATA_DIR?.trim() || join(env.XDG_DATA_HOME?.trim() || join(home, ".local", "share"), "shenron");
  return {
    data,
    vfs: env.SHENRON_VFS_DB?.trim() || join(data, "shenron-vfs.sqlite"),
    conversations: env.SHENRON_CHAT_STORE?.trim() || join(data, "conversations.sqlite"),
    agentHome: env.APHRODY_WORKSPACE?.trim() || join(env.APHRODY_HOME?.trim() || join(home, ".aphrody"), "workspaces", "dbfr"),
  };
}

/** Contract `RagHit` view of the VFS retrieval. */
export function createVfsRagPort(opened: OpenedVfs, embed: ((text: string) => Promise<Float32Array>) | null, publicOnly: boolean): RagPort {
  return {
    async search(query: RagSearchQuery) {
      const kinds = query.kind ? [query.kind] : undefined;
      const result = await opened.rag.searchWith(query.q, query.lexicalOnly ? null : embed, {
        limit: query.limit ?? 8,
        ...(kinds ? { kinds } : {}),
        publicOnly,
      });
      const hits: RagHit[] = result.hits
        .filter((hit) => !query.lang || hit.lang === query.lang)
        .filter((hit) => !query.sourceId || hit.sourceId === query.sourceId)
        .map((hit) => ({
          rowid: hit.chunkId,
          kind: hit.kind,
          title: hit.title,
          url: hit.url ?? "",
          snippet: hit.snippet,
          score: Math.round(hit.score * 10_000) / 10_000,
          ...(hit.sourceId ? { sourceId: hit.sourceId } : {}),
          ...(hit.lang ? { lang: hit.lang } : {}),
          content: hit.content,
        }));
      return { mode: result.mode, hits, ...(result.embedError ? { error: `embedder: ${result.embedError}` } : {}) };
    },
  };
}

/** `VfsPort` of the API over an opened VFS; `assetsDir` serves local files without a copy. */
export function createVfsPort(opened: OpenedVfs, options: { publicOnly: boolean; assetsDir?: string | null }): VfsPort {
  const { vfs, rag } = opened;
  return {
    publicOnly: options.publicOnly,
    info() {
      const stats = vfs.stats();
      const wiki = (vfs.query<{ n: number }>("SELECT COUNT(*) AS n FROM wiki_entities")[0]?.n ?? 0) as number;
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
      if (!options.assetsDir || !path.startsWith("/assets/")) return null;
      const root = resolve(options.assetsDir);
      const file = normalize(join(root, path.slice("/assets/".length)));
      if (!file.startsWith(root + sep)) return null;
      return existsSync(file) && statSync(file).isFile() ? file : null;
    },
    query: (sql, params) => vfs.query(sql, params),
  };
}

/** Static file with a precompressed sibling (`.br`, `.gz`) chosen from `Accept-Encoding`. */
export function staticFileResponse(request: Request, file: string, headers: Record<string, string> = {}): Response {
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
        headers: { ...headers, "Content-Type": type, "Content-Encoding": encoding, Vary: "Accept-Encoding" },
      });
    }
  }
  return new Response(Bun.file(file), { headers: { ...headers, "Content-Type": type, Vary: "Accept-Encoding" } });
}

export interface LocalApiOptions {
  service?: ShenronApiService;
  /** Already-open VFS database (embedded binary) instead of `SHENRON_VFS_DB`. */
  vfsDatabase?: Database;
  /** VFS path → `$bunfs` path of embedded files. */
  embedded?: Readonly<Record<string, string>>;
  /** Conversation store override (tests). */
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

export function createLocalApi(env: Env = process.env, options: LocalApiOptions = {}): LocalApi {
  const paths = hostPaths(env);
  const publicOnly = env.SHENRON_PROFILE === "public" || env.SHENRON_VFS_PUBLIC_ONLY === "1";
  const opened =
    options.vfsDatabase
      ? openShenronVfs(options.vfsDatabase, { readOnly: true, embedded: options.embedded ?? {}, cdn: defaultCdn(env) })
      : existsSync(paths.vfs)
        ? openShenronVfs(paths.vfs, { readOnly: true, cdn: defaultCdn(env) })
        : null;
  const embedBase = env.APHRODY_AI_EMBED_BASE_URL?.trim();
  const embedder = embedBase ? createE5Embedder({ baseUrl: embedBase, model: env.APHRODY_AI_EMBED_MODEL?.trim() || RAG_EMBED_MODEL, ...(options.fetch ? { fetch: options.fetch } : {}) }) : null;

  let conversations: ConversationStore | null = options.conversations ?? null;
  let pg: InstanceType<typeof Bun.SQL> | null = null;
  if (options.conversations === undefined) {
    const pgUrl = env.SHENRON_CHAT_PG_URL?.trim();
    if (pgUrl) {
      pg = new Bun.SQL(pgUrl);
      conversations = new PgConversationStore(pg, { schema: env.SHENRON_CHAT_PG_SCHEMA?.trim() || "chat" });
    } else if (env.SHENRON_CHAT_STORE !== "off") {
      conversations = new SqliteConversationStore(paths.conversations);
    }
  }

  const loopback = new WeakSet<Request>();
  const isLoopback = (request: Request) => loopback.has(request);
  const mcpBin = env.SHENRON_MCP_BIN?.trim() || (Bun.which("shenron-mcp") ? "shenron-mcp" : "");
  const mcp = mcpBin && env.SHENRON_CHAT_TOOLS !== "0"
    ? createStdioMcpClient({ command: [mcpBin], env: { ...(existsSync(paths.vfs) ? { SHENRON_VFS_DB: paths.vfs } : {}) } })
    : null;
  const ocrBin = env.SHENRON_CLI_BIN?.trim() || "shenron";
  const ocr = createCliOcr({ binary: ocrBin });

  const engine = createChatEngine({
    rag: opened?.rag ?? null,
    embed: embedder?.query ?? null,
    embedderModel: env.APHRODY_AI_EMBED_MODEL?.trim() || RAG_EMBED_MODEL,
    publicOnly,
    backends: backendsFromEnv(env),
    home: () => (opened && opened.vfs.exists("/home/SOUL.md") ? agentHomeFromVfs(opened.vfs) : agentHomeFromDir(paths.agentHome)),
    mcp,
    ocr: ocr.available() ? ocr : null,
    store: conversations,
    defaultPersona: env.SHENRON_CHAT_PERSONA?.trim() || "shenron",
    log: (event) => console.error(JSON.stringify(event)),
  });

  const origins = (env.SHENRON_CORS_ORIGINS ?? "https://dragonballfr.com,https://www.dragonballfr.com,http://localhost:3000,http://127.0.0.1:3000,tauri://localhost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const api = createShenronApi(
    {
      wiki: opened ? opened.wiki : null,
      rag: opened ? createVfsRagPort(opened, embedder?.query ?? null, publicOnly) : null,
      chat: engine,
      conversations,
      vfs: opened ? createVfsPort(opened, { publicOnly, assetsDir: env.SHENRON_ASSETS_DIR?.trim() || null }) : null,
      ocr: ocr.available() ? ocr : null,
      auth: createEnvAuth(env, isLoopback),
      mcp: env.SHENRON_MCP_URL?.trim() ? { url: env.SHENRON_MCP_URL.trim() } : null,
      rateLimit: createMemoryRateLimiter(),
      publicCache: createPublicCache(),
      invalidation: noopInvalidation,
      cors: { allowedOrigins: origins },
      clientIp: (request) => request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local",
      isDirectLoopback: isLoopback,
      log: (event) => {
        if ((event.status ?? 0) >= 500) console.error(JSON.stringify(event));
      },
    },
    { service: options.service ?? "shenron-server" },
  );

  const mark = (request: Request, server: Bun.Server<ChatSocketData>) => {
    const address = server.requestIP(request)?.address;
    // A proxied request (X-Forwarded-For) is never a direct loopback request.
    if (address && LOOPBACK.has(address) && !request.headers.has("x-forwarded-for")) loopback.add(request);
  };
  const assetsDir = env.SHENRON_ASSETS_DIR?.trim() || null;

  return {
    api,
    vfs: opened,
    conversations,
    serveOptions() {
      const routes: Record<string, Record<string, (request: Request, server: Bun.Server<ChatSocketData>) => Response | Promise<Response>>> = {};
      for (const [path, methods] of Object.entries(api.routes)) {
        routes[path] = {};
        for (const [method, handler] of Object.entries(methods)) {
          routes[path][method] = (request, server) => {
            mark(request, server);
            return handler!(request, server);
          };
        }
      }
      routes["/assets/*"] = {
        GET: async (request, server) => {
          mark(request, server);
          const url = new URL(request.url);
          const path = decodeURIComponent(url.pathname);
          if (assetsDir) {
            const root = resolve(assetsDir);
            const file = normalize(join(root, path.slice("/assets/".length)));
            if (file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile())
              return staticFileResponse(request, file, { "Cache-Control": "public, max-age=86400" });
          }
          if (opened && opened.vfs.exists(path)) {
            const stat = opened.vfs.stat(path);
            if (!(publicOnly && stat.visibility === "private")) {
              try {
                return new Response((await opened.vfs.read(path)) as Uint8Array<ArrayBuffer>, {
                  headers: { "Content-Type": stat.mime ?? "application/octet-stream", "Cache-Control": "public, max-age=86400" },
                });
              } catch (error) {
                return Response.json({ error: "asset unavailable", code: "upstream_unavailable", message: String(error) }, { status: 502 });
              }
            }
          }
          return Response.json({ error: "Not found" }, { status: 404 });
        },
      };
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

/** Start the API with `Bun.serve` (`SHENRON_API_PORT`, default 8797; `SHENRON_API_HOST`, default 127.0.0.1). */
export function serveShenronApi(env: Env = process.env, options: LocalApiOptions = {}) {
  const local = createLocalApi(env, options);
  const server = Bun.serve({
    port: Number(env.SHENRON_API_PORT ?? 8797),
    hostname: env.SHENRON_API_HOST ?? "127.0.0.1",
    ...local.serveOptions(),
  } as Bun.Serve.Options<ChatSocketData>);
  return { ...local, server };
}
