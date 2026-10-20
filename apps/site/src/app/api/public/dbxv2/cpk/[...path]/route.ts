// SPDX-License-Identifier: Apache-2.0
/** Public, read-only relay for owner-authorized CPK indexes and selected file entries. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Environment = Readonly<Record<string, string | undefined>>;
type Fetcher = (input: URL, init?: RequestInit) => Promise<Response>;

const PUBLIC_CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400";
const FILE_CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";
const SAFE_ACTIONS = new Set(["find", "raw", "png", "wav", "video", "mp4", "model"]);
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified",
] as const;

function upstreamUrl(
  path: readonly string[],
  query: URLSearchParams,
  env: Environment,
): URL | null {
  if (env.DBXV2_PUBLIC_CPK !== "1") return null;
  const base = env.DBXV2_SERVER_URL?.trim();
  const token = env.DBXV2_TOKEN ?? "";
  if (!base || token.length < 16 || path.length > 32) return null;

  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    return null;
  }
  if (
    (origin.protocol !== "http:" && origin.protocol !== "https:") ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    return null;

  let route: string;
  let publicCache = false;
  if (path.length === 0) {
    route = "cpk";
    publicCache = true;
  } else {
    const [name, action, ...rest] = path;
    if (!name || !/^[A-Za-z0-9_]{1,96}$/.test(name) || !action || !SAFE_ACTIONS.has(action))
      return null;
    if (action === "find") {
      if (rest.length !== 0) return null;
      route = `cpk/${name}/find`;
      publicCache = true;
    } else {
      if (action === "raw" && (rest.length > 16 || rest.some((part) => part.length > 255)))
        return null;
      if (
        rest.length === 0 ||
        rest.some(
          (part) =>
            !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"),
        )
      )
        return null;
      route = `cpk/${name}/${action}/${rest.map(encodeURIComponent).join("/")}`;
    }
  }

  const target = new URL(`/${route}`, origin);
  const allowedQuery =
    path.at(-1) === "find"
      ? ["q", "limit", "offset"]
      : path.at(-2) === "png"
        ? ["index"]
        : path.at(-2) === "wav"
          ? ["cue"]
          : path.at(-2) === "mp4"
            ? ["t", "d"]
            : [];
  for (const key of allowedQuery) {
    const value = query.get(key);
    if (value !== null) target.searchParams.set(key, value.slice(0, 512));
  }
  // Mark only the catalogue responses as JSON cacheable; binary entries are revalidated by ETag.
  target.searchParams.set("__publicCache", publicCache ? "catalogue" : "file");
  return target;
}

export async function relayPublicCpk(
  request: Request,
  path: readonly string[],
  env: Environment = process.env,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response(null, {
      status: 405,
      headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
    });
  const requestUrl = new URL(request.url);
  const target = upstreamUrl(path, requestUrl.searchParams, env);
  if (!target) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const cacheClass = target.searchParams.get("__publicCache");
  target.searchParams.delete("__publicCache");

  const headers = new Headers({ Authorization: `Bearer ${env.DBXV2_TOKEN}` });
  for (const key of ["range", "if-range", "if-none-match"] as const) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  let upstream: Response;
  try {
    upstream = await fetcher(target, { method: request.method, headers, redirect: "error" });
  } catch {
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (upstream.status >= 500 || upstream.status === 401 || upstream.status === 403)
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });

  const responseHeaders = new Headers({
    "Cache-Control":
      upstream.ok || upstream.status === 206 || upstream.status === 304
        ? cacheClass === "catalogue"
          ? PUBLIC_CACHE
          : FILE_CACHE
        : "no-store",
    "CDN-Cache-Control":
      cacheClass === "catalogue" ? "public, max-age=3600" : "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  for (const key of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  if (upstream.status === 304 || request.method === "HEAD")
    return new Response(null, { status: upstream.status, headers: responseHeaders });
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type Context = { params: Promise<{ path?: string[] }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const { path = [] } = await context.params;
  return relayPublicCpk(request, path);
}

export { handle as GET, handle as HEAD };
