/**
 * GET /agy.md — le prompt unique qui fait installer et configurer Shenron par agy
 * (Aphrody, plugin, MCP, agent home) : `agy -i "$(curl -fsSL https://dragonballfr.com/agy.md)"`.
 * Source : `plugin/install/agy.md`, rendue par l'API du plugin (cf. `@/lib/plugin`).
 */
import { forwardToPluginApi } from "@/lib/plugin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return forwardToPluginApi(request, "/api/public/plugin/agy.md");
}
