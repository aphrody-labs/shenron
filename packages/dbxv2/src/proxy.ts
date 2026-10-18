/**
 * Loopback proxy that signs short-lived resource URLs, so `<img>`, `<audio>`, `<video>` or a
 * native engine can load DBXV2 resources without ever seeing the bearer token.
 *
 * `proxy.url.png(ref)` returns `http://127.0.0.1:<port>/r/png/<cpk>/<path>?exp=<unix>&sig=<hmac>`.
 * The signature (HMAC-SHA256 with a per-process random secret) covers kind, entry, parameters and
 * expiry. The proxy adds `Authorization` itself, forwards `Range`, `If-Range` and
 * `If-None-Match`, and streams the answer. It binds to loopback only.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Dbxv2ConfigError, Dbxv2DisabledError } from "./errors";
import {
  DBXV2_MIN_TOKEN_LENGTH,
  describeDisabledReason,
  isPublicContext,
  normalizeServerUrl,
  type Dbxv2EnvInput,
} from "./env";
import {
  DBXV2_RESOURCE_KINDS,
  parseRef,
  resourcePath,
  resourceQuery,
  type Dbxv2RefInput,
  type Dbxv2ResourceKind,
  type Dbxv2ResourceParams,
} from "./refs";

export interface Dbxv2ProxyOptions {
  readonly upstream: { readonly baseUrl: string; readonly token: string };
  /** Lifetime of a signed URL in seconds (default 300, maximum 3600). */
  readonly ttlSeconds?: number;
  /** Loopback address only (default `127.0.0.1`). */
  readonly hostname?: "127.0.0.1" | "::1" | "localhost";
  /** 0 picks a free port. */
  readonly port?: number;
  /** Secret of the signatures (default: 32 random bytes per process). */
  readonly secret?: string | Uint8Array;
  readonly fetch?: typeof fetch;
  /** Environment checked for a public render (default `process.env`). */
  readonly env?: Dbxv2EnvInput;
  readonly now?: () => number;
}

export interface Dbxv2UrlBuilders {
  raw(ref: Dbxv2RefInput): string;
  png(ref: Dbxv2RefInput, params?: { readonly index?: number }): string;
  audio(ref: Dbxv2RefInput, params?: { readonly cue?: number }): string;
  video(ref: Dbxv2RefInput): string;
  /** Web fragmented MP4 (H.264, no audio) transcoded on demand by the server: the format browsers can play. */
  mp4(ref: Dbxv2RefInput): string;
  modelJson(ref: Dbxv2RefInput, params?: { readonly emb?: string; readonly esk?: string }): string;
  modelGlb(ref: Dbxv2RefInput, params?: { readonly emb?: string; readonly esk?: string }): string;
}

export interface Dbxv2Proxy {
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  readonly url: Dbxv2UrlBuilders;
  /** Signs any kind/parameters; `ttlSeconds` overrides the default for this URL. */
  sign(
    kind: Dbxv2ResourceKind,
    ref: Dbxv2RefInput,
    params?: Dbxv2ResourceParams,
    ttlSeconds?: number,
  ): string;
  stop(): void;
}

const MAX_TTL = 3600;
const PASS_REQUEST = ["range", "if-range", "if-none-match"] as const;
const PASS_RESPONSE = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
] as const;
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

function canonical(kind: string, entry: string, query: URLSearchParams, exp: number): string {
  const sorted = new URLSearchParams(query);
  sorted.sort();
  return `${kind}\n${entry}\n${sorted.toString()}\n${exp}`;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function createDbxv2Proxy(options: Dbxv2ProxyOptions): Dbxv2Proxy {
  const env = options.env ?? (process.env as Dbxv2EnvInput);
  const blocked = isPublicContext(env);
  if (blocked) throw new Dbxv2DisabledError(describeDisabledReason(blocked));
  const upstream = normalizeServerUrl(options.upstream.baseUrl);
  if (!upstream) throw new Dbxv2ConfigError("upstream.baseUrl must be a valid http(s) URL");
  const token = options.upstream.token;
  if (token.length < DBXV2_MIN_TOKEN_LENGTH)
    throw new Dbxv2ConfigError(
      `upstream.token must hold at least ${DBXV2_MIN_TOKEN_LENGTH} characters`,
    );
  const hostname = options.hostname ?? "127.0.0.1";
  if (!LOOPBACK.has(hostname)) throw new Dbxv2ConfigError("the proxy binds to loopback only");
  const ttlDefault = Math.min(Math.max(options.ttlSeconds ?? 300, 1), MAX_TTL);
  const secret = options.secret ?? randomBytes(32);
  if (typeof secret === "string" && secret.length < 16)
    throw new Dbxv2ConfigError("secret must hold at least 16 characters");
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  const mac = (message: string): Buffer => createHmac("sha256", secret).update(message).digest();

  const handle = async (req: Request): Promise<Response> => {
    if (req.method !== "GET" && req.method !== "HEAD") return jsonError(405, "method not allowed");
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "r" || parts.length < 4) return jsonError(404, "not found");
    const kind = parts[1] as Dbxv2ResourceKind;
    if (!DBXV2_RESOURCE_KINDS.includes(kind)) return jsonError(404, "not found");
    let ref;
    try {
      ref = parseRef({ cpk: parts[2]!, path: parts.slice(3).map(decodeURIComponent).join("/") });
    } catch {
      return jsonError(400, "bad entry reference");
    }
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    const signed = new URLSearchParams(url.searchParams);
    signed.delete("exp");
    signed.delete("sig");
    // Only the parameters the kind understands are forwarded and signed.
    let allowed: URLSearchParams;
    try {
      allowed = resourceQuery(kind, {
        index: numberOf(signed.get("index")),
        cue: numberOf(signed.get("cue")),
        emb: signed.get("emb") ?? undefined,
        esk: signed.get("esk") ?? undefined,
      });
    } catch {
      return jsonError(400, "bad parameters");
    }
    if (allowed.toString() !== sortedString(signed)) return jsonError(400, "unexpected parameters");
    const expected = mac(canonical(kind, `${ref.cpk}/${ref.path}`, allowed, exp));
    let given: Buffer;
    try {
      given = Buffer.from(sig, "hex");
    } catch {
      return jsonError(403, "invalid signature");
    }
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      return jsonError(403, "invalid signature");
    if (!Number.isFinite(exp) || exp * 1000 < now()) return jsonError(403, "signed URL expired");

    const headers = new Headers({ Authorization: `Bearer ${token}` });
    for (const name of PASS_REQUEST) {
      const value = req.headers.get(name);
      if (value) headers.set(name, value);
    }
    const target = `${upstream}${resourcePath(kind, ref)}${allowed.size > 0 ? `?${allowed}` : ""}`;
    let res: Response;
    try {
      res = await doFetch(target, {
        method: req.method,
        headers,
        redirect: "error",
        signal: req.signal,
      });
    } catch {
      return jsonError(502, "upstream unreachable");
    }
    const out = new Headers({
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-site",
      "Referrer-Policy": "no-referrer",
    });
    for (const name of PASS_RESPONSE) {
      const value = res.headers.get(name);
      if (value) out.set(name, value);
    }
    if (res.status >= 400)
      return jsonError(res.status === 401 ? 502 : res.status, "upstream error");
    return new Response(req.method === "HEAD" ? null : res.body, {
      status: res.status,
      headers: out,
    });
  };

  const server = Bun.serve({
    hostname,
    port: options.port ?? 0,
    fetch: (req) => handle(req),
  });
  const host = hostname === "::1" ? "[::1]" : hostname;
  const origin = `http://${host}:${server.port}`;

  const sign: Dbxv2Proxy["sign"] = (kind, input, params = {}, ttl) => {
    const ref = parseRef(input);
    const query = resourceQuery(kind, params);
    const exp = Math.floor(now() / 1000) + Math.min(Math.max(ttl ?? ttlDefault, 1), MAX_TTL);
    const signature = mac(canonical(kind, `${ref.cpk}/${ref.path}`, query, exp)).toString("hex");
    const search = new URLSearchParams(query);
    search.set("exp", String(exp));
    search.set("sig", signature);
    return `${origin}/r/${kind}/${ref.cpk}/${encodePath(ref.path)}?${search}`;
  };

  return {
    origin,
    sign,
    url: {
      raw: (ref) => sign("raw", ref),
      png: (ref, params) => sign("png", ref, params),
      audio: (ref, params) => sign("wav", ref, params),
      video: (ref) => sign("video", ref),
      mp4: (ref) => sign("mp4", ref),
      modelJson: (ref, params) => sign("model.json", ref, params),
      modelGlb: (ref, params) => sign("model.glb", ref, params),
    },
    stop: () => {
      void server.stop(true);
    },
  };
}

function numberOf(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
}

function sortedString(params: URLSearchParams): string {
  const copy = new URLSearchParams(params);
  copy.sort();
  return copy.toString();
}
