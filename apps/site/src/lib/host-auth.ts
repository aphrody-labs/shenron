import { resolveHostUrl } from "@shenron/config/public-urls";
import { auth } from "@/lib/auth";

/**
 * Hôte Bun (`shenron-server`) comme fournisseur d'authentification, en option : quand
 * `SHENRON_HOST_URL` est posée, `/api/auth/*` lui est relayé et la session se lit chez lui
 * (cookie ou Bearer transmis tels quels). Variable absente : le site garde son propre
 * Better Auth, comportement inchangé.
 */
export function hostAuthUrl(): string | null {
  return resolveHostUrl(process.env) ?? null;
}

const FORWARDED = ["cookie", "authorization", "user-agent", "x-forwarded-for", "x-real-ip"];

function forwardHeaders(source: Headers): Headers {
  const out = new Headers();
  for (const name of FORWARDED) {
    const value = source.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

/** Relaie une requête `/api/auth/*` vers l'hôte, sans suivre ses redirections (OAuth). */
export async function proxyAuthToHost(request: Request, host: string): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, host);
  const headers = forwardHeaders(request.headers);
  for (const name of ["content-type", "origin", "referer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
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
    const response = await fetch(new URL("/api/auth/get-session", host), {
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

/** `{ api.getSession }` du site : l'hôte quand il est configuré, sinon Better Auth local. */
export const sessionAuth = {
  handler: (request: Request) => auth.handler(request),
  api: {
    getSession: ({ headers }: { headers: Headers }) => {
      const host = hostAuthUrl();
      return host ? hostGetSession(host, headers) : auth.api.getSession({ headers });
    },
  },
};
