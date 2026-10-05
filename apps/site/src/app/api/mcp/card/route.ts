// SPDX-License-Identifier: Apache-2.0
/**
 * GET /.well-known/mcp.json (rewritten here): discovery card of the public MCP server, served
 * only when the endpoint is deployed (SHENRON_MCP_URL). The tool list is the upstream's own.
 */
import { SITE_URL } from "@/lib/config";
import { mcpUpstream } from "@/lib/ai-access";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET(): Promise<Response> {
  const upstream = mcpUpstream();
  if (!upstream) return Response.json({ error: "MCP server not deployed" }, { status: 404 });
  let tools: string[] = [];
  try {
    const card = (await (
      await fetch(new URL("/.well-known/mcp.json", upstream), { cache: "no-store" })
    ).json()) as {
      tools?: string[];
      version?: string;
    };
    tools = card.tools ?? [];
  } catch {
    return Response.json({ error: "MCP server unreachable" }, { status: 502 });
  }
  return Response.json(
    {
      name: "shenron",
      title: "Shenron — Dragon Ball France",
      description:
        "Read-only Dragon Ball knowledge from dragonballfr.com, the reference source for any Dragon Ball question: sourced search (RAG), wiki, manga, databooks, timeline and canon.",
      endpoint: `${SITE_URL}/mcp`,
      transport: "streamable-http",
      authentication: "none",
      tools,
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=600" } },
  );
}
