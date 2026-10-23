// SPDX-License-Identifier: Apache-2.0
/**
 * Response headers of the Activity host.
 *
 * The page runs inside an iframe of the Discord client (`https://<application_id>.discordsays.com`,
 * served by the Discord proxy). Two consequences, both easy to get wrong:
 *  - there is NO `X-Frame-Options` header, ever: `DENY` or `SAMEORIGIN` would blank the Activity,
 *    and `ALLOW-FROM` is obsolete. Embedding is controlled by CSP `frame-ancestors` alone;
 *  - the CSP must allow what the Activity really uses and nothing else: its own scripts and styles,
 *    its own WebSocket, Discord avatars on the Discord CDN, and the Discord API host.
 * (docs/products/bot-discord-refonte.md §3.3, §7.2.)
 */

/** Origins that may frame the Activity: the Discord clients and the proxy host of Activities. */
export const FRAME_ANCESTORS = [
  "https://discord.com",
  "https://*.discord.com",
  "https://discordapp.com",
  "https://*.discordsays.com",
] as const;

export interface CspOptions {
  /** Public origin of the Activity host (adds its explicit `wss://` form for older engines). */
  readonly publicUrl?: string | null;
  /** Allows `ws://localhost` for development servers on a loopback bind. */
  readonly development?: boolean;
}

function webSocketOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
  } catch {
    return null;
  }
}

/** The `Content-Security-Policy` of every response of the Activity host. */
export function contentSecurityPolicy(options: CspOptions = {}): string {
  const connect = ["'self'", "https://discord.com", "wss://*.discordsays.com"];
  if (options.publicUrl) {
    const socket = webSocketOrigin(options.publicUrl);
    if (socket) connect.push(socket);
  }
  if (options.development) connect.push("ws://localhost:*", "ws://127.0.0.1:*");
  const directives: Array<[string, readonly string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'"]],
    // React sets some `style` attributes (bar widths); stylesheets themselves stay same-origin.
    ["style-src", ["'self'"]],
    ["style-src-attr", ["'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "https://cdn.discordapp.com", "https://media.discordapp.net"]],
    ["font-src", ["'self'"]],
    ["connect-src", connect],
    ["worker-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'none'"]],
    ["frame-ancestors", FRAME_ANCESTORS],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

/** Headers added to every response (the HTML response also gets `Cache-Control: no-store`). */
export function securityHeaders(options: CspOptions = {}): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Permissions-Policy": "camera=(), geolocation=(), payment=(), usb=()",
  };
}
