// SPDX-License-Identifier: Apache-2.0
/**
 * Serverless Cloudflare Workers / Edge adapter for Discord HTTP Interactions and REST API.
 * Uses only Web Crypto (`crypto.subtle`) and `fetch` — zero Node.js or VPS dependencies.
 */

export const DISCORD_INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

export const DISCORD_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

export interface DiscordInteractionPayload {
  id: string;
  application_id: string;
  type: number;
  data?: {
    id?: string;
    name?: string;
    custom_id?: string;
    options?: Array<{ name: string; type: number; value?: unknown }>;
    values?: string[];
  };
  guild_id?: string;
  channel_id?: string;
  member?: { user?: { id: string; username: string; global_name?: string | null } };
  user?: { id: string; username: string; global_name?: string | null };
  token: string;
}

export interface DiscordInteractionResponse {
  type: number;
  data?: Record<string, unknown>;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

/** Verify a Discord Ed25519 request signature using Web Crypto (`crypto.subtle`). */
export async function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string | null,
  timestamp: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signatureHex || !timestamp) return false;
  const keyBytes = hexToBytes(publicKeyHex.trim());
  const sigBytes = hexToBytes(signatureHex.trim());
  if (!keyBytes || !sigBytes || keyBytes.length !== 32 || sigBytes.length !== 64) return false;
  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes as unknown as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const payload = new TextEncoder().encode(`${timestamp}${rawBody}`);
    return await crypto.subtle.verify(
      "Ed25519",
      cryptoKey,
      sigBytes as unknown as ArrayBuffer,
      payload,
    );
  } catch {
    return false;
  }
}

export type DiscordCommandHandler = (
  interaction: DiscordInteractionPayload,
) => Promise<DiscordInteractionResponse> | DiscordInteractionResponse;

export interface InteractionRouterOptions {
  publicKey: string;
  commands?: Record<string, DiscordCommandHandler>;
  components?: Record<string, DiscordCommandHandler>;
  autocomplete?: Record<string, DiscordCommandHandler>;
  fallback?: DiscordCommandHandler;
}

/** Build a stateless Cloudflare Workers / Edge fetch handler for `POST /interactions`. */
export function createDiscordInteractionHandler(options: InteractionRouterOptions) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");
    const rawBody = await request.text();
    const valid = await verifyDiscordSignature(options.publicKey, signature, timestamp, rawBody);
    if (!valid) {
      return new Response("Invalid request signature", { status: 401 });
    }
    let interaction: DiscordInteractionPayload;
    try {
      interaction = JSON.parse(rawBody) as DiscordInteractionPayload;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (interaction.type === DISCORD_INTERACTION_TYPE.PING) {
      return Response.json({ type: DISCORD_RESPONSE_TYPE.PONG });
    }
    if (interaction.type === DISCORD_INTERACTION_TYPE.APPLICATION_COMMAND) {
      const name = interaction.data?.name ?? "";
      const handler = options.commands?.[name] ?? options.fallback;
      if (handler) return Response.json(await handler(interaction));
    }
    if (
      interaction.type === DISCORD_INTERACTION_TYPE.MESSAGE_COMPONENT ||
      interaction.type === DISCORD_INTERACTION_TYPE.MODAL_SUBMIT
    ) {
      const customId = interaction.data?.custom_id ?? "";
      const exact = options.components?.[customId];
      const prefix =
        exact ??
        Object.entries(options.components ?? {}).find(([key]) =>
          customId.startsWith(`${key}:`),
        )?.[1] ??
        options.fallback;
      if (prefix) return Response.json(await prefix(interaction));
    }
    if (interaction.type === DISCORD_INTERACTION_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE) {
      const name = interaction.data?.name ?? "";
      const handler = options.autocomplete?.[name];
      if (handler) return Response.json(await handler(interaction));
      return Response.json({
        type: DISCORD_RESPONSE_TYPE.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
        data: { choices: [] },
      });
    }
    return Response.json({
      type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: "Commande indisponible dans cette version serverless.",
        flags: 64,
      },
    });
  };
}

/** Lightweight fetch-based Discord REST client for serverless Workers/Vercel. */
export function createDiscordRest(botToken: string, apiBase = "https://discord.com/api/v10") {
  const base = apiBase.replace(/\/+$/, "");
  return {
    async request<T = unknown>(
      method: string,
      path: string,
      body?: unknown,
      signal?: AbortSignal,
    ): Promise<T> {
      const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
        method,
        headers: {
          Authorization: `Bot ${botToken}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: signal ?? AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Discord REST ${method} ${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
  };
}
