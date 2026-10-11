// SPDX-License-Identifier: Apache-2.0
/**
 * AI access to the public site: crawlers, public read APIs and the public MCP server.
 *
 * The MCP endpoint `/mcp` forwards to the read-only Shenron MCP server (`shenron-mcp --http
 * <addr> --public`) named by `SHENRON_MCP_URL` (server-only). Without it the endpoint answers
 * 503 and nothing announces it (llms.txt, /.well-known/mcp.json).
 */

/** AI crawlers and agents explicitly welcome on the public pages. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "GoogleOther",
  "Gemini-Deep-Research",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
  "MistralAI-User",
  "DuckAssistBot",
  "cohere-ai",
] as const;

/** Public read APIs listed in llms.txt, open to AI crawlers. */
export const PUBLIC_API_PREFIXES = [
  "/api/canon",
  "/api/search",
  "/api/databooks",
  "/api/manga",
  "/api/timeline",
  "/api/episodes",
  "/api/movies",
  // Former French path, still served (rewrite to /api/timeline, lib/legacy-routes.ts).
  "/api/chronologie",
] as const;

/** Upstream of the public MCP endpoint, or null when it is not deployed. */
export function mcpUpstream(env: NodeJS.ProcessEnv = process.env): URL | null {
  const raw = env.SHENRON_MCP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}
