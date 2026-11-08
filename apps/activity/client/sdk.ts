// SPDX-License-Identifier: Apache-2.0
/**
 * The seam between the Activity and Discord. Everything the client needs from the Embedded App SDK
 * goes through `ActivitySdk`; `discord-sdk.ts` implements it for the real client and `fake-sdk.ts`
 * for `?mock=1` (development builds only, absent from the production bundle).
 */

/** Set at build time: `true` only in development builds (see scripts/build.ts). */
declare const __ACTIVITY_MOCK__: boolean;

export interface ActivitySdk {
  readonly kind: "discord" | "mock";
  /** Discord `instance_id`: the key of the shared room. */
  readonly instanceId: string;
  readonly guildId: string | null;
  readonly channelId: string | null;
  /** Prefix of the requests to the Activity host: `/.proxy` inside Discord, nothing elsewhere. */
  readonly apiBase: string;
  /** Mock only: which character the window plays, how many simulated opponents join, how fast they answer. */
  readonly mock?: { readonly slot: number; readonly bots: number; readonly fast: boolean };
  ready(): Promise<void>;
  /** The OAuth `code` of `authorize()`; the server trades it for a token. */
  authorize(): Promise<string>;
  authenticate(accessToken: string): Promise<void>;
  /** Discord locale of the member (`fr`, `en-US`, `ja`...), or `null`. */
  locale(): Promise<string | null>;
  invite(): Promise<void>;
}

/** The page was not opened by Discord (no SDK handshake is possible). */
export class OutsideDiscordError extends Error {
  constructor() {
    super("not running inside Discord");
    this.name = "OutsideDiscordError";
  }
}

/** The host has no Discord application configured. */
export class NotConfiguredError extends Error {
  constructor() {
    super("the Activity host has no Discord client id");
    this.name = "NotConfiguredError";
  }
}

/** `/.proxy` when served by the Discord proxy (`<application_id>.discordsays.com`), else nothing. */
export function apiBaseFor(hostname: string): string {
  return hostname.endsWith(".discordsays.com") ? "/.proxy" : "";
}

export function socketUrl(location: Pick<Location, "protocol" | "host">, apiBase: string): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${apiBase}/ws`;
}

export async function createSdk(
  location: Pick<Location, "search" | "hostname" | "protocol" | "host"> = window.location,
): Promise<ActivitySdk> {
  const params = new URLSearchParams(location.search);
  const apiBase = apiBaseFor(location.hostname);
  if (__ACTIVITY_MOCK__ && params.get("mock") === "1") {
    const { createFakeSdk } = await import("./fake-sdk");
    return createFakeSdk(params, apiBase);
  }
  // Discord adds `frame_id` to the URL it opens; without it the SDK cannot reach its client.
  if (!params.has("frame_id")) throw new OutsideDiscordError();
  const response = await fetch(`${apiBase}/api/config`).catch(() => null);
  const config = response?.ok ? ((await response.json()) as { clientId?: string | null }) : null;
  if (!config?.clientId) throw new NotConfiguredError();
  const { createDiscordSdk } = await import("./discord-sdk");
  return createDiscordSdk(config.clientId, apiBase);
}
