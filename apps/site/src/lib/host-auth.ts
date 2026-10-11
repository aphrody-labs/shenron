import { resolveHostUrl } from "@shenron/config/public-urls";

/**
 * Bun owns authentication. The site forwards cookies and Bearer credentials to
 * SHENRON_HOST_URL; missing configuration never starts a local auth/database backend.
 */
export function hostAuthUrl(): string | null {
  return resolveHostUrl(process.env) ?? null;
}

const FORWARDED = ["cookie", "authorization", "user-agent", "x-forwarded-for", "x-real-ip"];
export const AUTH_RELAY_HEADER = "x-shenron-auth-relay";

function forwardHeaders(source: Headers): Headers {
  const out = new Headers();
  for (const name of FORWARDED) {
    const value = source.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

/** Relaie une requête `/api/auth/*` vers l'hôte, sans suivre ses redirections (OAuth). */
export async function proxyAuthToHost(
  request: Request,
  host: string,
  timeoutMs = 15_000,
): Promise<Response> {
  // A misconfigured front must not relay the same OAuth request back to itself.
  if (request.headers.has(AUTH_RELAY_HEADER)) return authUnavailable();
  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, host);
  const headers = forwardHeaders(request.headers);
  for (const name of ["content-type", "origin", "referer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  headers.set(AUTH_RELAY_HEADER, "1");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]),
  });
}

export interface HostSessionBody {
  user: { id: string; name: string | null; image: string | null };
}

/** Session Better Auth lue chez l'hôte ; `null` si absente, expirée ou hôte injoignable. */
export async function hostGetSession(
  host: string,
  headers: Headers,
): Promise<HostSessionBody | null> {
  try {
    const target = new URL("/api/auth/get-session", host);
    // Read the live auth user rather than an older signed cookie snapshot.
    target.searchParams.set("disableCookieCache", "true");
    const response = await fetch(target, {
      headers: forwardHeaders(headers),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as {
      user?: { id?: unknown; name?: unknown; image?: unknown };
    } | null;
    const user = body?.user;
    if (typeof user?.id !== "string") return null;
    return {
      user: {
        id: user.id,
        name: typeof user.name === "string" ? user.name : null,
        image: typeof user.image === "string" ? user.image : null,
      },
    };
  } catch {
    return null;
  }
}

/** Explicit unavailable response for authentication; never cache an outage as a session. */
export function authUnavailable(): Response {
  return Response.json(
    { error: "auth_unavailable" },
    {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

/** Compatibility surface for server components; all authentication runs on Bun. */
export const sessionAuth = {
  handler: async (request: Request) => {
    const host = hostAuthUrl();
    if (!host) return authUnavailable();
    try {
      return await proxyAuthToHost(request, host);
    } catch {
      return authUnavailable();
    }
  },
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const host = hostAuthUrl();
      return host ? hostGetSession(host, headers) : null;
    },
  },
};
