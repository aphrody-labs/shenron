/**
 * Client API browser pour le dashboard admin du site.
 *
 * Toutes les requêtes passent par le proxy server-side `/api/bot-admin/<path>`
 * (cf. app/api/bot-admin/[...path]/route.ts) qui :
 *   - vérifie la session admin (Better Auth + users.roleAdmin),
 *   - injecte le Bearer SHENRON_ADMIN_TOKEN (jamais exposé au browser),
 *   - forward vers l'API REST du bot `${SHENRON_API_URL}/api/<path>`.
 *
 * Donc `api.get("/economy/stats")` → `/api/bot-admin/economy/stats` → bot `/api/economy/stats`.
 * Mirroir 1:1 du client du dashboard interne du bot (apps/bot/src/dashboard/lib/api.ts)
 * pour permettre le portage quasi-verbatim des pages.
 */
const PROXY_BASE = "/api/bot-admin";

function joinPath(base: string, path: string): string {
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function resolvePath(path: string): string {
  return joinPath(PROXY_BASE, path);
}

interface ApiOpts extends RequestInit {
  json?: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestAt<T>(base: string, path: string, opts: ApiOpts = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  let body: BodyInit | undefined = opts.body as BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  const res = await fetch(joinPath(base, path), {
    credentials: "same-origin",
    ...opts,
    headers,
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || `HTTP ${res.status}`;
    try {
      const error = JSON.parse(text) as { error?: unknown; message?: unknown };
      const detail = error.error ?? error.message;
      if (typeof detail === "string") message = detail;
    } catch {
      // Keep non-JSON error responses readable.
    }
    throw new ApiError(res.status, message);
  }
  // 204 No Content ou corps vide → renvoie null typé
  if (res.status === 204 || res.status === 205) return null as T;
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text) return null as T;
  if (!ct.includes("application/json") && !ct.includes("+json")) return text as unknown as T;
  return JSON.parse(text) as T;
}

interface CrudClient {
  get: <T = unknown>(path: string, opts?: RequestInit) => Promise<T>;
  post: <T = unknown>(path: string, json?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, json?: unknown) => Promise<T>;
  patch: <T = unknown>(path: string, json?: unknown) => Promise<T>;
  delete: <T = unknown>(path: string, json?: unknown) => Promise<T>;
}

/**
 * Construit un client CRUD sur une base arbitraire (même contrat que `api`).
 * Utilisé pour router les tables wiki éditoriales vers `/api/wiki-admin`
 * (Neon direct) au lieu de `/api/bot-admin` (proxy bot). Cf. `crudBase()`.
 */
export function apiAt(base: string): CrudClient {
  return {
    get: <T = unknown>(path: string, opts?: RequestInit) => requestAt<T>(base, path, opts),
    post: <T = unknown>(path: string, json?: unknown) =>
      requestAt<T>(base, path, { method: "POST", json }),
    put: <T = unknown>(path: string, json?: unknown) =>
      requestAt<T>(base, path, { method: "PUT", json }),
    patch: <T = unknown>(path: string, json?: unknown) =>
      requestAt<T>(base, path, { method: "PATCH", json }),
    delete: <T = unknown>(path: string, json?: unknown) =>
      requestAt<T>(base, path, { method: "DELETE", json }),
  };
}

export const api: CrudClient = apiAt(PROXY_BASE);

/** URL absolue d'un asset/canvas servi par le bot via le proxy (GET only, images). */
export function proxyAsset(path: string): string {
  return resolvePath(path);
}
