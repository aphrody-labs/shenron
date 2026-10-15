// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-api/host` — composition of the single Shenron API server from an explicit
 * environment record: VFS database (file or embedded), RAG with the corpus embedder, chat
 * engine (Gemini web → local llama-server) with the owner's persistent memory when the host
 * process provides it, MCP tools (`shenron-mcp`), OCR
 * (`aphrody ocr ppocr`), conversation store (SQLite or PostgreSQL), owner/admin auth, static
 * assets with precompressed siblings and the MCP reverse proxy. `serveShenronApi(env)` starts
 * it with `Bun.serve`; a front server mounts it with `handles()`, `fetch()` and `websocket`.
 * Hosts: `apps/server` (front of `shenron-server`, desktop sidecar), the bot. Runtime class: `bun`.
 *
 * A capability that is missing disables its group (no route, `groups[name].available` false
 * with a short French reason): no VFS, no usable chat backend, no `aphrody` for the OCR, no
 * MCP URL, an unwritable conversation store. Nothing here throws for a missing capability.
 *
 * The caller passes the environment (`process.env` in an entry point): nothing is read at
 * module load. Variables are listed in docs/architecture/STACK.md §3.6.
 */
import { createPublicRagPort } from "./rag";
import { createHostFavorites } from "./favorites";
import type { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize, resolve, sep } from "node:path";
import { verifyActingUser } from "@aphrody/shenron-auth/acting-user";
import { AUTH_BASE_PATH } from "@aphrody/shenron-auth";
import { hmacSha256Hex, parseBearer, timingSafeEqualString } from "@aphrody/shenron-auth/crypto";
import {
  ENV_ALIASES,
  envFirst,
  envString,
  type EnvSource,
  isProduction,
} from "@aphrody/shenron-config/env";
import {
  chatMemoryAgentId,
  legacyChatMemoryAgentId,
  resolveChatMemory,
} from "@aphrody/shenron-config/memory";
import { clientIpFromHeaders, isDirectLoopback } from "@aphrody/shenron-config/net";
import { DEV_SITE_ORIGIN, originOf, resolveSiteUrl } from "@aphrody/shenron-config/public-urls";
import { resolveShenronApiBind } from "@aphrody/shenron-config/services";
import { PgConversationStore, SqliteConversationStore } from "@aphrody/shenron-db/conversations";
import type { ConversationStore } from "@aphrody/shenron-db/conversations/types";
import {
  createE5Embedder,
  defaultCdn,
  type OpenedVfs,
  openShenronVfs,
  RAG_EMBED_MODEL,
} from "@aphrody/shenron-db/vfs";
import { isPublicRagRow } from "@aphrody/shenron-db/vfs/build";
import { createChatEngine } from "../chat/engine";
import { agentHomeFromDir, agentHomeFromVfs } from "../chat/home";
import { backendsFromEnv, geminiCookieCandidates, type LlmBackend } from "../chat/llm";
import { createStdioMcpClient } from "../chat/mcp";
import { createPluginPort, resolvePluginRoot } from "../plugin";
import { createCliOcr } from "../chat/ocr";
import { createHostAuth } from "./auth";
import { createDesktopLinkHandler } from "./desktop-link";
import { DESKTOP_LINK } from "@aphrody/shenron-db/agent-homes/types";
import { createHostWikiLaunch } from "./wiki-launch";
import { createHostChronology } from "./chronology";
import { createHostPageBanners } from "./page-banners";
import { createHostHome } from "./home";
import { createHostSiteTheme } from "./site-theme";
import type { ChatModelEntry } from "../contract/chat";
import type { LocalApiGroups, LocalApiGroupStatus } from "../contract/local";
import type { RagHit, RagSearchQuery } from "../contract/schemas";
import { createMemoryRateLimiter, createPublicCache, noopInvalidation } from "../http";
import {
  type AuthPort,
  type BetterAuthPort,
  type HostSession,
  type ChatSocketData,
  createShenronApi,
  type MemoryPort,
  type RagPort,
  type ShenronApi,
  type ShenronApiService,
  type VfsPort,
  type WebPort,
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
 * Discord acting user (`SHENRON_USER_SECRET`/`API_USER_SECRET`, owner `discord:<id>`), Better
 * Auth session of the host (cookie or Bearer: `discord:<id>` or `user:<id>`), then —
 * direct loopback only — the local desktop owner (`SHENRON_LOCAL_OWNER`, default `local`; an
 * empty value disables it). Admin: Bearer equal to `SHENRON_ADMIN_TOKEN`/`API_ADMIN_TOKEN`, or a staff session
 * (`OWNER_ID` ∪ `OAUTH_ALLOWED_USERS`).
 */
export function createEnvAuth(
  env: EnvSource,
  isLoopback: (request: Request) => boolean,
  session?: BetterAuthPort["session"] | null,
): AuthPort {
  const sessionOf = async (request: Request): Promise<HostSession | null> => {
    if (!session) return null;
    try {
      return await session(request.headers);
    } catch {
      return null;
    }
  };
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
      // Better Auth session (cookie or bearer): the Discord id when linked, else the user id.
      const found = await sessionOf(request);
      if (found) {
        const id = found.discordId ? `discord:${found.discordId}` : `user:${found.userId}`;
        if (OWNER_ID.test(id)) return id;
      }
      if (isLoopback(request) && env.SHENRON_LOCAL_OWNER !== "") {
        return envString(env, "SHENRON_LOCAL_OWNER") ?? "local";
      }
      return null;
    },
    async admin(request) {
      const token = envFirst(env, ENV_ALIASES.adminToken)?.value;
      const presented = parseBearer(request.headers, { caseSensitive: true });
      if (Boolean(token) && presented !== null && timingSafeEqualString(presented, token!))
        return true;
      return (await sessionOf(request))?.staff === true;
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
): RagPort {
  return {
    async search(query: RagSearchQuery) {
      const result = await opened.rag.searchWith(query.q, query.lexicalOnly ? null : embed, {
        // Public editorial filtering follows retrieval; keep a full candidate window.
        limit: 50,
        ...(query.kind ? { kinds: [query.kind] } : {}),
        publicOnly: true,
      });
      const hits: RagHit[] = [];
      for (const hit of result.hits) {
        if (!isPublicRagRow({ url: hit.url, metadata: { originSourceId: hit.sourceId } })) continue;
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
        hits: hits.slice(0, query.limit ?? 8),
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
  /** Canonical editorial retrieval assembled by the product when RAG_BACKEND=aphrody. */
  rag?: RagPort | null;
  /** Qualified native capabilities injected by the product host. */
  web?: WebPort | null;
  service?: ShenronApiService;
  /** Already-open VFS database (embedded binary) instead of `SHENRON_VFS_DB`. */
  vfsDatabase?: Database;
  /** VFS path → readable file (`$bunfs` path or extracted payload file) of embedded nodes. */
  embedded?: Readonly<Record<string, string>>;
  /** Conversation store override (tests); `null` disables the store. */
  conversations?: ConversationStore | null;
  /** `false` leaves the wiki routes to another host (the site on PostgreSQL in production). */
  wiki?: boolean;
  /**
   * Persistent chat memory (Aphrody `aphrody-memory`), opened by the host process (`bun:ffi`
   * lives in `@aphrody/shenron-native`, outside this package) from the settings of
   * `@aphrody/shenron-config/memory`. Absent or `null`: the memory group stays disabled.
   */
  memory?: MemoryFactory | null;
  /**
   * Injection point of the agent home resolver: the memory database of one agent home
   * (`discord:<user_id>`, `local`). Absent: every home shares the default file
   * (SHENRON_MEMORY_DB, else `<data>/memory.sqlite`), records scoped by agent id.
   */
  memoryLocation?: MemoryLocation | null;
  /**
   * Earlier agent ids of one agent home whose records sit in its database (`local` before the
   * desktop signs in as `discord:<user_id>`): moved to the current id on first use.
   */
  memoryAliases?: ((agentId: string) => readonly string[]) | null;
  /**
   * Agent home resolver: the directory of an owner's own agent home (`discord:<user_id>`,
   * `local`; native `aphrody-agent-home` layout), or `null` for the shared persona (the VFS
   * `/home`, else APHRODY_WORKSPACE).
   */
  agentHome?: ((ownerId: string) => string | null) | null;
  /**
   * Better Auth on `/api/auth/*` (override for tests; `null` disables). Absent: built from the
   * environment (`DATABASE_URL`, Discord application, `BETTER_AUTH_SECRET`), see `./auth`.
   */
  betterAuth?: BetterAuthPort | null;
  fetch?: typeof fetch;
  /** Local models the server manages (llama-server router of shenron-server), with their state. */
  chatModels?: () => Promise<ChatModelEntry[]>;
}

/** SQLite file of the memory of agent home `agentId` (absolute path). */
export type MemoryLocation = (agentId: string) => string;

/** Where each memory lives and whose it is. */
export interface MemorySettings {
  /** Agent id of an owner: the id of their agent home (`discord:<user_id>`, `local`). */
  agentId(owner: string): string;
  /** Database of an agent home (`memoryLocation`, else the default file). */
  dbPath(agentId: string): string;
  /** Earlier agent ids of the same home, in its database (`memoryAliases`; default none). */
  aliases(agentId: string): readonly string[];
  /** Records written before the agent homes (`shenron/<owner>` in the default file). */
  legacy: { dbPath: string; agentId(owner: string): string };
}

/** Open the memory: its port, or the short French reason it is unavailable. */
export type MemoryFactory = (settings: MemorySettings) => { port: MemoryPort } | { reason: string };

export interface LocalApi {
  api: ShenronApi;
  vfs: OpenedVfs | null;
  conversations: ConversationStore | null;
  /** Availability of each API group, fixed at creation. */
  groups: LocalApiGroups;
  /** `true` for a path this host answers (enabled API routes, `/mcp`, `/assets/*`). */
  handles(pathname: string): boolean;
  /** Answer a request in a front `Bun.serve` (loopback detection, `/assets/*`, WebSocket upgrade). */
  fetch(request: Request, server: Bun.Server<ChatSocketData>): Promise<Response>;
  /** WebSocket handlers of `/api/v1/chat/ws`, for the front `Bun.serve`. */
  websocket: Bun.WebSocketHandler<ChatSocketData>;
  /** Bun.serve options (`routes`, `websocket`, `fetch`) with loopback detection and `/assets/*`. */
  serveOptions(): Bun.Serve.Options<ChatSocketData>;
  close(): Promise<void>;
}

type HostRoute = (
  request: Request,
  server: Bun.Server<ChatSocketData>,
) => Response | Promise<Response>;

const available = (): LocalApiGroupStatus => ({ available: true });
const unavailable = (reason: string): LocalApiGroupStatus => ({ available: false, reason });

/**
 * Chat backends this host can call: `local` (built only when its OpenAI-compatible URL is
 * declared: llama-server, aphrody-llama-daemon), `extractive` (only when listed in
 * `SHENRON_CHAT_BACKENDS`) and `gemini-web` when its client is installed with a cookie store.
 */
export function usableChatBackends(
  env: EnvSource,
  home = envString(env, "HOME") ?? homedir(),
): LlmBackend[] {
  return backendsFromEnv(env).filter((backend) => {
    if (backend.id !== "gemini-web") return true;
    const binary = envString(env, "APHRODY_GEMINI_WEB_BIN") ?? "aphrody-gemini-web";
    const installed = /[\\/]/.test(binary) ? existsSync(binary) : Bun.which(binary) !== null;
    return installed && geminiCookieCandidates(env, home).some((path) => existsSync(path));
  });
}

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
    let candidate: OpenedVfs | null = null;
    try {
      candidate = openShenronVfs(paths.vfs, {
        readOnly: true,
        embedded: options.embedded ?? {},
        cdn,
      });
      // SQLite opens any file lazily: read the root node now so a foreign file fails here.
      candidate.vfs.stat("/");
      opened = candidate;
    } catch (error) {
      // An unreadable or foreign file disables the VFS groups; the cause stays in the log.
      candidate?.vfs.db.close();
      console.error(JSON.stringify({ event: "shenron.api.vfs_unavailable", error: String(error) }));
    }
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
  let storeReason = "stockage des conversations désactivé";
  let pg: InstanceType<typeof Bun.SQL> | null = null;
  let sqlite: SqliteConversationStore | null = null;
  if (options.conversations === undefined) {
    const pgUrl = envString(env, "SHENRON_CHAT_PG_URL");
    try {
      if (pgUrl) {
        pg = new Bun.SQL(pgUrl);
        conversations = new PgConversationStore(pg, {
          schema: envString(env, "SHENRON_CHAT_PG_SCHEMA") ?? "chat",
        });
      } else if (env.SHENRON_CHAT_STORE !== "off") {
        sqlite = new SqliteConversationStore(paths.conversations);
        conversations = sqlite;
      }
    } catch (error) {
      // The SQLite cause stays in the log (never a PostgreSQL URL, which may hold a password);
      // the groups report a short reason only.
      console.error(
        JSON.stringify({
          event: "shenron.api.conversations_unavailable",
          error: pgUrl ? "invalid PostgreSQL URL" : String(error),
        }),
      );
      storeReason = "base des conversations inaccessible";
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
  const ocr = createCliOcr({ binary: envString(env, "APHRODY_BIN") ?? "aphrody" });
  const ocrPort = ocr.available() ? ocr : null;

  // Persistent chat memory: off by SHENRON_MEMORY=off, else opened by the host process.
  const memorySettings = resolveChatMemory(env, paths.data);
  let memory: MemoryPort | null = null;
  let memoryReason = "mémoire du chat non disponible sur ce serveur";
  if (!memorySettings.dbPath) memoryReason = "mémoire du chat désactivée";
  else if (options.memory) {
    try {
      const defaultDb = memorySettings.dbPath;
      const location = options.memoryLocation ?? null;
      const opened = options.memory({
        agentId: chatMemoryAgentId,
        dbPath: (agentId) => location?.(agentId) ?? defaultDb,
        aliases: (agentId) => options.memoryAliases?.(agentId) ?? [],
        legacy: { dbPath: defaultDb, agentId: legacyChatMemoryAgentId },
      });
      if ("port" in opened) memory = opened.port;
      else memoryReason = opened.reason;
    } catch (error) {
      // The cause (path, library error) stays in the log.
      console.error(
        JSON.stringify({ event: "shenron.api.memory_unavailable", error: String(error) }),
      );
      memoryReason = "mémoire du chat inaccessible";
    }
  }

  // Only the backends this host can call: none disables the chat and models routes.
  const backends = usableChatBackends(env);
  // Le binaire autonome ne sert le plugin que si `SHENRON_PLUGIN_DIR` le désigne.
  const pluginDir = envString(env, "SHENRON_PLUGIN_DIR");
  const pluginRoot = pluginDir ? resolvePluginRoot({ SHENRON_PLUGIN_DIR: pluginDir }) : null;
  const pluginPort = pluginRoot
    ? createPluginPort(pluginRoot, {
        archiver: (entries) => new Bun.Archive(entries, { compress: "gzip", level: 9 }).bytes(),
        agentHome: true,
      })
    : null;
  const usesAphrodyRag = envString(env, "RAG_BACKEND") === "aphrody";
  let rag: RagPort | null = null;
  let ragReason = "aucun VFS Shenron installé";
  if (usesAphrodyRag) {
    rag = options.rag ? createPublicRagPort(options.rag) : null;
    ragReason = "configuration du RAG Aphrody absente ou invalide";
  } else if (opened) rag = createVfsRagPort(opened, embedder?.query ?? null);
  const engine = createChatEngine({
    rag: usesAphrodyRag ? null : (opened?.rag ?? null),
    ...(usesAphrodyRag
      ? {
          retrieval: async (query, request) => {
            if (!rag) throw new Error("RAG Aphrody indisponible");
            const result = await rag.search({
              q: query,
              limit: 25,
              ...(request.kinds?.length === 1 ? { kind: request.kinds[0] } : {}),
            });
            return {
              mode: result.mode === "lexical" ? ("lexical" as const) : ("hybrid" as const),
              hits: result.hits
                .filter((hit) => !request.kinds?.length || request.kinds.includes(hit.kind))
                .slice(0, request.limit)
                .map((hit) => ({ ...hit, corpus: "shenron", content: hit.content ?? hit.snippet })),
            };
          },
        }
      : {}),
    embed: embedder?.query ?? null,
    embedderModel: embedModel,
    publicOnly,
    backends,
    home: (ownerId) => {
      const own = options.agentHome?.(ownerId);
      if (own) return agentHomeFromDir(own);
      return opened && opened.vfs.exists("/home/SOUL.md")
        ? agentHomeFromVfs(opened.vfs)
        : agentHomeFromDir(paths.agentHome);
    },
    mcp,
    ocr: ocrPort,
    store: conversations,
    memory,
    memoryRecall: memorySettings.recall,
    memoryRemote: memorySettings.remote,
    // Every model reads the plugin index; the managed local models list themselves.
    plugin: pluginPort,
    catalog: options.chatModels ?? null,
    defaultPersona: envString(env, "SHENRON_CHAT_PERSONA") ?? "shenron",
    log: (event) => console.error(JSON.stringify(event)),
  });

  const chat = backends.length > 0 ? engine : null;
  const wiki = opened && options.wiki !== false ? opened.wiki : null;
  const assetsDir = envString(env, "SHENRON_ASSETS_DIR") ?? null;
  const mcpUrl = envString(env, "SHENRON_MCP_URL");
  const authBuilt =
    options.betterAuth === undefined
      ? createHostAuth(env)
      : options.betterAuth
        ? { port: options.betterAuth }
        : { reason: "authentification désactivée" };
  const betterAuthPort = "port" in authBuilt ? authBuilt.port : null;
  const isAuthPath = (pathname: string) =>
    pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`);
  const unavailableAuth = (request: Request) =>
    !betterAuthPort && isAuthPath(new URL(request.url).pathname)
      ? Response.json(
          { error: "auth_unavailable" },
          {
            status: 503,
            headers: { "Cache-Control": "private, no-store" },
          },
        )
      : null;
  const desktopLink = createDesktopLinkHandler(env, betterAuthPort);
  const isDesktopLink = (pathname: string) =>
    pathname === DESKTOP_LINK.sitePath || pathname === DESKTOP_LINK.verifyPath;
  const wikiLaunch = createHostWikiLaunch(env);
  const chronology = createHostChronology(env);
  const pageBanners = createHostPageBanners(env);
  const homeConfig = createHostHome(env);
  const siteTheme = createHostSiteTheme(env);
  const favorites = createHostFavorites(env);
  const api = createShenronApi(
    {
      wikiLaunch: wikiLaunch?.port,
      chronology: chronology?.port,
      pageBanners: pageBanners?.port,
      homeConfig: homeConfig?.port,
      siteTheme: siteTheme?.port,
      favorites: favorites?.port,
      wiki,
      rag,
      chat,
      conversations,
      memory,
      vfs: opened ? createVfsPort(opened, { publicOnly, assetsDir }) : null,
      ocr: ocrPort,
      auth: createEnvAuth(env, isLoopback, betterAuthPort?.session),
      betterAuth: betterAuthPort,
      mcp: mcpUrl ? { url: mcpUrl } : null,
      // `/api/public/plugin*` quand `SHENRON_PLUGIN_DIR` désigne un plugin lisible.
      plugin: pluginPort,
      web: options.web,
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
          // The cause (CDN origin, cache path) stays in the log.
          console.error(
            JSON.stringify({ event: "shenron.api.asset_unavailable", path, error: String(error) }),
          );
          return Response.json(
            { error: "asset unavailable", code: "upstream_unavailable" },
            { status: 502 },
          );
        }
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  };

  const vfsMissing = "aucun VFS Shenron installé";
  const store = conversations ? available() : unavailable(storeReason);
  const chatGroup = chat
    ? available()
    : unavailable("aucun modèle de chat déclaré (llama-server, aphrody-llama-daemon)");
  const groups: LocalApiGroups = {
    web: options.web ? available() : unavailable("capacités Web natives indisponibles"),
    wiki: wiki ? available() : unavailable(opened ? "wiki servi par le site" : vfsMissing),
    rag: rag ? available() : unavailable(ragReason),
    chat: chatGroup,
    conversations: store,
    sync: { ...store },
    vfs: opened ? available() : unavailable(vfsMissing),
    ocr: ocrPort ? available() : unavailable("aphrody introuvable : OCR indisponible"),
    mcp: mcpUrl ? available() : unavailable("serveur MCP non configuré"),
    models: { ...chatGroup },
    memory: memory ? available() : unavailable(memoryReason),
    auth: "port" in authBuilt ? available() : unavailable(authBuilt.reason),
  };
  const servesAssets = assetsDir !== null || opened !== null;
  const isAsset = (pathname: string) => servesAssets && pathname.startsWith("/assets/");

  return {
    api,
    vfs: opened,
    conversations,
    groups,
    handles: (pathname) =>
      isAuthPath(pathname) || isDesktopLink(pathname) || isAsset(pathname) || api.handles(pathname),
    async fetch(request, server) {
      mark(request, server);
      const unavailable = unavailableAuth(request);
      if (unavailable) return unavailable;
      const method = request.method;
      if (isDesktopLink(new URL(request.url).pathname)) return desktopLink(request);
      if (isAsset(new URL(request.url).pathname) && (method === "GET" || method === "HEAD"))
        return serveAsset(request, server);
      return api.fetch(request, server);
    },
    websocket: api.websocket,
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
      routes[DESKTOP_LINK.sitePath] = { GET: desktopLink };
      routes[DESKTOP_LINK.verifyPath] = { POST: desktopLink };
      return {
        routes,
        websocket: api.websocket,
        fetch: (request: Request, server: Bun.Server<ChatSocketData>) => {
          mark(request, server);
          const unavailable = unavailableAuth(request);
          if (unavailable) return unavailable;
          if (isDesktopLink(new URL(request.url).pathname)) return desktopLink(request);
          return api.fetch(request, server);
        },
        // Explicit: Bun derives the default from NODE_ENV, which a host may leave unset.
        development: false,
        idleTimeout: 120,
      } as unknown as Bun.Serve.Options<ChatSocketData>;
    },
    async close() {
      await wikiLaunch?.close();
      await chronology?.close();
      await pageBanners?.close();
      await homeConfig?.close();
      await siteTheme?.close();
      await favorites?.close();
      if ("close" in authBuilt) await authBuilt.close();
      mcp?.close();
      opened?.vfs.db.close();
      sqlite?.db.close();
      await pg?.close();
    },
  };
}

/** Start the API with `Bun.serve` on `SHENRON_API_HOST`:`SHENRON_API_PORT` (`@aphrody/shenron-config/services`). */
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
