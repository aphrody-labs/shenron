// SPDX-License-Identifier: Apache-2.0
/**
 * Discord side of sign-in (docs/products/bot-discord-refonte.md §3.3):
 *
 *   client: sdk.commands.authorize()  -> code
 *   server: POST /oauth2/token        -> access token  (the client secret never leaves this process)
 *   client: sdk.commands.authenticate -> the SDK session
 *   socket: hello { token }           -> GET /users/@me verifies the token and gives the identity
 *
 * Nothing the client says about who it is is trusted: the roster identity (id, name, avatar) comes
 * from Discord's answer to the token. Network access goes through an injected `fetch`, so the tests
 * run without the network.
 */
import { z } from "zod";

export const DISCORD_API = "https://discord.com/api";

export interface DiscordIdentity {
  readonly userId: string;
  /** Guild nickname when `guilds.members.read` allowed reading it, else the display name. */
  readonly name: string;
  /** User avatar hash, or `null` for the default avatar. */
  readonly avatar: string | null;
}

export type ExchangeResult =
  | { readonly ok: true; readonly accessToken: string }
  | { readonly ok: false; readonly reason: "invalid_code" | "unavailable" | "not_configured" };

export interface DiscordPort {
  /** Trades the OAuth `code` of `authorize()` for an access token. */
  exchangeCode(code: string): Promise<ExchangeResult>;
  /** Verifies an access token and returns who it belongs to, or `null` when Discord refuses it. */
  identify(accessToken: string, guildId?: string | null): Promise<DiscordIdentity | null>;
}

export interface DiscordPortOptions {
  readonly clientId: string | null;
  readonly clientSecret: string | null;
  readonly fetch?: typeof fetch;
  readonly api?: string;
  readonly now?: () => number;
  /** How long a verified token is trusted without asking Discord again. */
  readonly identityTtlMs?: number;
  /** How long a refused token is remembered (stops a client from hammering Discord). */
  readonly refusalTtlMs?: number;
  readonly requestTimeoutMs?: number;
  readonly cacheLimit?: number;
}

/** OAuth codes are short opaque strings; anything else is refused before the network. */
export const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{8,512}$/;

const UserSchema = z.object({
  id: z.string().regex(/^\d{5,25}$/),
  username: z.string().min(1).max(100),
  global_name: z.string().min(1).max(100).nullish(),
  avatar: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,64}$/)
    .nullish(),
});

const MemberSchema = z.object({ nick: z.string().min(1).max(100).nullish() });

const TokenSchema = z.object({ access_token: z.string().regex(TOKEN_PATTERN) });

interface CacheEntry {
  readonly identity: DiscordIdentity | null;
  readonly expiresAt: number;
}

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createDiscordPort(options: DiscordPortOptions): DiscordPort {
  const request = options.fetch ?? fetch;
  const api = options.api ?? DISCORD_API;
  const now = options.now ?? Date.now;
  const identityTtl = options.identityTtlMs ?? 60_000;
  const refusalTtl = options.refusalTtlMs ?? 10_000;
  const timeout = options.requestTimeoutMs ?? 5_000;
  const limit = options.cacheLimit ?? 2_000;
  const cache = new Map<string, CacheEntry>();

  function remember(key: string, identity: DiscordIdentity | null): void {
    if (cache.size >= limit) {
      // Maps iterate in insertion order: dropping the first entries drops the oldest.
      for (const oldest of cache.keys()) {
        cache.delete(oldest);
        if (cache.size < limit * 0.9) break;
      }
    }
    cache.set(key, { identity, expiresAt: now() + (identity ? identityTtl : refusalTtl) });
  }

  async function guildNickname(accessToken: string, guildId: string): Promise<string | null> {
    try {
      const response = await request(`${api}/users/@me/guilds/${guildId}/member`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) return null;
      const member = MemberSchema.safeParse(await response.json());
      return member.success ? (member.data.nick ?? null) : null;
    } catch {
      return null;
    }
  }

  return {
    async exchangeCode(code) {
      if (!options.clientId || !options.clientSecret)
        return { ok: false, reason: "not_configured" };
      if (!CODE_PATTERN.test(code)) return { ok: false, reason: "invalid_code" };
      let response: Response;
      try {
        response = await request(`${api}/oauth2/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            grant_type: "authorization_code",
            code,
          }),
          signal: AbortSignal.timeout(timeout),
        });
      } catch {
        return { ok: false, reason: "unavailable" };
      }
      // 400/401 is Discord refusing the code (used, expired, wrong application); anything else is
      // on Discord's side or ours and worth a retry by the player.
      if (response.status === 400 || response.status === 401)
        return { ok: false, reason: "invalid_code" };
      if (!response.ok) return { ok: false, reason: "unavailable" };
      const body = TokenSchema.safeParse(await response.json().catch(() => null));
      return body.success
        ? { ok: true, accessToken: body.data.access_token }
        : { ok: false, reason: "unavailable" };
    },

    async identify(accessToken, guildId = null) {
      if (!TOKEN_PATTERN.test(accessToken)) return null;
      const key = await digest(`${accessToken}|${guildId ?? ""}`);
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now()) return hit.identity;

      let response: Response;
      try {
        response = await request(`${api}/users/@me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(timeout),
        });
      } catch {
        // Discord unreachable: not a verdict on the token, so nothing is cached.
        return null;
      }
      if (response.status === 401 || response.status === 403) {
        remember(key, null);
        return null;
      }
      if (!response.ok) return null;
      const user = UserSchema.safeParse(await response.json().catch(() => null));
      if (!user.success) return null;
      const nickname = guildId ? await guildNickname(accessToken, guildId) : null;
      const identity: DiscordIdentity = {
        userId: user.data.id,
        name: nickname ?? user.data.global_name ?? user.data.username,
        avatar: user.data.avatar ?? null,
      };
      remember(key, identity);
      return identity;
    },
  };
}
