// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/api/server` — the single Shenron API server: one route table built from the
 * endpoint catalogue (`../contract/endpoints`), served by `Bun.serve({ routes, websocket })` or
 * embedded through `fetch(request)` (Next route handler, the bot's legacy server, tests).
 * Groups are enabled by their ports: wiki, RAG, chat (SSE, WebSocket, resumable streams),
 * conversation sync, chat memory, VFS, OCR. With no group enabled the API claims no path at all, meta
 * routes included, so an embedding host keeps its historical 404. Runtime class: `server`
 * (`bun` appears in type positions only: the site's Next runtime loads it too).
 *
 * Middleware order: client IP → CORS → method gate → rate limit (direct loopback exempt) →
 * owner/admin auth → zod validation → public cache (ETag, 304) → handler.
 */
import { resolveLaunchConfig, type LaunchConfig } from "@shenron/config/wiki-launch-config";
import { sanitizeFavorites, type Favorite } from "@shenron/config/favorites";
import { BodyLimitError, readLimitedJson } from "./read-json";
import { createHash } from "node:crypto";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { Kind, Lang, Lexicon, Term } from "@shenron/lexicon";
import { lexicon as embeddedLexicon } from "@shenron/lexicon/data";
import { isWikiCategoryName, type WikiCategoryName } from "@shenron/db/constants";
import type { ConversationStore } from "@shenron/db/conversations/types";
import { z } from "zod";
import {
  ChatRequest,
  type ChatEvent,
  type ChatRequestParsed,
  type ModelsResponse,
  type OcrResponse,
} from "../contract/chat";
import { type EndpointSpec, endpoints } from "../contract/endpoints";
import type { ApiErrorCode } from "../contract/error";
import type { AccountSessionProfile } from "../contract/account";
import type { TimelineEvent, TimelineAtlas } from "../contract/chronology";
import {
  resolveChronologyConfig,
  type ChronologyConfig,
  type TimelineItem,
} from "@shenron/config/chronology";
import { resolvePageBanners, type PageBannersConfig } from "@shenron/config/page-banners";
import { resolveHomeConfig, type HomeConfig } from "@shenron/config/home";
import { resolveSiteTheme, type SiteTheme } from "@shenron/config/site-theme";
import type { MemoryEntry, MemoryListQuery } from "../contract/memory";
import type { RagContextResponse, RagHit, RagMode, RagSearchQuery } from "../contract/schemas";
import type { VfsInfoResponse, VfsStatResponse } from "../contract/sync";
import {
  corsHeaders,
  PUBLIC_RATE_LIMIT,
  publicCacheHeaders,
  publicCacheKey,
  type InvalidationPort,
  type PublicCachePort,
  type RateLimitPort,
} from "../http";
import {
  findPluginFile,
  PLUGIN_ARCHIVE_CONTENT_TYPE,
  PLUGIN_ARCHIVE_ROOT,
  pluginIndex,
  pluginPublicOrigin,
  renderAgyPrompt,
  renderPluginExport,
  renderPluginFile,
  type PluginFormat,
  type PluginPort,
} from "../plugin";
import { buildOpenApiDocument } from "./openapi";
import { Router, SSE_HEADERS, SSE_KEEPALIVE, sseFrame } from "./router";
import { ChatStreams } from "./streams";

/** Read port of the public wiki (`createWikiReadRepository` or `createVfsWikiReadPort`). */
export interface WikiReadPort {
  categories(): Promise<{ name: string; label: string; total: number }[]>;
  list(i: {
    category: WikiCategoryName;
    limit: number;
    offset: number;
    q?: string;
  }): Promise<{ items: Record<string, unknown>[]; total: number }>;
  get(i: { category: WikiCategoryName; idOrSlug: string }): Promise<Record<string, unknown> | null>;
}

/** Public retrieval port (`createVfsRagPort` over the VFS RAG index). */
export interface RagPort {
  search(query: RagSearchQuery): Promise<{ mode: RagMode; hits: RagHit[]; error?: string }>;
}

/** Chat engine port (`createChatEngine` of `@shenron/api/chat`). */
export interface ChatEnginePort {
  run(
    input: { request: ChatRequestParsed; ownerId: string; streamId: string },
    signal: AbortSignal,
  ): AsyncIterable<ChatEvent>;
  models(): Promise<ModelsResponse>;
}

export interface OcrPort {
  recognize(bytes: Uint8Array, mediaType: string): Promise<OcrResponse>;
}

/** Minimal view of `ShenronVfs` + `VfsRag` (`@shenron/db/vfs`) used by the VFS routes. */
export interface VfsPort {
  info(): VfsInfoResponse;
  stat(path: string): Omit<VfsStatResponse, "path">;
  readDir(
    path: string,
  ): { name: string; kind: "file" | "dir"; size: number; storage: "inline" | "embedded" | "cdn" }[];
  read(path: string): Promise<Uint8Array>;
  /** Local file serving `path` without a copy (`Bun.file` in the host), when there is one. */
  localFile?(path: string): Blob | null;
  query(sql: string, params: (string | number | boolean | null)[]): Record<string, unknown>[];
  /** Hide private nodes from the public routes (public profile servers). */
  publicOnly?: boolean;
}

/**
 * Better Auth of the host (`@shenron/api/host`): `/api/auth/*` is handed to `handler` as is
 * (every method, Better Auth owns its CORS, cookies and rate limit). Absent: no route.
 */
export interface FavoritesPort {
  read(userId: string): Promise<unknown>;
  save(userId: string, favorites: Favorite[]): Promise<void>;
}

export interface HostSession {
  userId: string;
  discordId?: string | null;
  staff?: boolean;
  profile?: AccountSessionProfile | null;
}

export interface BetterAuthPort {
  handler(request: Request): Promise<Response>;
  /**
   * Better Auth session in `headers` (cookie or bearer), or null: user id, linked Discord id
   * (the owner `discord:<id>` of the conversations) and staff status (site policy).
   */
  session?(headers: Headers): Promise<HostSession | null>;
}

/** Base path of {@link BetterAuthPort}. */
export const BETTER_AUTH_PATH = "/api/auth";

export interface AuthPort {
  /** Conversation owner of the request (site session, signed bot user, desktop user), or null. */
  owner(request: Request): Promise<string | null>;
  /** `true` for an administrator (admin bearer). */
  admin(request: Request): Promise<boolean>;
}

/**
 * Persistent chat memory of each owner (Aphrody `aphrody-memory`, through `shenron-ffi` in
 * `shenron-server`). The port maps an owner onto its agent id; ids are the provider's.
 */
export interface MemoryPort {
  /** Memories of `owner`, newest first. */
  list(
    owner: string,
    query: { q?: string; tags?: string[]; limit: number },
  ): Promise<MemoryEntry[]> | MemoryEntry[];
  /** Store one memory. */
  remember(
    owner: string,
    memory: { content: string; tags: string[]; metadata: Record<string, string> },
  ): Promise<MemoryEntry> | MemoryEntry;
  /** Delete memory `id` of `owner`; `false` when the owner has no such memory. */
  forget(owner: string, id: string): Promise<boolean> | boolean;
  /** Delete every memory of `owner`; returns how many were deleted. */
  clear(owner: string): Promise<number> | number;
}

/** Reverse proxy of the MCP server (`shenron-mcp --http`), so `/mcp` goes through this server too. */
export interface McpProxyPort {
  url: string;
}

export interface ShenronApiLogEvent {
  event: string;
  path: string;
  status?: number;
  ms?: number;
}

export interface WikiLaunchPort {
  read(): Promise<LaunchConfig>;
  save(patch: Partial<LaunchConfig>, by: string | null): Promise<LaunchConfig>;
}

export interface ChronologyPort {
  read(): Promise<unknown>;
  save(config: ChronologyConfig, by: string | null): Promise<void>;
  timeline(): Promise<TimelineItem[]>;
  events(era?: string): Promise<TimelineEvent[]>;
  atlas(): Promise<TimelineAtlas>;
}

export interface PageBannersPort {
  defaults?: PageBannersConfig;
  read(): Promise<unknown>;
  save(config: PageBannersConfig, by: string | null): Promise<void>;
}

export interface HomeConfigPort {
  read(): Promise<unknown>;
  save(config: HomeConfig, by: string | null): Promise<void>;
}

export interface SiteThemePort {
  read(): Promise<unknown>;
  save(theme: SiteTheme, by: string | null): Promise<void>;
}

export interface ShenronApiPorts {
  wikiLaunch?: WikiLaunchPort | null;
  chronology?: ChronologyPort | null;
  pageBanners?: PageBannersPort | null;
  homeConfig?: HomeConfigPort | null;
  siteTheme?: SiteThemePort | null;
  /** Absent → wiki group disabled → `handles()` false → historical 404. */
  wiki?: WikiReadPort | null;
  rag?: RagPort | null;
  chat?: ChatEnginePort | null;
  conversations?: ConversationStore | null;
  /** Persistent chat memory (`/api/v1/memory*`); absent → group disabled. */
  memory?: MemoryPort | null;
  vfs?: VfsPort | null;
  ocr?: OcrPort | null;
  auth?: AuthPort | null;
  /** Better Auth handler on `/api/auth/*`; absent → group disabled, the path is not claimed. */
  betterAuth?: BetterAuthPort | null;
  favorites?: FavoritesPort | null;
  mcp?: McpProxyPort | null;
  /** Plugin « shenron » relu depuis `plugin/` du déploiement (`@shenron/api/plugin`). */
  plugin?: PluginPort | null;
  /**
   * Public origin of the absolute links the API writes (plugin index and exports), e.g. the
   * site's `SITE_URL`. Absent: trusted `X-Forwarded-*` behind a loopback proxy, then the
   * request origin (`pluginPublicOrigin`).
   */
  publicOrigin?: string | null;
  /**
   * Trilingual lexicon (`/api/public/lexicon*`), served beside any other group: the embedded
   * `@shenron/lexicon` when absent, `null` to disable it.
   */
  lexicon?: Lexicon | null;
  rateLimit: RateLimitPort;
  publicCache: PublicCachePort;
  invalidation: InvalidationPort;
  cors: { allowedOrigins: readonly string[] };
  clientIp(request: Request): string;
  isDirectLoopback(request: Request): boolean;
  /** Never receives headers or bodies. */
  log?(event: ShenronApiLogEvent): void;
}

export type ShenronApiService =
  | "shenron-bot"
  | "shenron-site"
  | "shenron-server"
  | "shenron-desktop";

type BunServer = Server<ChatSocketData>;

export interface ChatSocketData {
  ownerId: string;
  /** Relay of each followed stream on this socket (one per stream: a resume replaces it). */
  streams: Map<string, AbortController>;
  /** Client IP of the upgrade request: chat messages share the HTTP chat budget. */
  clientIp: string;
  /** Direct loopback upgrade: exempt from the rate limit, like the HTTP routes. */
  directLoopback: boolean;
}

type RouteFn = (request: Request, server?: BunServer) => Promise<Response>;

export interface ShenronApi {
  /** `Bun.serve` routes (`{ "/api/v1/chat": { POST } }`). */
  readonly routes: Record<string, Partial<Record<"GET" | "HEAD" | "POST" | "OPTIONS", RouteFn>>>;
  /** `Bun.serve` WebSocket handlers of `/api/v1/chat/ws`. */
  readonly websocket: WebSocketHandler<ChatSocketData>;
  /** Same routes for embedding (no WebSocket without `server`). */
  fetch(request: Request, server?: BunServer): Promise<Response>;
  /** `Hono`-style helper for tests: `request("/path", init)`. */
  request(path: string, init?: RequestInit): Promise<Response>;
  handles(pathname: string): boolean;
  openApiDocument(): Record<string, unknown>;
  readonly streams: ChatStreams;
}

export const OPENAPI_PATH = endpoints.openApi.path;
export const WIKI_CACHE_SECONDS = 3600;
/** Chat budget per client: 20 requests per minute (generation is expensive). */
export const CHAT_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
/** Interval of the SSE comment that keeps proxies from closing an idle chat stream. */
export const SSE_KEEPALIVE_MS = 15_000;
const NOT_FOUND = { error: "Not found" } as const;

/** Raised by a data port wrapper: the store is unreachable. */
class DataUnavailable extends Error {}

/** Raised by an engine port wrapper (OCR, chat backends): the engine failed or is unreachable. */
class UpstreamUnavailable extends Error {}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

async function fromPort<T>(run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new DataUnavailable(error instanceof Error ? error.message : String(error));
  }
}

async function fromUpstream<T>(run: () => Promise<T> | T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new UpstreamUnavailable(error instanceof Error ? error.message : String(error));
  }
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}

/** VFS errors by code: missing path → 404, invalid path → 400, anything else → store unavailable. */
async function vfsCall<T>(run: () => Promise<T> | T): Promise<T | Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "NotFound") return json(NOT_FOUND, 404);
    if (code === "InvalidPath" || code === "NotADirectory" || code === "IsADirectory")
      return json({ error: (error as Error).message, code: "invalid_request" }, 400);
    throw new DataUnavailable(error instanceof Error ? error.message : String(error));
  }
}

function issuesMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** First of `fr`, `en`, `ja` in `Accept-Language` (quality order), else French. */
function acceptedLang(request: Request): Lang {
  const ranked = (request.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = Number(
        params
          .find((p) => p.trim().startsWith("q="))
          ?.trim()
          .slice(2) ?? 1,
      );
      return { lang: tag.trim().slice(0, 2).toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((entry) => entry.q > 0)
    .toSorted((a, b) => b.q - a.q);
  const found = ranked.find(
    (entry) => entry.lang === "fr" || entry.lang === "en" || entry.lang === "ja",
  );
  return (found?.lang as Lang | undefined) ?? "fr";
}

/** A term as the API serves it, labelled in `lang`. */
function lexiconTerm(lexicon: Lexicon, term: Term, lang: Lang, score?: number) {
  const label = lexicon.label(term, lang);
  return {
    id: term.id,
    kind: term.kind,
    label: label.text,
    labelLang: label.lang,
    fallback: label.fallback,
    ja: term.ja,
    fr: term.fr,
    en: term.en || null,
    romaji: term.romaji ?? null,
    aliases: {
      ja: term.aliases?.ja ?? [],
      fr: term.aliases?.fr ?? [],
      en: term.aliases?.en ?? [],
    },
    ...(score === undefined ? {} : { score }),
  };
}

/** Query string → object; repeated keys become arrays, `true`/`false` and numbers stay strings for zod coercion. */
function queryObject(url: URL): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams) {
    const current = out[key];
    out[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return out;
}

interface SchemaDef {
  type?: string;
  innerType?: { def?: SchemaDef };
}

/** Base type of a field, through `optional`, `default`, `nullable` and `prefault` wrappers. */
function baseType(field: z.ZodType): string | undefined {
  let def = (field as unknown as { def?: SchemaDef }).def;
  while (
    def?.innerType &&
    ["optional", "default", "nullable", "prefault"].includes(def.type ?? "")
  ) {
    def = def.innerType.def;
  }
  return def?.type;
}

/** Coerces query values for schemas that expect numbers or booleans (RAG query). */
function coerceQuery(schema: z.ZodType, raw: Record<string, unknown>): unknown {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape;
  if (!shape) return raw;
  const out: Record<string, unknown> = { ...raw };
  for (const [key, field] of Object.entries(shape)) {
    const value = out[key];
    if (typeof value !== "string") continue;
    const type = baseType(field);
    if (type === "number" && value.trim() !== "" && Number.isFinite(Number(value)))
      out[key] = Number(value);
    if (type === "boolean") out[key] = value === "true" || value === "1";
  }
  return out;
}

export function createShenronApi(
  ports: ShenronApiPorts,
  o: { service: ShenronApiService },
): ShenronApi {
  const streams = new ChatStreams();
  const router = new Router<{ spec: EndpointSpec; run: Handler }>();
  let cachedDocument: Record<string, unknown> | null = null;
  const openApiDocument = () => {
    cachedDocument ??= buildOpenApiDocument();
    return cachedDocument;
  };

  const log = (event: ShenronApiLogEvent) => {
    try {
      ports.log?.(event);
    } catch {
      // a failing logger never breaks a response
    }
  };

  interface Ctx {
    request: Request;
    url: URL;
    params: Record<string, string>;
    query: unknown;
    body: unknown;
    ownerId: string | null;
    reader: HostSession | null;
    server?: BunServer;
    cors: Record<string, string>;
  }
  type Handler = (ctx: Ctx) => Promise<Response>;

  const add = (spec: EndpointSpec, enabled: boolean, run: Handler) => {
    if (!enabled) return;
    router.add(spec.path, spec.method === "post" ? "POST" : "GET", { spec, run });
  };

  // ── Reader identity: resolved exclusively by the Better Auth session port ──
  const favoritesEnabled = Boolean(ports.favorites && ports.betterAuth?.session);
  add(endpoints.favorites, favoritesEnabled, async ({ request }) => {
    const session = await ports.betterAuth!.session!(request.headers);
    if (!session) return json({ favorites: [] }, 200, { "Cache-Control": "private, no-store" });
    if (!session.profile)
      return json({ error: "Reader profile unavailable", code: "unavailable" }, 503, {
        "Cache-Control": "private, no-store",
      });
    return json(
      { favorites: sanitizeFavorites(await ports.favorites!.read(session.profile.id)) },
      200,
      { "Cache-Control": "private, no-store" },
    );
  });
  add(endpoints.favoritesSave, favoritesEnabled, async ({ body, reader }) => {
    const favorites = sanitizeFavorites((body as { favorites: unknown }).favorites);
    await ports.favorites!.save(reader!.profile!.id, favorites);
    return json({ ok: true, count: favorites.length }, 200, {
      "Cache-Control": "private, no-store",
    });
  });
  add(endpoints.wikiLaunch, Boolean(ports.wikiLaunch), async () =>
    json({ config: await ports.wikiLaunch!.read() }, 200, { "Cache-Control": "no-store" }),
  );
  add(endpoints.wikiLaunchSave, Boolean(ports.wikiLaunch), async ({ body, request }) => {
    const raw = body as Partial<LaunchConfig>;
    const normalized = resolveLaunchConfig(raw);
    const patch: Partial<LaunchConfig> = {};
    for (const key of ["openKeys", "order", "access"] as const) {
      if (raw[key] !== undefined) Object.assign(patch, { [key]: normalized[key] });
    }
    const ownerId = await ports.auth?.owner(request);
    const config = await ports.wikiLaunch!.save(patch, ownerId ?? "token-admin");
    return json({ ok: true, config }, 200, { "Cache-Control": "no-store" });
  });
  add(endpoints.chronology, Boolean(ports.chronology), async () =>
    json({ config: resolveChronologyConfig(await ports.chronology!.read()) }, 200, {
      "Cache-Control": "no-store",
    }),
  );
  add(endpoints.timelineItems, Boolean(ports.chronology), async () =>
    json({ items: await ports.chronology!.timeline() }, 200, { "Cache-Control": "no-store" }),
  );
  add(endpoints.timelineEvents, Boolean(ports.chronology), async ({ query }) =>
    json({ events: await ports.chronology!.events((query as { era?: string }).era) }, 200, {
      "Cache-Control": "no-store",
    }),
  );
  add(endpoints.timelineAtlas, Boolean(ports.chronology), async () =>
    json(await ports.chronology!.atlas(), 200, { "Cache-Control": "no-store" }),
  );
  add(endpoints.chronologySave, Boolean(ports.chronology), async ({ body, request }) => {
    const config = resolveChronologyConfig(body);
    const ownerId = await ports.auth?.owner(request);
    await ports.chronology!.save(config, ownerId ?? "token-admin");
    return json({ ok: true, config }, 200, { "Cache-Control": "no-store" });
  });
  add(endpoints.pageBanners, Boolean(ports.pageBanners), async () =>
    json(
      { banners: resolvePageBanners(await ports.pageBanners!.read(), ports.pageBanners!.defaults) },
      200,
      { "Cache-Control": "no-store" },
    ),
  );
  add(endpoints.pageBannersSave, Boolean(ports.pageBanners), async ({ body, request }) => {
    const banners = resolvePageBanners(body, ports.pageBanners!.defaults);
    const ownerId = await ports.auth?.owner(request);
    await ports.pageBanners!.save(banners, ownerId ?? "token-admin");
    return json({ ok: true, banners }, 200, { "Cache-Control": "no-store" });
  });
  add(endpoints.homeConfig, Boolean(ports.homeConfig), async () =>
    json({ config: resolveHomeConfig(await ports.homeConfig!.read()) }, 200, {
      "Cache-Control": "no-store",
    }),
  );
  add(endpoints.homeConfigSave, Boolean(ports.homeConfig), async ({ body, request }) => {
    const config = resolveHomeConfig(body);
    const ownerId = await ports.auth?.owner(request);
    await ports.homeConfig!.save(config, ownerId ?? "token-admin");
    return json({ ok: true, config }, 200, { "Cache-Control": "no-store" });
  });
  add(endpoints.siteTheme, Boolean(ports.siteTheme), async () =>
    json({ theme: resolveSiteTheme(await ports.siteTheme!.read()) }, 200, {
      "Cache-Control": "no-store",
    }),
  );
  add(endpoints.siteThemeSave, Boolean(ports.siteTheme), async ({ body, request }) => {
    const theme = resolveSiteTheme(body);
    const ownerId = await ports.auth?.owner(request);
    await ports.siteTheme!.save(theme, ownerId ?? "token-admin");
    return json({ ok: true, theme }, 200, { "Cache-Control": "no-store" });
  });
  add(endpoints.accountSession, Boolean(ports.betterAuth?.session), async ({ request }) => {
    // Only a real reader session qualifies; admin tokens and signed owners do not.
    const session = await ports.betterAuth!.session!(request.headers);
    return json(
      session
        ? {
            sessionUserId: session.userId,
            discordId: session.discordId ?? "",
            user: session.profile ?? null,
          }
        : null,
      200,
      { "Cache-Control": "no-store" },
    );
  });
  // ── Meta: only beside at least one group, so an API without port claims nothing ──
  const anyGroup = [
    ports.wikiLaunch,
    ports.chronology,
    ports.pageBanners,
    ports.homeConfig,
    ports.siteTheme,
    favoritesEnabled ? ports.favorites : null,
    ports.wiki,
    ports.rag,
    ports.chat,
    ports.conversations,
    ports.memory,
    ports.vfs,
    ports.ocr,
    ports.mcp,
    ports.plugin,
  ].some((port) => port != null);
  add(endpoints.health, anyGroup, async () => json({ status: "ok" }, 200));
  add(endpoints.apiHealth, anyGroup, async () => json({ status: "ok" }, 200));
  add(endpoints.openApi, anyGroup, async () => json(openApiDocument(), 200));

  // ── Plugin ────────────────────────────────────────────────────────────────
  // Le plugin tel qu'il est déployé, pour tout type de LLM : index JSON, export complet
  // (Markdown, texte, HTML, JSON) et fichiers un par un. L'ETag suit l'empreinte du plugin.
  const plugin = ports.plugin ?? null;
  const pluginText = (
    ctx: Ctx,
    etag: string,
    render: () => { body: string; contentType: string },
  ): Response => {
    const headers: Record<string, string> = {
      ...ctx.cors,
      ...publicCacheHeaders(60),
      ETag: etag,
    };
    if (ctx.request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    const out = render();
    return new Response(out.body, {
      status: 200,
      headers: { ...headers, "Content-Type": out.contentType },
    });
  };
  const pluginOrigin = (ctx: Ctx) => pluginPublicOrigin(ctx.request, ports.publicOrigin);
  add(endpoints.pluginIndex, plugin !== null, async (ctx) => {
    const bundle = await fromPort(() => plugin!.load());
    return json(pluginIndex(bundle, pluginOrigin(ctx)), 200);
  });
  add(endpoints.pluginAgyPrompt, plugin !== null, async (ctx) => {
    const bundle = await fromPort(() => plugin!.load());
    const rendered = renderAgyPrompt(bundle, pluginOrigin(ctx));
    if (!rendered) return json(NOT_FOUND, 404);
    const etag = `"${createHash("sha256").update(rendered.body).digest("hex")}"`;
    return pluginText(ctx, etag, () => rendered);
  });
  add(endpoints.pluginArchive, typeof plugin?.archive === "function", async (ctx) => {
    const bundle = await fromPort(() => plugin!.load());
    const etag = `"${bundle.sha256}"`;
    const headers: Record<string, string> = {
      ...ctx.cors,
      ...publicCacheHeaders(300),
      ETag: etag,
    };
    if (ctx.request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
    const bytes = await fromPort(() => plugin!.archive!(bundle));
    return new Response(bytes, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": PLUGIN_ARCHIVE_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${PLUGIN_ARCHIVE_ROOT}-plugin-${bundle.version}.tar.gz"`,
      },
    });
  });
  add(endpoints.pluginExport, plugin !== null, async (ctx) => {
    const format = ctx.params.format as PluginFormat;
    const full = (ctx.query as { full?: boolean }).full === true;
    const bundle = await fromPort(() => plugin!.load());
    return pluginText(ctx, `"${bundle.sha256}-${format}${full ? "-full" : ""}"`, () =>
      renderPluginExport(bundle, format, { origin: pluginOrigin(ctx), full }),
    );
  });
  add(endpoints.pluginFile, plugin !== null, async (ctx) => {
    const query = ctx.query as { path: string; format?: PluginFormat | "raw" };
    const bundle = await fromPort(() => plugin!.load());
    const file = findPluginFile(bundle, query.path);
    if (!file) return json(NOT_FOUND, 404);
    const format = query.format ?? "raw";
    return pluginText(ctx, `"${file.sha256}-${format}"`, () =>
      renderPluginFile(file, format, pluginOrigin(ctx)),
    );
  });

  // ── Lexicon ───────────────────────────────────────────────────────────────
  // The one ja/fr/en lexicon: list, search in any language and localised resolution of a term.
  const lexicon = anyGroup && ports.lexicon !== null ? (ports.lexicon ?? embeddedLexicon()) : null;
  add(endpoints.lexiconList, lexicon !== null, async (ctx) => {
    const query = ctx.query as {
      lang?: Lang;
      kind?: Kind;
      q?: string;
      limit: number;
      offset: number;
    };
    const lang = query.lang ?? acceptedLang(ctx.request);
    const q = query.q?.trim();
    const page = q
      ? lexicon!
          .search(q, { ...(query.kind ? { kind: query.kind } : {}), limit: 100 })
          .map((hit) => ({ term: hit.term, score: hit.score }))
      : lexicon!.terms
          .filter((term) => !query.kind || term.kind === query.kind)
          .map((term) => ({ term, score: undefined }));
    const items = page
      .slice(query.offset, query.offset + query.limit)
      .map(({ term, score }) => lexiconTerm(lexicon!, term, lang, score));
    return json(
      {
        lang,
        version: lexicon!.version,
        items,
        total: page.length,
        limit: query.limit,
        offset: query.offset,
      },
      200,
    );
  });
  add(endpoints.lexiconTerm, lexicon !== null, async (ctx) => {
    const lang = (ctx.query as { lang?: Lang }).lang ?? acceptedLang(ctx.request);
    const term = lexicon!.resolve(ctx.params.idOrForm ?? "");
    return term ? json(lexiconTerm(lexicon!, term, lang), 200) : json(NOT_FOUND, 404);
  });

  // ── Wiki ──────────────────────────────────────────────────────────────────
  const wiki = ports.wiki ?? null;
  add(endpoints.wikiCategories, wiki !== null, async () => {
    const rows = await fromPort(() => wiki!.categories());
    return json({ categories: rows.filter((row) => isWikiCategoryName(row.name)) }, 200);
  });
  add(endpoints.wikiList, wiki !== null, async (ctx) => {
    const category = ctx.params.category ?? "";
    if (!isWikiCategoryName(category)) return json(NOT_FOUND, 404);
    const query = ctx.query as { limit: number; offset: number; q?: string };
    const q = query.q?.trim() || undefined;
    const page = await fromPort(() =>
      wiki!.list({ category, limit: query.limit, offset: query.offset, ...(q ? { q } : {}) }),
    );
    return json(
      { category, items: page.items, total: page.total, limit: query.limit, offset: query.offset },
      200,
    );
  });
  add(endpoints.wikiEntity, wiki !== null, async (ctx) => {
    const category = ctx.params.category ?? "";
    if (!isWikiCategoryName(category)) return json(NOT_FOUND, 404);
    const row = await fromPort(() => wiki!.get({ category, idOrSlug: ctx.params.idOrSlug ?? "" }));
    return row ? json(row, 200) : json(NOT_FOUND, 404);
  });

  // ── RAG ───────────────────────────────────────────────────────────────────
  const rag = ports.rag ?? null;
  add(endpoints.ragSearch, rag !== null, async (ctx) => {
    const query = ctx.query as RagSearchQuery;
    if (!query.q.trim()) return json({ q: query.q, results: [], mode: "lexical" }, 200);
    const result = await fromPort(() => rag!.search(query));
    return json(
      {
        q: query.q,
        results: result.hits,
        mode: result.mode,
        ...(result.error ? { error: result.error } : {}),
      },
      200,
    );
  });
  add(endpoints.ragContext, rag !== null, async (ctx) => {
    const query = ctx.query as RagSearchQuery;
    const result = query.q.trim()
      ? await fromPort(() => rag!.search(query))
      : { mode: "lexical" as const, hits: [] };
    const maxChars = query.maxChars ?? 6000;
    let context = "";
    const sources: RagContextResponse["sources"] = [];
    for (const hit of result.hits) {
      const n = sources.length + 1;
      const block = `[${n}] ${hit.title}\n${hit.content ?? hit.snippet}\nSource: ${hit.url}\n\n`;
      if (context && context.length + block.length > maxChars) break;
      context += block;
      sources.push({
        n,
        rowid: hit.rowid,
        title: hit.title,
        url: hit.url,
        kind: hit.kind,
        score: hit.score,
        ...(hit.sourceId ? { sourceId: hit.sourceId } : {}),
        ...(hit.lang ? { lang: hit.lang } : {}),
      });
    }
    return json({ q: query.q, mode: result.mode, context: context.trim(), sources }, 200);
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  const chat = ports.chat ?? null;
  const sseResponse = (
    id: string,
    ownerId: string,
    after: number,
    signal: AbortSignal,
    cors: Record<string, string>,
  ) => {
    let keepalive: ReturnType<typeof setInterval> | undefined;
    // A cancelled body (disconnect, HEAD) stops the follower, not only the keepalive.
    const cancelled = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        keepalive = setInterval(() => {
          try {
            controller.enqueue(SSE_KEEPALIVE);
          } catch {
            clearInterval(keepalive);
          }
        }, SSE_KEEPALIVE_MS);
        try {
          for await (const { id: n, event } of streams.follow(
            id,
            ownerId,
            after,
            AbortSignal.any([signal, cancelled.signal]),
          )) {
            controller.enqueue(sseFrame(event.type, event.data, n));
          }
        } catch {
          // the consumer went away while an event was being written
        } finally {
          clearInterval(keepalive);
          try {
            controller.close();
          } catch {
            // already closed by a disconnect
          }
        }
      },
      cancel() {
        clearInterval(keepalive);
        cancelled.abort();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { ...cors, ...SSE_HEADERS, "X-Stream-Id": id },
    });
  };
  const startChat = (request: ChatRequestParsed, ownerId: string) => {
    const streamId = `s${crypto.randomUUID().replaceAll("-", "")}`;
    return streams.start(streamId, ownerId, (signal) =>
      chat!.run({ request, ownerId, streamId }, signal),
    ).id;
  };
  add(endpoints.chat, chat !== null, async (ctx) => {
    const request = ctx.body as ChatRequestParsed;
    const id = startChat(request, ctx.ownerId!);
    if (request.stream) return sseResponse(id, ctx.ownerId!, 0, ctx.request.signal, ctx.cors);
    let answer = "";
    let meta: unknown;
    let done: unknown;
    const tools: unknown[] = [];
    for await (const { event } of streams.follow(id, ctx.ownerId!, 0)) {
      if (event.type === "meta") meta = event.data;
      else if (event.type === "delta") answer += event.data.text;
      else if (event.type === "tool") tools.push(event.data);
      else if (event.type === "done") done = event.data;
      else if (event.type === "error") {
        return json(
          {
            error: "Chat generation failed",
            code: "upstream_unavailable",
            message: `${event.data.code}: ${event.data.message}`,
          },
          502,
        );
      }
    }
    return json({ meta, answer, done, tools }, 200);
  });
  add(endpoints.chatResume, chat !== null, async (ctx) => {
    const id = ctx.params.streamId ?? "";
    if (!streams.has(id, ctx.ownerId!)) return json(NOT_FOUND, 404);
    const after =
      Number(ctx.request.headers.get("last-event-id") ?? ctx.url.searchParams.get("after") ?? 0) ||
      0;
    return sseResponse(id, ctx.ownerId!, Math.max(0, after), ctx.request.signal, ctx.cors);
  });
  add(endpoints.chatCancel, chat !== null, async (ctx) => {
    const cancelled = streams.cancel(ctx.params.streamId ?? "", ctx.ownerId!);
    return cancelled ? json({ ok: true }, 200) : json(NOT_FOUND, 404);
  });
  add(endpoints.chatSocket, chat !== null, async (ctx) => {
    if (!ctx.server)
      return json({ error: "WebSocket needs Bun.serve", code: "invalid_request" }, 426);
    const upgraded = ctx.server.upgrade(ctx.request, {
      data: {
        ownerId: ctx.ownerId!,
        streams: new Map(),
        clientIp: ports.clientIp(ctx.request),
        directLoopback: ports.isDirectLoopback(ctx.request),
      },
    });
    return upgraded
      ? (undefined as unknown as Response)
      : json({ error: "upgrade failed", code: "invalid_request" }, 400);
  });
  add(endpoints.models, chat !== null, async () =>
    json(await fromUpstream(() => chat!.models()), 200),
  );

  // ── OCR ───────────────────────────────────────────────────────────────────
  const ocr = ports.ocr ?? null;
  add(endpoints.ocr, ocr !== null, async (ctx) => {
    const body = ctx.body as { attachment: { mediaType: string; data: string } };
    const bytes = Uint8Array.from(Buffer.from(body.attachment.data, "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > 8 * 1024 * 1024) {
      return json({ error: "attachment must hold 1 byte to 8 MiB", code: "invalid_request" }, 400);
    }
    return json(await fromUpstream(() => ocr!.recognize(bytes, body.attachment.mediaType)), 200);
  });

  // ── Conversations ─────────────────────────────────────────────────────────
  const store = ports.conversations ?? null;
  add(endpoints.syncPush, store !== null, async (ctx) => {
    const body = ctx.body as { conversations: unknown[]; messages: unknown[] };
    const result = await fromPort(() =>
      store!.push(ctx.ownerId!, {
        conversations: body.conversations as never[],
        messages: body.messages as never[],
      }),
    );
    return json(result, 200);
  });
  add(endpoints.syncPull, store !== null, async (ctx) => {
    const query = ctx.query as { cursor?: string; limit?: number };
    try {
      return json(
        await fromPort(() => store!.pull(ctx.ownerId!, query.cursor ?? null, query.limit)),
        200,
      );
    } catch (error) {
      if (error instanceof DataUnavailable && error.message === "invalid sync cursor") {
        return json({ error: "invalid sync cursor", code: "invalid_request" }, 400);
      }
      throw error;
    }
  });
  add(endpoints.conversations, store !== null, async (ctx) =>
    json({ conversations: await fromPort(() => store!.list(ctx.ownerId!)) }, 200),
  );
  add(endpoints.conversation, store !== null, async (ctx) => {
    const detail = await fromPort(() => store!.get(ctx.ownerId!, ctx.params.id ?? ""));
    return detail ? json(detail, 200) : json(NOT_FOUND, 404);
  });

  // ── Memory ────────────────────────────────────────────────────────────────
  const memory = ports.memory ?? null;
  add(endpoints.memoryList, memory !== null, async (ctx) => {
    const query = ctx.query as MemoryListQuery;
    const memories = await fromPort(() =>
      memory!.list(ctx.ownerId!, {
        limit: query.limit,
        ...(query.q ? { q: query.q } : {}),
        ...(query.tag ? { tags: [query.tag] } : {}),
      }),
    );
    return json({ memories, total: memories.length }, 200);
  });
  add(endpoints.memoryDelete, memory !== null, async (ctx) => {
    const deleted = await fromPort(() => memory!.forget(ctx.ownerId!, ctx.params.id ?? ""));
    return deleted ? json({ ok: true }, 200) : json(NOT_FOUND, 404);
  });
  add(endpoints.memoryClear, memory !== null, async (ctx) =>
    json({ deleted: await fromPort(() => memory!.clear(ctx.ownerId!)) }, 200),
  );

  // ── VFS ───────────────────────────────────────────────────────────────────
  const vfs = ports.vfs ?? null;
  const vfsGuard = (path: string) => {
    const stat = vfs!.stat(path);
    if (vfs!.publicOnly && stat.visibility === "private")
      throw new HttpError(404, "not_found", "Not found");
    return stat;
  };
  add(endpoints.vfsInfo, vfs !== null, async () => json(await fromPort(() => vfs!.info()), 200));
  add(endpoints.vfsStat, vfs !== null, async (ctx) => {
    const path = (ctx.query as { path: string }).path;
    const stat = await vfsCall(() => vfsGuard(path));
    return stat instanceof Response ? stat : json({ path, ...stat }, 200);
  });
  add(endpoints.vfsList, vfs !== null, async (ctx) => {
    const path = (ctx.query as { path: string }).path;
    const entries = await vfsCall(() => {
      vfsGuard(path);
      return vfs!.readDir(path).filter((entry) => {
        if (!vfs!.publicOnly) return true;
        const child = path.endsWith("/") ? `${path}${entry.name}` : `${path}/${entry.name}`;
        return vfs!.stat(child).visibility === "public";
      });
    });
    return entries instanceof Response ? entries : json({ path, entries }, 200);
  });
  add(endpoints.vfsFile, vfs !== null, async (ctx) => {
    const path = (ctx.query as { path: string }).path;
    const stat = await vfsCall(() => vfsGuard(path));
    if (stat instanceof Response) return stat;
    if (stat.kind !== "file") return json({ error: "not a file", code: "invalid_request" }, 400);
    const headers: Record<string, string> = {
      ...ctx.cors,
      "Content-Type": stat.mime ?? "application/octet-stream",
      ...publicCacheHeaders(86_400),
      ...(stat.sha256 ? { ETag: `"${stat.sha256}"` } : {}),
    };
    if (stat.sha256 && ctx.request.headers.get("if-none-match") === `"${stat.sha256}"`)
      return new Response(null, { status: 304, headers });
    const local = vfs!.localFile?.(path);
    if (local) return new Response(local, { status: 200, headers });
    const bytes = await vfsCall(() => vfs!.read(path));
    return bytes instanceof Response
      ? bytes
      : new Response(bytes as Uint8Array<ArrayBuffer>, { status: 200, headers });
  });
  add(endpoints.vfsQuery, vfs !== null, async (ctx) => {
    const body = ctx.body as { sql: string; params: (string | number | boolean | null)[] };
    const started = performance.now();
    try {
      const rows = vfs!.query(body.sql, body.params);
      return json({ rows, ms: Math.round((performance.now() - started) * 10) / 10 }, 200);
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : String(error), code: "invalid_request" },
        400,
      );
    }
  });

  // ── Dispatcher ────────────────────────────────────────────────────────────
  const mcp = ports.mcp ?? null;
  const mcpPrefix = "/mcp";

  const betterAuth = ports.betterAuth ?? null;
  const isAuthPath = (pathname: string) =>
    pathname === BETTER_AUTH_PATH || pathname.startsWith(`${BETTER_AUTH_PATH}/`);

  const handles = (pathname: string): boolean =>
    (betterAuth !== null && isAuthPath(pathname)) ||
    router.match(pathname).length > 0 ||
    (mcp !== null && (pathname === mcpPrefix || pathname.startsWith(`${mcpPrefix}/`)));

  const ALLOWED_METHODS = ["GET", "HEAD", "POST", "OPTIONS"];

  async function proxyMcp(
    request: Request,
    url: URL,
    cors: Record<string, string>,
  ): Promise<Response> {
    const target = new URL(url.pathname + url.search, mcp!.url);
    const headers = new Headers(request.headers);
    headers.delete("host");
    try {
      // Bun streams request bodies with `duplex: "half"`, which RequestInit does not declare.
      const init: RequestInit & { duplex: "half" } = {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
        signal: request.signal,
        duplex: "half",
      };
      const upstream = await fetch(target, init);
      const out = new Headers(upstream.headers);
      for (const [key, value] of Object.entries(cors)) out.set(key, value);
      return new Response(upstream.body, { status: upstream.status, headers: out });
    } catch (error) {
      // The cause (internal address, socket error) stays in the server log, never in the reply.
      console.error("[shenron-api] MCP upstream unreachable:", error);
      return json({ error: "MCP server unreachable", code: "upstream_unavailable" }, 502, cors);
    }
  }

  async function dispatch(
    request: Request,
    server?: BunServer,
    forced?: { spec: EndpointSpec; run: Handler; params: Record<string, string> },
  ): Promise<Response> {
    const started = performance.now();
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    const ip = ports.clientIp(request);
    const methods = [...ALLOWED_METHODS];
    const cors = corsHeaders(request.headers.get("origin"), ports.cors.allowedOrigins, methods);
    cors["Access-Control-Allow-Headers"] =
      "Content-Type, Authorization, Last-Event-ID, X-Shenron-Owner";
    cors["Access-Control-Expose-Headers"] = "X-Stream-Id, ETag";
    const finish = (response: Response) => {
      log({
        event: `${o.service}.api`,
        path,
        status: response.status,
        ms: performance.now() - started,
      });
      return response;
    };
    if (betterAuth && isAuthPath(path)) {
      try {
        return finish(await betterAuth.handler(request));
      } catch (error) {
        console.error("[shenron-api] Better Auth failed:", error);
        return finish(json({ error: "internal", code: "internal" }, 500, cors));
      }
    }
    if (mcp && (path === mcpPrefix || path.startsWith(`${mcpPrefix}/`)))
      return finish(await proxyMcp(request, url, cors));
    const candidates = forced
      ? [{ route: { handler: forced }, params: forced.params }]
      : router.match(path);
    if (candidates.length === 0) return finish(json(NOT_FOUND, 404, cors));
    if (method === "OPTIONS") return finish(new Response(null, { status: 204, headers: cors }));
    const wanted = method === "HEAD" ? "GET" : method;
    const found = candidates.find(
      (c) => (c.route.handler.spec.method === "post" ? "POST" : "GET") === wanted,
    );
    if (!found) return finish(json(NOT_FOUND, 404, cors));
    const { spec, run } = found.route.handler;
    try {
      // Rate limit (direct loopback exempt): the chat has its own budget.
      if (!ports.isDirectLoopback(request)) {
        const budget =
          spec.id === "chat" || spec.id === "ocr" ? CHAT_RATE_LIMIT : PUBLIC_RATE_LIMIT;
        const verdict = await ports.rateLimit.hit(
          `${spec.id === "chat" || spec.id === "ocr" ? "chat" : "public"}:${ip}`,
          budget,
        );
        if (!verdict.allowed) {
          return finish(
            json({ error: `Rate limit (${budget.limit}/min)`, code: "rate_limited" }, 429, {
              ...cors,
              "Retry-After": String(verdict.retryAfterSeconds),
            }),
          );
        }
      }
      let ownerId: string | null = null;
      let reader: HostSession | null = null;
      if (spec.auth === "owner") {
        ownerId = (await ports.auth?.owner(request)) ?? null;
        if (!ownerId)
          return finish(
            json({ error: "Authentication required", code: "unauthenticated" }, 401, cors),
          );
      } else if (spec.auth === "reader") {
        reader = (await ports.betterAuth?.session?.(request.headers)) ?? null;
        if (!reader)
          return finish(
            json({ error: "Authentication required", code: "unauthenticated" }, 401, cors),
          );
        if (!reader.profile)
          return finish(
            json({ error: "Reader profile unavailable", code: "unavailable" }, 503, cors),
          );
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin && !ports.cors.allowedOrigins.includes(origin))
          return finish(json({ error: "Untrusted origin", code: "forbidden" }, 403, cors));
      } else if (spec.auth === "admin") {
        if (!(await ports.auth?.admin(request)))
          return finish(json({ error: "Forbidden", code: "forbidden" }, 403, cors));
      }
      // Validation.
      const fail = (error: z.ZodError) =>
        finish(
          json(
            { error: "Invalid request", code: "invalid_request", message: issuesMessage(error) },
            400,
            cors,
          ),
        );
      let query: unknown = {};
      if (spec.query) {
        const parsed = spec.query.safeParse(coerceQuery(spec.query, queryObject(url)));
        if (!parsed.success) return fail(parsed.error);
        query = parsed.data;
      }
      if (spec.params) {
        const parsed = spec.params.safeParse({ ...found.params });
        if (!parsed.success) {
          // An unknown wiki category is the historical 404, not a 400.
          if (spec.id.startsWith("wiki")) return finish(json(NOT_FOUND, 404, cors));
          return fail(parsed.error);
        }
      }
      // A POST without a body schema (stream cancel) takes no body: none is read.
      let body: unknown;
      if (spec.method === "post" && spec.body) {
        let raw: unknown;
        try {
          raw =
            spec.maxBodyBytes === undefined
              ? await request.json()
              : await readLimitedJson(request, spec.maxBodyBytes);
        } catch (error) {
          if (error instanceof BodyLimitError)
            return finish(json({ error: "Body too large", code: "body_too_large" }, 413, cors));
          return finish(
            json(
              { error: "Invalid request", code: "invalid_request", message: "body must be JSON" },
              400,
              cors,
            ),
          );
        }
        const parsed = spec.body.safeParse(raw);
        if (!parsed.success) return fail(parsed.error);
        body = parsed.data;
      }
      // Public JSON cache (200 only).
      const cacheable =
        method !== "POST" &&
        spec.auth === "public" &&
        !spec.binary &&
        typeof spec.cache === "object";
      const key = cacheable ? publicCacheKey(url) : "";
      if (cacheable) {
        const hit = ports.publicCache.get(key);
        if (hit) {
          const headers = {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            ...publicCacheHeaders((spec.cache as { maxAgeSeconds: number }).maxAgeSeconds),
            ETag: hit.etag,
          };
          if (request.headers.get("if-none-match") === hit.etag)
            return finish(new Response(null, { status: 304, headers }));
          return finish(
            new Response(method === "HEAD" ? null : hit.body, { status: 200, headers }),
          );
        }
      }
      const response = await run({
        request,
        url,
        params: found.params,
        query,
        body,
        ownerId,
        reader,
        server,
        cors,
      });
      if (response === undefined) return response as unknown as Response; // WebSocket upgraded
      if (cacheable && response.status === 200) {
        const text = await response.text();
        const ttl = (spec.cache as { maxAgeSeconds: number }).maxAgeSeconds;
        const { etag } = ports.publicCache.set(key, text, ttl * 1000);
        const headers = {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          ...publicCacheHeaders(ttl),
          ETag: etag,
        };
        if (request.headers.get("if-none-match") === etag)
          return finish(new Response(null, { status: 304, headers }));
        return finish(new Response(method === "HEAD" ? null : text, { status: 200, headers }));
      }
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) if (!headers.has(k)) headers.set(k, v);
      if (spec.cache === "no-store" && !headers.has("Cache-Control"))
        headers.set("Cache-Control", "no-store");
      // HEAD drops the body: cancel it so a stream (SSE resume) stops its follower now.
      if (method === "HEAD") void response.body?.cancel().catch(() => {});
      return finish(
        new Response(method === "HEAD" ? null : response.body, {
          status: response.status,
          headers,
        }),
      );
    } catch (error) {
      if (error instanceof HttpError)
        return finish(json({ error: error.message, code: error.code }, error.status, cors));
      if (error instanceof UpstreamUnavailable) {
        // Same doctrine as the data store: the engine error never reaches the client.
        log({ event: `${o.service}.api.upstream`, path, status: 502 });
        return finish(
          json({ error: "Upstream unavailable", code: "upstream_unavailable" }, 502, cors),
        );
      }
      if (error instanceof DataUnavailable) {
        // The cause stays in the log: connection details never reach a client.
        log({ event: `${o.service}.api.unavailable`, path, status: 503 });
        return finish(json({ error: "Data store unavailable", code: "pg_unavailable" }, 503, cors));
      }
      return finish(json({ error: "internal", code: "internal" }, 500, cors));
    }
  }

  // Bun.serve route table: one entry per catalogue path, every method dispatched natively.
  const routes: ShenronApi["routes"] = {};
  for (const route of router.routes) {
    const entry = (routes[route.bunPath] ??= {});
    const handler: RouteFn = (request, server) => {
      const params = (request as Request & { params?: Record<string, string> }).params ?? {};
      return dispatch(request, server, { ...route.handler, params });
    };
    if (route.method === "GET") {
      entry.GET = handler;
      entry.HEAD = handler;
    } else entry.POST = handler;
    entry.OPTIONS = (request, server) => dispatch(request, server);
  }
  if (betterAuth) {
    const handler: RouteFn = (request, server) => dispatch(request, server);
    routes[BETTER_AUTH_PATH] = { GET: handler, HEAD: handler, POST: handler, OPTIONS: handler };
    routes[`${BETTER_AUTH_PATH}/*`] = {
      GET: handler,
      HEAD: handler,
      POST: handler,
      OPTIONS: handler,
    };
  }
  if (mcp) {
    const proxy: RouteFn = (request, server) => dispatch(request, server);
    routes[mcpPrefix] = { GET: proxy, POST: proxy, OPTIONS: proxy };
    routes[`${mcpPrefix}/*`] = { GET: proxy, POST: proxy, OPTIONS: proxy };
  }

  const websocket: WebSocketHandler<ChatSocketData> = {
    async message(ws: ServerWebSocket<ChatSocketData>, raw) {
      let message: { type?: string; request?: unknown; streamId?: string; after?: number };
      try {
        message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            data: { code: "invalid_request", message: "frames are JSON", retryable: false },
          }),
        );
        return;
      }
      const relay = async (streamId: string, after: number) => {
        // One relay per stream and socket: a second resume replaces the first, no duplicates.
        ws.data.streams.get(streamId)?.abort();
        const controller = new AbortController();
        ws.data.streams.set(streamId, controller);
        try {
          for await (const { id, event } of streams.follow(
            streamId,
            ws.data.ownerId,
            after,
            controller.signal,
          )) {
            ws.send(JSON.stringify({ id, streamId, type: event.type, data: event.data }));
          }
        } finally {
          if (ws.data.streams.get(streamId) === controller) ws.data.streams.delete(streamId);
        }
      };
      const sendError = (code: ApiErrorCode, message: string, retryable: boolean) =>
        ws.send(JSON.stringify({ type: "error", data: { code, message, retryable } }));
      if (message.type === "chat") {
        const parsed = ChatRequest.safeParse(message.request);
        if (!parsed.success) {
          sendError("invalid_request", issuesMessage(parsed.error), false);
          return;
        }
        // A generation over the socket spends the same budget as POST /api/v1/chat.
        if (!ws.data.directLoopback) {
          let verdict: { allowed: boolean };
          try {
            verdict = await ports.rateLimit.hit(`chat:${ws.data.clientIp}`, CHAT_RATE_LIMIT);
          } catch {
            sendError("internal", "internal", true);
            return;
          }
          if (!verdict.allowed) {
            sendError("rate_limited", `Rate limit (${CHAT_RATE_LIMIT.limit}/min)`, true);
            return;
          }
        }
        await relay(startChat(parsed.data, ws.data.ownerId), 0);
      } else if (message.type === "resume" && message.streamId) {
        if (!streams.has(message.streamId, ws.data.ownerId)) {
          ws.send(
            JSON.stringify({
              type: "error",
              streamId: message.streamId,
              data: { code: "not_found", message: "unknown stream", retryable: false },
            }),
          );
          return;
        }
        await relay(message.streamId, Math.max(0, Number(message.after) || 0));
      } else if (message.type === "cancel" && message.streamId) {
        streams.cancel(message.streamId, ws.data.ownerId);
      } else {
        sendError("invalid_request", "type must be chat, resume or cancel", false);
      }
    },
    close(ws) {
      // Relays stop; generations keep running for a later resume.
      for (const controller of ws.data.streams.values()) controller.abort();
    },
  };

  return {
    routes,
    websocket,
    fetch: (request, server) => dispatch(request, server),
    request: (path, init) => dispatch(new Request(new URL(path, "http://localhost").href, init)),
    handles,
    openApiDocument,
    streams,
  };
}

export { buildOpenApiDocument } from "./openapi";
export type { PluginPort } from "../plugin";
