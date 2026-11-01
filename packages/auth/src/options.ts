/**
 * Better Auth option presets shared by the site and the bot (runtime class `server`).
 *
 * Invariants (docs/architecture/STACK.md §3.3): `prompt: "consent"` on Discord (without it
 * Better Auth emits `prompt=none` and every first login fails with
 * `consent_required`), `identify`/`email` never repeated in the extra scopes
 * (Better Auth adds them itself), byte-stable placeholder e-mail for
 * phone-only accounts, no session cookie cache, `warn` logging in production, IP
 * headers trusted only from a loopback proxy.
 */
import type { BetterAuthOptions } from "better-auth";
import type { DiscordOptions } from "better-auth/social-providers";
import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { mapDiscordProfileEmail } from "./index";

/** Registered provider credentials only; no consumer cookie or password becomes an OAuth application. */
export function crunchyrollOAuthConfig(input: {
  clientId?: string;
  clientSecret?: string;
  discoveryUrl?: string;
}): GenericOAuthConfig | null {
  if (!input.clientId || !input.discoveryUrl) return null;
  let discovery: URL;
  try {
    discovery = new URL(input.discoveryUrl);
  } catch {
    return null;
  }
  if (
    discovery.protocol !== "https:" ||
    discovery.username ||
    discovery.password ||
    discovery.port ||
    discovery.search ||
    discovery.hash ||
    !(
      discovery.hostname === "crunchyroll.com" || discovery.hostname.endsWith(".crunchyroll.com")
    ) ||
    !discovery.pathname.endsWith("/.well-known/openid-configuration")
  )
    return null;
  if (input.clientId.length > 1024 || /[\r\n\0]/.test(input.clientId)) return null;
  return {
    providerId: "crunchyroll",
    name: "Crunchyroll",
    clientId: input.clientId,
    ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
    discoveryUrl: discovery.href,
    scopes: ["openid", "profile", "email"],
    pkce: true,
    responseType: "code",
    requireIdTokenVerification: true,
    disableSignUp: true,
    disableImplicitSignUp: true,
  };
}

/** Scopes Better Auth already requests for Discord. */
const IMPLICIT_DISCORD_SCOPES: ReadonlySet<string> = new Set(["identify", "email"]);

export interface DiscordProviderInput {
  clientId: string;
  clientSecret: string;
  /** Extra scopes (`guilds`, `guilds.members.read`); implicit ones are stripped. */
  extraScopes?: readonly string[];
}

export function discordProvider(input: DiscordProviderInput) {
  const scope: string[] = [];
  for (const raw of input.extraScopes ?? []) {
    const value = raw.trim();
    if (value && !IMPLICIT_DISCORD_SCOPES.has(value) && !scope.includes(value)) scope.push(value);
  }
  return {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    scope,
    prompt: "consent",
    mapProfileToUser: (profile) => mapDiscordProfileEmail(profile),
  } satisfies DiscordOptions;
}

export type DiscordProviderOptions = ReturnType<typeof discordProvider>;

export function loggingOptions(nodeEnv: string | undefined): {
  logger: { level: "warn" | "debug" };
} {
  return { logger: { level: nodeEnv === "production" ? "warn" : "debug" } };
}

/** `debugLogs` of the Drizzle adapter: on outside production only. */
export function drizzleDebugLogs(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}

/** Avoid stale roles, suspensions, and revoked sessions until a signed cookie expires. */
export const SESSION_COOKIE_CACHE = Object.freeze({ enabled: false } as const);

/** Loopback only: nginx runs on the same host and sets `X-Real-IP`. */
export const LOOPBACK_PROXIES: readonly string[] = Object.freeze(["127.0.0.1", "::1"]);

export interface AdvancedOptionsInput {
  production: boolean;
  /** Bot: `shenron_ba`. Omitted on the site (Better Auth default). */
  cookiePrefix?: string;
  trustedProxies?: readonly string[];
}

export function advancedOptions(input: AdvancedOptionsInput) {
  return {
    useSecureCookies: input.production,
    crossSubDomainCookies: { enabled: false as const },
    ...(input.cookiePrefix ? { cookiePrefix: input.cookiePrefix } : {}),
    ipAddress: {
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
      trustedProxies: [...(input.trustedProxies ?? LOOPBACK_PROXIES)],
    },
  } satisfies NonNullable<BetterAuthOptions["advanced"]>;
}
