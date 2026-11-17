// SPDX-License-Identifier: Apache-2.0
/**
 * The Activity server: one `Bun.serve` that
 *  - serves the built client (`GET /`, hashed assets) with the headers an iframe of the Discord
 *    client needs (no `X-Frame-Options`, a CSP whose `frame-ancestors` names Discord);
 *  - exchanges the OAuth code of `authorize()` for an access token (`POST /api/token`);
 *  - runs the game sockets (`GET /ws`), see `ws/hub.ts`;
 *  - signs and settles finished rounds with the bot (`settle/settler.ts`);
 *  - answers `GET /health`.
 *
 * Every outgoing dependency (Discord, the bot, the question bank, the clock) is injected, so the
 * integration tests run the real server on an ephemeral port without any network.
 */
import { systemClock, secureRng, type Clock, type Rng } from "@aphrody/shenron-activity";
import { type QuizBank, type RewardPolicy } from "@aphrody/shenron-activity/quiz";
import { lexiconQuizBank } from "@aphrody/shenron-activity/quiz/lexicon";
import type { RoomLimits } from "@aphrody/shenron-activity/rooms";
import type { Server } from "bun";
import pkg from "../package.json" with { type: "json" };
import { createDevPort } from "./auth/dev";
import { createDiscordPort, type DiscordPort } from "./auth/discord";
import type { ActivityConfig } from "./config";
import { directoryAssets, gzipped, type AssetStore } from "./http/assets";
import { createLimiter, type Limiter } from "./http/limiter";
import { securityHeaders } from "./http/security";
import { consoleLogger, type Logger } from "./log";
import { Settler } from "./settle/settler";
import { ActivityHub, newSocketState, type HubSocket, type SocketState } from "./ws/hub";

export interface ActivityServerOptions {
  readonly config: ActivityConfig;
  readonly discord?: DiscordPort;
  readonly assets?: AssetStore;
  readonly bank?: QuizBank;
  readonly clock?: Clock;
  readonly rng?: Rng;
  readonly limits?: Partial<RoomLimits>;
  readonly rewardPolicy?: RewardPolicy;
  /** `fetch` used to reach the bot API (tests pass a fake). */
  readonly botFetch?: typeof fetch;
  readonly settlerBackoffMs?: (attempt: number) => number;
  readonly verifyMembership?: (instanceId: string, userId: string) => Promise<boolean>;
  readonly log?: Logger;
}

export interface RunningActivityServer {
  readonly server: Server<SocketState>;
  readonly hub: ActivityHub;
  readonly settler: Settler;
  readonly url: string;
  stop(): Promise<void>;
}

/** Body of `POST /api/token`: a code is far shorter than this. */
const MAX_TOKEN_BODY_BYTES = 2048;

function clientKey(request: Request, server: Server<SocketState>): string {
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").at(-1)?.trim() || "unknown";
  return server.requestIP(request)?.address ?? "unknown";
}

export function startActivityServer(options: ActivityServerOptions): RunningActivityServer {
  const { config } = options;
  const log = options.log ?? consoleLogger;
  const clock = options.clock ?? systemClock;
  const discord =
    options.discord ??
    (config.devAuth
      ? createDevPort()
      : createDiscordPort({ clientId: config.clientId, clientSecret: config.clientSecret }));
  const assets = options.assets ?? directoryAssets(config.distDir);
  const headers = securityHeaders({ publicUrl: config.publicUrl, development: config.devAuth });

  const hubRef: { current: ActivityHub | null } = { current: null };
  const settler = new Settler({
    secret: config.activitySecret,
    botApiUrl: config.botApiUrl,
    botApiToken: config.botApiToken,
    fetch: options.botFetch,
    backoffMs: options.settlerBackoffMs,
    log,
    onSettled: (instanceId, settled) => hubRef.current?.applySettled(instanceId, settled),
  });
  const hub = new ActivityHub({
    clock,
    rng: options.rng ?? secureRng(),
    bank: options.bank ?? lexiconQuizBank(),
    limits: options.limits,
    rewardPolicy: options.rewardPolicy,
    discord,
    log,
    verifyMembership: options.verifyMembership,
    onSettlement: (receipt) => settler.enqueue(receipt),
  });
  hubRef.current = hub;

  const perClient: Limiter = createLimiter({ max: 30, windowMs: 60_000, now: () => clock.now() });
  const overall: Limiter = createLimiter({ max: 600, windowMs: 60_000, now: () => clock.now() });

  function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
    return Response.json(body, {
      status,
      headers: { ...headers, "Cache-Control": "no-store", ...extra },
    });
  }

  async function health(): Promise<Response> {
    const client = await assets.hasIndex();
    const oauth = config.devAuth || (config.clientId !== null && config.clientSecret !== null);
    const settlement = settler.enabled;
    return json({
      status: client && oauth ? "ok" : "degraded",
      version: pkg.version,
      client,
      oauth,
      settlement,
      ...hub.stats,
      receipts: settler.stats,
    });
  }

  async function token(request: Request, server: Server<SocketState>): Promise<Response> {
    const key = clientKey(request, server);
    const wait = Math.max(perClient.take(key), overall.take("*"));
    if (wait > 0)
      return json({ error: "rate_limited" }, 429, {
        "Retry-After": String(Math.ceil(wait / 1000)),
      });
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_TOKEN_BODY_BYTES) return json({ error: "invalid_request" }, 413);
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_TOKEN_BODY_BYTES) return json({ error: "invalid_request" }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    const code = (body as { code?: unknown } | null)?.code;
    if (typeof code !== "string") return json({ error: "invalid_request" }, 400);
    const result = await discord.exchangeCode(code);
    if (result.ok) return json({ access_token: result.accessToken });
    switch (result.reason) {
      case "invalid_code":
        return json({ error: "invalid_code" }, 400);
      case "not_configured":
        return json({ error: "not_configured" }, 503);
      default:
        return json({ error: "discord_unavailable" }, 502);
    }
  }

  async function serveAsset(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...headers, Allow: "GET, HEAD" },
      });
    const path = new URL(request.url).pathname;
    const asset = await assets.read(path);
    if (!asset) {
      if (path === "/" || path === "/index.html")
        return new Response("The Activity client is not built: run `bun run build`.", {
          status: 503,
          headers: { ...headers, "Cache-Control": "no-store", "Content-Type": "text/plain" },
        });
      return new Response("Not Found", {
        status: 404,
        headers: { ...headers, "Cache-Control": "no-store", "Content-Type": "text/plain" },
      });
    }
    const out: Record<string, string> = {
      ...headers,
      "Content-Type": asset.type,
      "Cache-Control": asset.immutable ? "public, max-age=31536000, immutable" : "no-store",
      Vary: "Accept-Encoding",
    };
    let body: Uint8Array = asset.bytes;
    if (request.headers.get("accept-encoding")?.includes("gzip")) {
      const packed = gzipped(asset);
      if (packed) {
        body = packed;
        out["Content-Encoding"] = "gzip";
      }
    }
    out["Content-Length"] = String(body.length);
    return new Response(request.method === "HEAD" ? null : (body as Uint8Array<ArrayBuffer>), {
      headers: out,
    });
  }

  const server = Bun.serve<SocketState>({
    hostname: config.host,
    port: config.port,
    routes: {
      "/health": () => health(),
      "/api/health": () => health(),
      // The client id is public (it is in the OAuth URL); serving it keeps one build for every
      // environment instead of baking the application id into the bundle.
      "/api/config": () => json({ clientId: config.clientId }),
      "/api/token": {
        POST: (request: Request, srv: Server<SocketState>) => token(request, srv),
        // Anything else on this path is a client mistake, not a missing page.
        GET: () => json({ error: "method_not_allowed" }, 405, { Allow: "POST" }),
      },
      "/ws": (request: Request, srv: Server<SocketState>) => {
        if (srv.upgrade(request, { data: newSocketState() })) return undefined;
        return new Response("Expected a WebSocket upgrade", {
          status: 426,
          headers: { ...headers, Upgrade: "websocket" },
        });
      },
    },
    fetch: (request) => serveAsset(request),
    websocket: {
      // A frame is at most one hello (a token) or one intent; see PROTOCOL_LIMITS.
      maxPayloadLength: 4096,
      idleTimeout: 90,
      perMessageDeflate: false,
      open: (ws) => hub.open(ws as unknown as HubSocket),
      message: (ws, message) => hub.message(ws as unknown as HubSocket, message),
      close: (ws) => hub.close(ws as unknown as HubSocket),
    },
    error(error) {
      log.error("request failed", { error: error.message });
      return new Response("Internal Server Error", { status: 500, headers });
    },
  });

  const url = `http://${config.host.includes(":") ? `[${config.host}]` : config.host}:${server.port}`;
  for (const warning of config.warnings) log.warn(warning);
  log.info("activity server listening", {
    url,
    oauth: config.devAuth || (config.clientId !== null && config.clientSecret !== null),
    settlement: settler.enabled,
    devAuth: config.devAuth,
  });

  return {
    server,
    hub,
    settler,
    url,
    async stop() {
      hub.stop();
      settler.stop();
      await server.stop(true);
    },
  };
}
