/**
 * GET /plugin — le plugin « shenron » en une page HTML lisible par tout LLM (cf.
 * `@/lib/plugin`). `?format=md|txt|json` rend le même export dans un autre format.
 */
import { forwardToPluginApi } from "@/lib/plugin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["html", "md", "txt", "json"]);

export function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const asked = params.get("format") ?? "html";
  const format = FORMATS.has(asked) ? asked : "html";
  const full = params.get("full") === "1" ? "?full=true" : "";
  return forwardToPluginApi(request, `/api/public/plugin/export/${format}${full}`);
}
