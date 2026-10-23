// SPDX-License-Identifier: Apache-2.0
/**
 * Development identities for `?mock=1` (the fake SDK of the client). Enabled only by
 * `SHENRON_ACTIVITY_DEV_AUTH=1`, which `loadConfig` refuses in production and on a non-loopback
 * bind, so a deployed server never trusts these tokens. The "codes" are `mock-code-1` .. `mock-code-8`,
 * the "tokens" `dev-token-1` .. `dev-token-8`; each maps to a fixed Dragon Ball character with a stable snowflake.
 */
import type { DiscordIdentity, DiscordPort } from "./discord";

export const DEV_PLAYERS: readonly string[] = [
  "Son Goku",
  "Vegeta",
  "Bulma",
  "Piccolo",
  "Kuririn",
  "Son Gohan",
  "Trunks",
  "Yamcha",
];

const BASE = 900_000_000_000_000_000n;

export function devIdentity(slot: number): DiscordIdentity | null {
  const name = DEV_PLAYERS[slot - 1];
  if (!name) return null;
  return { userId: String(BASE + BigInt(slot)), name, avatar: null };
}

export function createDevPort(): DiscordPort {
  return {
    async exchangeCode(code) {
      const match = /^mock-code-([1-8])$/.exec(code);
      return match
        ? { ok: true, accessToken: `dev-token-${match[1]}` }
        : { ok: false, reason: "invalid_code" };
    },
    async identify(accessToken) {
      const match = /^dev-token-([1-8])$/.exec(accessToken);
      return match ? devIdentity(Number(match[1])) : null;
    },
  };
}
