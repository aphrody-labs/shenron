// SPDX-License-Identifier: Apache-2.0
/**
 * Signed codes of the desktop sign-in (`@shenron/db/agent-homes/types` DESKTOP_LINK): the host
 * vouches for a Discord identity to the local server of Shenron Studio, bound to the state the
 * local server chose, for two minutes. `base64url(payload).hmac`, HMAC-SHA-256 under the
 * Better Auth secret with a dedicated prefix. Stateless: nothing is stored on the host.
 */
import { hmacSha256Hex, timingSafeEqualString } from "@shenron/auth/crypto";
import {
  DESKTOP_LINK,
  type DesktopLinkIdentity,
  homeLanguage,
} from "@shenron/db/agent-homes/types";

interface Payload {
  d: string;
  n: string | null;
  a: string | null;
  l: string;
  s: string;
  e: number;
}

const sign = (secret: string, body: string) => hmacSha256Hex(secret, `desktop-link:${body}`);

export function signDesktopLink(
  secret: string,
  identity: DesktopLinkIdentity,
  state: string,
  now = Date.now(),
): string {
  const payload: Payload = {
    d: identity.discordId,
    n: identity.name,
    a: identity.avatarUrl,
    l: identity.language,
    s: state,
    e: now + DESKTOP_LINK.ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

/** The identity of a valid, unexpired code bound to `state`; `null` otherwise. */
export function verifyDesktopLink(
  secret: string,
  code: string,
  state: string,
  now = Date.now(),
): DesktopLinkIdentity | null {
  const [body, mac, ...rest] = code.split(".");
  if (!body || !mac || rest.length || !timingSafeEqualString(mac, sign(secret, body))) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return null;
  }
  if (payload.s !== state || !(payload.e > now) || !/^\d{15,22}$/.test(payload.d)) return null;
  return {
    discordId: payload.d,
    name: payload.n ?? null,
    avatarUrl: payload.a ?? null,
    language: homeLanguage(payload.l),
  };
}
