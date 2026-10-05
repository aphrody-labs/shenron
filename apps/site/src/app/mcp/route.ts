// SPDX-License-Identifier: Apache-2.0
/**
 * MCP endpoint (Streamable HTTP) of dragonballfr.com, for remote connectors such as the Claude
 * and Gemini apps: forwards to the Shenron MCP server (SHENRON_MCP_URL, `shenron-mcp --http
 * <addr> --public`). Session, protocol-version and streaming (SSE) semantics pass through
 * untouched.
 *
 * Access tiers are decided upstream, not here: the relay forwards `Authorization` and the client
 * address (`X-Forwarded-For`, `X-Real-IP`) so the upstream can unlock the write tools for a valid
 * bearer token or an allow-listed IP. The upstream only trusts those forwarding headers from a
 * peer listed in SHENRON_MCP_TRUSTED_PROXIES (loopback by default). The reverse proxy in front of
 * the site must overwrite, not pass through, a client-supplied `X-Forwarded-For`/`X-Real-IP`.
 */
import { mcpUpstream } from "@/lib/ai-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "mcp-session-id",
  "mcp-protocol-version",
  "last-event-id",
  "x-forwarded-for",
  "x-real-ip",
];
const RESPONSE_HEADERS = ["content-type", "mcp-session-id", "cache-control", "www-authenticate"];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "accept, authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id, www-authenticate",
};

async function forward(request: Request): Promise<Response> {
  const upstream = mcpUpstream();
  if (!upstream) {
    return Response.json(
      { error: "The Shenron MCP server is not deployed on this instance." },
      { status: 503, headers: CORS },
    );
  }
  const target = new URL("/mcp", upstream);
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The upstream checks Host against its allow-list: present the public host it serves.
  headers.set("x-forwarded-host", new URL(request.url).host);
  let response: Response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "MCP server unreachable." }, { status: 502, headers: CORS });
  }
  const out = new Headers(CORS);
  for (const name of RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("x-accel-buffering", "no");
  return new Response(response.body, { status: response.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
