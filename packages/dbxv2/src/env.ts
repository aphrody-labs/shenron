/**
 * Explicit public gateway configuration and private server gating.
 * Local database paths remain unavailable in public builds. Pure: callers pass the environment.
 */

export type Dbxv2EnvInput = Readonly<Record<string, string | undefined>>;

export const DBXV2_MIN_TOKEN_LENGTH = 16;

export interface Dbxv2Config {
  /** Origin (and optional path prefix) of the server, without trailing slash. */
  readonly baseUrl: string;
  readonly token?: string;
  readonly mode?: "public";
}

export type Dbxv2DisabledReason =
  | "public-render"
  | "production"
  | "missing-url"
  | "invalid-url"
  | "missing-token"
  | "short-token";

export type Dbxv2Status =
  | { readonly enabled: true; readonly config: Dbxv2Config }
  | { readonly enabled: false; readonly reason: Dbxv2DisabledReason };

const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]", ""]);

const truthy = (value: string | undefined): boolean =>
  value !== undefined && /^(?:1|true|yes|on)$/i.test(value.trim());

/** A public render or build (or a production runtime): the private features never run there. */
export function isPublicContext(env: Dbxv2EnvInput): Dbxv2DisabledReason | null {
  if (
    env.SHENRON_PROFILE === "public" ||
    truthy(env.SHENRON_PUBLIC_RENDER) ||
    truthy(env.SHENRON_PUBLIC_BUILD)
  )
    return "public-render";
  if (env.NODE_ENV === "production") return "production";
  return null;
}

/** Parses and validates a server URL; null when unusable (not http(s), wildcard host, credentials). */
export function normalizeServerUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (WILDCARD_HOSTS.has(url.hostname)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.href.replace(/\/+$/, "");
}

export function dbxv2Status(env: Dbxv2EnvInput): Dbxv2Status {
  if (env.DBXV2_CLIENT_MODE === "public") {
    const baseUrl = normalizeServerUrl(env.DBXV2_PUBLIC_URL ?? "");
    if (!baseUrl || !baseUrl.startsWith("https://"))
      return { enabled: false, reason: "invalid-url" };
    return { enabled: true, config: { mode: "public", baseUrl } };
  }
  const context = isPublicContext(env);
  if (context === "public-render") return { enabled: false, reason: context };
  const rawUrl = env.DBXV2_SERVER_URL?.trim();
  if (!rawUrl) return { enabled: false, reason: "missing-url" };
  const baseUrl = normalizeServerUrl(rawUrl);
  if (!baseUrl) return { enabled: false, reason: "invalid-url" };
  const token = env.DBXV2_TOKEN ?? "";
  if (!token) return { enabled: false, reason: "missing-token" };
  if (token.length < DBXV2_MIN_TOKEN_LENGTH) return { enabled: false, reason: "short-token" };
  return { enabled: true, config: { baseUrl, token } };
}

/** The server client features (`DBXV2_SERVER_URL` and `DBXV2_TOKEN`) are usable. */
export function isDbxv2Enabled(env: Dbxv2EnvInput): boolean {
  return dbxv2Status(env).enabled;
}

/** Path of the private database (`DBXV2_DB_PATH`), or null when unset or in a public context. */
export function dbxv2DbPath(env: Dbxv2EnvInput): string | null {
  if (isPublicContext(env)) return null;
  const path = env.DBXV2_DB_PATH?.trim();
  return path ? path : null;
}

export function isDbxv2DbEnabled(env: Dbxv2EnvInput): boolean {
  return dbxv2DbPath(env) !== null;
}

const REASONS: Readonly<Record<Dbxv2DisabledReason, string>> = {
  "public-render": "DBXV2 is never available in a public render or build",
  production: "DBXV2 is disabled when NODE_ENV=production",
  "missing-url": "DBXV2_SERVER_URL is not set",
  "invalid-url": "DBXV2_SERVER_URL must be an http(s) URL without credentials or wildcard host",
  "missing-token": "DBXV2_TOKEN is not set",
  "short-token": `DBXV2_TOKEN must hold at least ${DBXV2_MIN_TOKEN_LENGTH} characters`,
};

export function describeDisabledReason(reason: Dbxv2DisabledReason): string {
  return REASONS[reason];
}

/** The process environment unless one is given (the only place that reads `process.env` by default). */
export function currentEnv(env: Dbxv2EnvInput = process.env): Dbxv2EnvInput {
  return env;
}
