// SPDX-License-Identifier: Apache-2.0
/**
 * Endpoint catalogue of the Shenron HTTP contract. Paths are complete
 * (`/api/public/wiki/{category}`): no nested `basePath`, which
 * `@hono/zod-openapi` mis-reports in the generated document
 * (honojs/middleware#952). Runtime class: `pure`.
 */
import { z } from "zod";
import { FAVORITES_BODY_MAX } from "@shenron/config/favorites";
import { FavoritesResponse, FavoritesSaveResponse } from "./favorites";
import { AccountSessionResponse } from "./account";
import { PageBannersResponse, PageBannersSaveResponse } from "./page-banners";
import { HomeConfigResponse, HomeConfigSaveResponse } from "./home";
import { SiteThemeResponse, SiteThemeSaveResponse } from "./site-theme";
import { ChatRequest, ChatResponse, ModelsResponse, OcrRequest, OcrResponse } from "./chat";
import {
  LexiconListQuery,
  LexiconListResponse,
  LexiconTerm,
  LexiconTermParams,
  LexiconTermQuery,
} from "./lexicon";
import {
  MemoryClearResponse,
  MemoryDeleteResponse,
  MemoryListQuery,
  MemoryListResponse,
  MemoryParams,
} from "./memory";
import {
  PluginExportParams,
  PluginExportQuery,
  PluginFileQuery,
  PluginIndexResponse,
} from "./plugin";
import {
  ConversationDetail,
  ConversationListResponse,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushBody,
  SyncPushResponse,
  VfsInfoResponse,
  VfsListResponse,
  VfsPathQuery,
  VfsQueryBody,
  VfsQueryResponse,
  VfsStatResponse,
} from "./sync";
import {
  BotAdminStats,
  BotEconomyStats,
  BotServices,
  BotTableRows,
  BotTables,
  BotWikiStats,
  CompleteGoalBody,
  CompleteGoalResponse,
  CreateGoalBody,
  CreateGoalResponse,
  EvalRequestBody,
  EvalResponse,
  FeedbackStatusBody,
  FeedbackStatusResponse,
  GoldCaseBody,
  GoldCaseResponse,
  HealthResponse,
  PublicStats,
  RagContextResponse,
  RagSearchQuery,
  RagSearchResponse,
  TablePageQuery,
  WikiCategoriesResponse,
  WikiCategoryName,
  WikiEntity,
  WikiListQuery,
  WikiListResponse,
} from "./schemas";

/** `owner`: the host resolves the conversation owner (session, signed bot user, local desktop). */
export type EndpointAuth = "public" | "admin" | "acting-user" | "owner" | "reader";
export type EndpointCache = { maxAgeSeconds: number } | "no-store";

export interface EndpointSpec {
  id: string;
  method: "get" | "post";
  path: `/${string}`;
  auth: EndpointAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Maximum raw JSON body bytes, enforced before parsing. */
  maxBodyBytes?: number;
  response: z.ZodType;
  cache?: EndpointCache;
  /** Response is a page (`rows`/`items` + `total`/`limit`/`offset`), read leniently by the client. */
  paginated?: boolean;
  /** Server-sent events (`text/event-stream`); `response` is the non-streaming JSON form. */
  stream?: "sse";
  /** Raw bytes (`response` documents the error envelope only). */
  binary?: boolean;
  /** WebSocket upgrade route. */
  websocket?: boolean;
  /** Answered by an engine (chat backends, OCR): its failure is a 502 `upstream_unavailable`. */
  upstream?: boolean;
  /** Served by the backend API server (`@shenron/api/server`); false for bot-owned historical routes. */
  native?: boolean;
}

/** `{category}` path parameter. */
export const WikiCategoryParams = z.object({ category: WikiCategoryName });
/** `{category}/{idOrSlug}` path parameters. */
export const WikiEntityParams = z.object({
  category: WikiCategoryName,
  idOrSlug: z.string().min(1).max(200),
});
/** `{id}` of a conversation. */
export const ConversationParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_:-]{8,64}$/) });
/** `{streamId}` of a chat stream (resumption). */
export const StreamParams = z.object({ streamId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) });
/** Numeric `{id}` path parameter of the cockpit routes. */
export const NumericIdParams = z.object({ id: z.number().int().positive() });
/** `{table}` path parameter of the bot table explorer. */
export const TableParams = z.object({ table: z.string().min(1).max(100) });

const WIKI_CACHE = { maxAgeSeconds: 3600 } as const;

export const endpoints = {
  favorites: {
    id: "favorites",
    method: "get",
    path: "/api/v1/account/favorites",
    auth: "public",
    response: FavoritesResponse,
    cache: "no-store",
    native: true,
  },
  favoritesSave: {
    id: "favoritesSave",
    method: "post",
    path: "/api/v1/account/favorites",
    auth: "reader",
    body: z.object({ favorites: z.unknown() }),
    maxBodyBytes: FAVORITES_BODY_MAX,
    response: FavoritesSaveResponse,
    cache: "no-store",
    native: true,
  },
  pageBanners: {
    id: "pageBanners",
    method: "get",
    path: "/api/v1/site/banners",
    auth: "public",
    response: PageBannersResponse,
    cache: "no-store",
    native: true,
  },
  pageBannersSave: {
    id: "pageBannersSave",
    method: "post",
    path: "/api/v1/site/banners",
    auth: "admin",
    body: z.unknown(),
    maxBodyBytes: 512 * 1024,
    response: PageBannersSaveResponse,
    cache: "no-store",
    native: true,
  },
  homeConfig: {
    id: "homeConfig",
    method: "get",
    path: "/api/v1/site/home",
    auth: "public",
    response: HomeConfigResponse,
    cache: "no-store",
    native: true,
  },
  homeConfigSave: {
    id: "homeConfigSave",
    method: "post",
    path: "/api/v1/site/home",
    auth: "admin",
    body: z.unknown(),
    maxBodyBytes: 512 * 1024,
    response: HomeConfigSaveResponse,
    cache: "no-store",
    native: true,
  },
  siteTheme: {
    id: "siteTheme",
    method: "get",
    path: "/api/v1/site/theme",
    auth: "public",
    response: SiteThemeResponse,
    cache: "no-store",
    native: true,
  },
  siteThemeSave: {
    id: "siteThemeSave",
    method: "post",
    path: "/api/v1/site/theme",
    auth: "admin",
    body: z.unknown(),
    response: SiteThemeSaveResponse,
    cache: "no-store",
    native: true,
  },
  accountSession: {
    id: "accountSession",
    method: "get",
    path: "/api/v1/account/session",
    auth: "public",
    response: AccountSessionResponse,
    cache: "no-store",
    native: true,
  },
  openApi: {
    id: "openApi",
    method: "get",
    path: "/api/public/openapi.json",
    auth: "public",
    response: z.looseObject({ openapi: z.string() }).meta({ id: "OpenApiDocument" }),
    cache: { maxAgeSeconds: 3600 },
    native: true,
  },
  pluginIndex: {
    id: "pluginIndex",
    method: "get",
    path: "/api/public/plugin",
    auth: "public",
    response: PluginIndexResponse,
    cache: { maxAgeSeconds: 60 },
    native: true,
  },
  pluginExport: {
    id: "pluginExport",
    method: "get",
    path: "/api/public/plugin/export/{format}",
    auth: "public",
    params: PluginExportParams,
    query: PluginExportQuery,
    response: z.string().meta({ id: "PluginExport" }),
    cache: { maxAgeSeconds: 60 },
    binary: true,
    native: true,
  },
  pluginAgyPrompt: {
    id: "pluginAgyPrompt",
    method: "get",
    path: "/api/public/plugin/agy.md",
    auth: "public",
    response: z.string().meta({ id: "PluginAgyPrompt" }),
    cache: { maxAgeSeconds: 60 },
    binary: true,
    native: true,
  },
  pluginArchive: {
    id: "pluginArchive",
    method: "get",
    path: "/api/public/plugin/archive.tar.gz",
    auth: "public",
    response: z.string().meta({ id: "PluginArchive" }),
    cache: { maxAgeSeconds: 300 },
    binary: true,
    native: true,
  },
  pluginFile: {
    id: "pluginFile",
    method: "get",
    path: "/api/public/plugin/file",
    auth: "public",
    query: PluginFileQuery,
    response: z.string().meta({ id: "PluginFile" }),
    cache: { maxAgeSeconds: 60 },
    binary: true,
    native: true,
  },
  chat: {
    id: "chat",
    method: "post",
    path: "/api/v1/chat",
    auth: "owner",
    body: ChatRequest,
    response: ChatResponse,
    cache: "no-store",
    stream: "sse",
    upstream: true,
    native: true,
  },
  chatResume: {
    id: "chatResume",
    method: "get",
    path: "/api/v1/chat/streams/{streamId}",
    auth: "owner",
    params: StreamParams,
    response: ChatResponse,
    cache: "no-store",
    stream: "sse",
    native: true,
  },
  chatCancel: {
    id: "chatCancel",
    method: "post",
    path: "/api/v1/chat/streams/{streamId}/cancel",
    auth: "owner",
    params: StreamParams,
    response: z.object({ ok: z.literal(true) }).meta({ id: "CancelResponse" }),
    cache: "no-store",
    native: true,
  },
  chatSocket: {
    id: "chatSocket",
    method: "get",
    path: "/api/v1/chat/ws",
    auth: "owner",
    response: z.object({}).meta({ id: "WebSocketUpgrade" }),
    cache: "no-store",
    websocket: true,
    native: true,
  },
  models: {
    id: "models",
    method: "get",
    path: "/api/v1/models",
    auth: "public",
    response: ModelsResponse,
    cache: { maxAgeSeconds: 10 },
    upstream: true,
    native: true,
  },
  ocr: {
    id: "ocr",
    method: "post",
    path: "/api/v1/ocr",
    auth: "owner",
    body: OcrRequest,
    response: OcrResponse,
    cache: "no-store",
    upstream: true,
    native: true,
  },
  syncPush: {
    id: "syncPush",
    method: "post",
    path: "/api/v1/sync/conversations",
    auth: "owner",
    body: SyncPushBody,
    response: SyncPushResponse,
    cache: "no-store",
    native: true,
  },
  syncPull: {
    id: "syncPull",
    method: "get",
    path: "/api/v1/sync/conversations",
    auth: "owner",
    query: SyncPullQuery,
    response: SyncPullResponse,
    cache: "no-store",
    native: true,
  },
  conversations: {
    id: "conversations",
    method: "get",
    path: "/api/v1/conversations",
    auth: "owner",
    response: ConversationListResponse,
    cache: "no-store",
    native: true,
  },
  conversation: {
    id: "conversation",
    method: "get",
    path: "/api/v1/conversations/{id}",
    auth: "owner",
    params: ConversationParams,
    response: ConversationDetail,
    cache: "no-store",
    native: true,
  },
  memoryList: {
    id: "memoryList",
    method: "get",
    path: "/api/v1/memory",
    auth: "owner",
    query: MemoryListQuery,
    response: MemoryListResponse,
    cache: "no-store",
    native: true,
  },
  memoryDelete: {
    id: "memoryDelete",
    method: "post",
    path: "/api/v1/memory/{id}/delete",
    auth: "owner",
    params: MemoryParams,
    response: MemoryDeleteResponse,
    cache: "no-store",
    native: true,
  },
  memoryClear: {
    id: "memoryClear",
    method: "post",
    path: "/api/v1/memory/clear",
    auth: "owner",
    response: MemoryClearResponse,
    cache: "no-store",
    native: true,
  },
  vfsInfo: {
    id: "vfsInfo",
    method: "get",
    path: "/api/v1/vfs",
    auth: "public",
    response: VfsInfoResponse,
    cache: { maxAgeSeconds: 60 },
    native: true,
  },
  vfsStat: {
    id: "vfsStat",
    method: "get",
    path: "/api/v1/vfs/stat",
    auth: "public",
    query: VfsPathQuery,
    response: VfsStatResponse,
    cache: { maxAgeSeconds: 60 },
    native: true,
  },
  vfsList: {
    id: "vfsList",
    method: "get",
    path: "/api/v1/vfs/list",
    auth: "public",
    query: VfsPathQuery,
    response: VfsListResponse,
    cache: { maxAgeSeconds: 60 },
    native: true,
  },
  vfsFile: {
    id: "vfsFile",
    method: "get",
    path: "/api/v1/vfs/file",
    auth: "public",
    query: VfsPathQuery,
    response: z.instanceof(Uint8Array).meta({ id: "Bytes" }),
    cache: { maxAgeSeconds: 86_400 },
    binary: true,
    native: true,
  },
  vfsQuery: {
    id: "vfsQuery",
    method: "post",
    path: "/api/v1/vfs/query",
    auth: "admin",
    body: VfsQueryBody,
    response: VfsQueryResponse,
    cache: "no-store",
    native: true,
  },
  health: {
    id: "health",
    native: true,
    method: "get",
    path: "/health",
    auth: "public",
    response: HealthResponse,
    cache: { maxAgeSeconds: 5 },
  },
  apiHealth: {
    id: "apiHealth",
    native: true,
    method: "get",
    path: "/api/health",
    auth: "public",
    response: HealthResponse,
    cache: "no-store",
  },
  publicStats: {
    id: "publicStats",
    method: "get",
    path: "/api/public/stats",
    auth: "public",
    response: PublicStats,
    cache: { maxAgeSeconds: 15 },
  },
  ragSearch: {
    id: "ragSearch",
    native: true,
    method: "get",
    path: "/api/public/rag/search",
    auth: "public",
    query: RagSearchQuery,
    response: RagSearchResponse,
    cache: { maxAgeSeconds: 300 },
  },
  ragContext: {
    id: "ragContext",
    native: true,
    method: "get",
    path: "/api/public/rag/context",
    auth: "public",
    query: RagSearchQuery,
    response: RagContextResponse,
    cache: { maxAgeSeconds: 300 },
  },
  wikiCategories: {
    id: "wikiCategories",
    native: true,
    method: "get",
    path: "/api/public/wiki/categories",
    auth: "public",
    response: WikiCategoriesResponse,
    cache: WIKI_CACHE,
  },
  wikiList: {
    id: "wikiList",
    native: true,
    method: "get",
    path: "/api/public/wiki/{category}",
    auth: "public",
    params: WikiCategoryParams,
    query: WikiListQuery,
    response: WikiListResponse,
    cache: WIKI_CACHE,
    paginated: true,
  },
  wikiEntity: {
    id: "wikiEntity",
    native: true,
    method: "get",
    path: "/api/public/wiki/{category}/{idOrSlug}",
    auth: "public",
    params: WikiEntityParams,
    response: WikiEntity,
    cache: WIKI_CACHE,
  },
  lexiconList: {
    id: "lexiconList",
    native: true,
    method: "get",
    path: "/api/public/lexicon",
    auth: "public",
    query: LexiconListQuery,
    response: LexiconListResponse,
    cache: { maxAgeSeconds: 3600 },
    paginated: true,
  },
  lexiconTerm: {
    id: "lexiconTerm",
    native: true,
    method: "get",
    path: "/api/public/lexicon/{idOrForm}",
    auth: "public",
    params: LexiconTermParams,
    query: LexiconTermQuery,
    response: LexiconTerm,
    cache: { maxAgeSeconds: 3600 },
  },
  createGoal: {
    id: "createGoal",
    method: "post",
    path: "/api/admin/goals",
    auth: "admin",
    body: CreateGoalBody,
    response: CreateGoalResponse,
    cache: "no-store",
  },
  completeGoal: {
    id: "completeGoal",
    method: "post",
    path: "/api/admin/goals/{id}/complete",
    auth: "admin",
    params: NumericIdParams,
    body: CompleteGoalBody,
    response: CompleteGoalResponse,
    cache: "no-store",
  },
  feedbackStatus: {
    id: "feedbackStatus",
    method: "post",
    path: "/api/training/feedback/{id}/status",
    auth: "admin",
    params: NumericIdParams,
    body: FeedbackStatusBody,
    response: FeedbackStatusResponse,
    cache: "no-store",
  },
  goldCase: {
    id: "goldCase",
    method: "post",
    path: "/api/training/gold",
    auth: "admin",
    body: GoldCaseBody,
    response: GoldCaseResponse,
    cache: "no-store",
  },
  runEval: {
    id: "runEval",
    method: "post",
    path: "/api/training/eval",
    auth: "admin",
    body: EvalRequestBody,
    response: EvalResponse,
    cache: "no-store",
  },
  adminStats: {
    id: "adminStats",
    method: "get",
    path: "/api/stats/totals",
    auth: "admin",
    response: BotAdminStats,
    cache: "no-store",
  },
  adminServices: {
    id: "adminServices",
    method: "get",
    path: "/api/services",
    auth: "admin",
    response: BotServices,
    cache: "no-store",
  },
  adminTables: {
    id: "adminTables",
    method: "get",
    path: "/api/database/tables",
    auth: "admin",
    response: BotTables,
    cache: "no-store",
  },
  adminTableRows: {
    id: "adminTableRows",
    method: "get",
    path: "/api/database/{table}",
    auth: "admin",
    params: TableParams,
    query: TablePageQuery,
    response: BotTableRows,
    cache: "no-store",
    paginated: true,
  },
  adminWikiStats: {
    id: "adminWikiStats",
    method: "get",
    path: "/api/wiki/stats",
    auth: "admin",
    response: BotWikiStats,
    cache: "no-store",
  },
  adminEconomyStats: {
    id: "adminEconomyStats",
    method: "get",
    path: "/api/economy/stats",
    auth: "admin",
    response: BotEconomyStats,
    cache: "no-store",
  },
} as const satisfies Record<string, EndpointSpec>;

export type Endpoints = typeof endpoints;

export const ENDPOINTS: readonly EndpointSpec[] = Object.values(endpoints);

/**
 * Public routes served by the historical bot code (`apps/bot/src/api/server.ts`).
 * They keep priority over the Hono application (docs/architecture/STACK.md D7).
 */
export const LEGACY_PUBLIC_PATHS: readonly string[] = [
  "/health",
  "/health/check",
  "/health/latency",
  "/api/health",
  "/api/openapi.json",
  "/api/public/assets",
  "/api/public/commands",
  "/api/public/data/coverage",
  "/api/public/economy/inflation",
  "/api/public/eval/cache-stats",
  "/api/public/eval/lore-stats",
  "/api/public/eval/reports",
  "/api/public/leaderboard",
  "/api/public/manga/color/{channelId}/{attachmentId}/{file}",
  "/api/public/manga/couleur/{channelId}/{attachmentId}/{file}",
  "/api/public/manga/page/{series}/{volume}/{page}",
  "/api/public/manga/search",
  "/api/public/manga/tomes",
  "/api/public/manga/tomes/{series}/{volume}",
  "/api/public/news",
  "/api/public/personas",
  "/api/public/presence",
  "/api/public/profile/{discordId}/card.png",
  "/api/public/profile/{discordId}/scan.png",
  "/api/public/rag/chat",
  "/api/public/rag/context",
  "/api/public/rag/search",
  "/api/public/shop",
  "/api/public/sources",
  "/api/public/stats",
  "/api/public/user/{discordId}",
  "/api/public/wiki/arcs",
  "/api/public/wiki/arcs/{slug}",
  "/api/public/wiki/characters",
  "/api/public/wiki/characters/{id}",
  "/api/public/wiki/episodes",
  "/api/public/wiki/episodes/{id}",
  "/api/public/wiki/games",
  "/api/public/wiki/games/{slug}",
  "/api/public/wiki/manga/volumes",
  "/api/public/wiki/manga/volumes/{id}",
  "/api/public/wiki/movies",
  "/api/public/wiki/movies/{slug}",
  "/api/public/wiki/news",
  "/api/public/wiki/planets",
  "/api/public/wiki/planets/{id}",
  "/api/public/wiki/races",
  "/api/public/wiki/races/{slug}",
  "/api/public/wiki/sagas",
  "/api/public/wiki/sagas/{slug}",
  "/api/public/wiki/search",
  "/api/public/wiki/techniques",
  "/api/public/wiki/techniques/{slug}",
  "/api/public/wiki/tools",
  "/api/public/wiki/tools/{slug}",
  "/api/public/wiki/transformations",
  "/api/public/wiki/transformations/{id}",
];

type ParamsOf<E> = E extends { params: infer P extends z.ZodType }
  ? { params: z.input<P> }
  : { params?: undefined };
type QueryOf<E> = E extends { query: infer Q extends z.ZodType }
  ? { query?: z.input<Q> }
  : { query?: undefined };
type BodyOf<E> = E extends { body: infer B extends z.ZodType }
  ? { body: z.input<B> }
  : { body?: undefined };

/** Input of a call: path parameters, query, JSON body and the acting user (when signed). */
export type EndpointInput<E extends EndpointSpec> = ParamsOf<E> &
  QueryOf<E> &
  BodyOf<E> & { actingUserId?: string };

export type EndpointOutput<E extends EndpointSpec> = z.output<E["response"]>;

/** Replaces `{name}` segments with URI-encoded values. */
export function fillPath(path: string, params: Record<string, unknown> | undefined): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`missing path parameter "${name}" for ${path}`);
    }
    return encodeURIComponent(String(value));
  });
}
