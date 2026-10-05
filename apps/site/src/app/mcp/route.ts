// SPDX-License-Identifier: Apache-2.0
/**
 * Public MCP endpoint (Streamable HTTP) of dragonballfr.com, for remote connectors such as the
 * Claude and Gemini apps: forwards to the read-only Shenron MCP server (SHENRON_MCP_URL).
 * Session, protocol-version and streaming (SSE) semantics pass through untouched.
 */
import { mcpUpstream } from "@/lib/ai-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_HEADERS = [
  "accept",
  "content-type",
  "mcp-session-id",
  "mcp-protocol-version",
  "last-event-id",
];
const RESPONSE_HEADERS = ["content-type", "mcp-session-id", "cache-control"];
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers":
    "accept, content-type, mcp-session-id, mcp-protocol-version, last-event-id",
  "access-control-expose-headers": "mcp-session-id",
};

async function forward(request: Request): Promise<Response> {
  const upstream = mcpUpstream();
  if (!upstream) {
    return Response.json(
      { error: "Le serveur MCP public de Shenron n'est pas déployé sur cette instance." },
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
    return Response.json({ error: "Serveur MCP injoignable." }, { status: 502, headers: CORS });
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
