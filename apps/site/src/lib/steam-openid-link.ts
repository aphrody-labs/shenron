import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { siteAllowedHosts } from "@shenron/auth/origins";

const OPENID_NS = "http://specs.openid.net/auth/2.0";
const STEAM_ENDPOINT = "https://steamcommunity.com/openid/login";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";
const STATE_TTL_MS = 10 * 60_000;
const COOKIE_BASE = "dbfr_steam_link";

export interface SteamLinkState {
  state: string;
  userId: string;
  origin: string;
  expiresAt: number;
}

function cookieName(secure: boolean): string {
  return secure ? `__Host-${COOKIE_BASE}` : COOKIE_BASE;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(value).digest("base64url");
}

export function siteOriginForRequest(request: Request): string | null {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const production = env.NODE_ENV === "production";
  if (!siteAllowedHosts({ production }).includes(host)) return null;
  if (production) return `https://${host}`;
  if (requestUrl.protocol !== "http:" && requestUrl.protocol !== "https:") return null;
  return `${requestUrl.protocol}//${host}`;
}

export function steamLinkCookieName(origin: string): string {
  return cookieName(new URL(origin).protocol === "https:");
}

export function createSteamLinkFlow(userId: string, origin: string) {
  const state: SteamLinkState = {
    state: randomBytes(32).toString("base64url"),
    userId,
    origin,
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  const payload = encode(JSON.stringify(state));
  const cookie = `${payload}.${sign(payload)}`;
  const callback = new URL("/api/account/steam/callback", origin);
  callback.searchParams.set("state", state.state);

  const authorization = new URL(STEAM_ENDPOINT);
  authorization.searchParams.set("openid.ns", OPENID_NS);
  authorization.searchParams.set("openid.mode", "checkid_setup");
  authorization.searchParams.set("openid.return_to", callback.toString());
  authorization.searchParams.set("openid.realm", `${origin}/`);
  authorization.searchParams.set("openid.identity", IDENTIFIER_SELECT);
  authorization.searchParams.set("openid.claimed_id", IDENTIFIER_SELECT);

  const secure = new URL(origin).protocol === "https:";
  return {
    authorizationUrl: authorization.toString(),
    cookieName: cookieName(secure),
    cookieValue: cookie,
    cookieOptions: `Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_MS / 1000}${secure ? "; Secure" : ""}`,
  };
}

export function readSteamLinkState(cookie: string | undefined): SteamLinkState | null {
  if (!cookie) return null;
  const [payload, signature, ...extra] = cookie.split(".");
  if (!payload || !signature || extra.length) return null;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SteamLinkState;
    if (
      typeof state.state !== "string" ||
      typeof state.userId !== "string" ||
      typeof state.origin !== "string" ||
      typeof state.expiresAt !== "number" ||
      state.expiresAt <= Date.now() ||
      state.expiresAt > Date.now() + STATE_TTL_MS
    ) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function singleParam(params: URLSearchParams, name: string): string | null {
  const values = params.getAll(`openid.${name}`);
  return values.length === 1 ? values[0]! : null;
}

function isFreshResponseNonce(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)(.+)$/.exec(value);
  if (!match) return false;
  const timestamp = Date.parse(match[1]!);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= -60_000 && age <= STATE_TTL_MS;
}

/** Validate the OpenID 2.0 assertion with Steam server-to-server before trusting its SteamID. */
export async function verifySteamOpenIdCallback(
  params: URLSearchParams,
  expectedReturnTo: string,
): Promise<string | null> {
  const openidFields = [...params.keys()].filter((key) => key.startsWith("openid."));
  if (openidFields.some((key) => params.getAll(key).length !== 1)) return null;

  const namespace = singleParam(params, "ns");
  const mode = singleParam(params, "mode");
  const endpoint = singleParam(params, "op_endpoint");
  const claimedId = singleParam(params, "claimed_id");
  const identity = singleParam(params, "identity");
  const returnTo = singleParam(params, "return_to");
  const responseNonce = singleParam(params, "response_nonce");
  const signed = singleParam(params, "signed");
  const signature = singleParam(params, "sig");

  if (
    namespace !== OPENID_NS ||
    mode !== "id_res" ||
    endpoint !== STEAM_ENDPOINT ||
    !claimedId ||
    identity !== claimedId ||
    returnTo !== expectedReturnTo ||
    !responseNonce ||
    !isFreshResponseNonce(responseNonce) ||
    !signed ||
    !signature
  ) {
    return null;
  }

  const signedNames = signed.split(",");
  if (signedNames.some((field) => !/^[a-z][a-z0-9_]*$/.test(field))) return null;
  const signedFields = new Set(signedNames);
  if (signedFields.size !== signedNames.length) return null;
  for (const field of ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce"]) {
    if (!signedFields.has(field)) return null;
  }

  const steamId = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimedId)?.[1];
  if (!steamId) return null;

  const verification = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith("openid.")) verification.append(key, value);
  }
  verification.set("openid.mode", "check_authentication");

  try {
    const response = await fetch(STEAM_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: verification,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 4096 || !/(?:^|\r?\n)is_valid:true(?:\r?\n|$)/.test(body)) return null;
    return steamId;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return undefined;
}

export function steamLinkCookieHeader(name: string, value: string, options: string): string {
  return `${name}=${value}; ${options}`;
}

export function clearSteamLinkCookieHeader(name: string, origin: string): string {
  const secure = new URL(origin).protocol === "https:";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
