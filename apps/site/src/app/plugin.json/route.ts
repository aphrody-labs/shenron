/** GET /plugin.json — export complet du plugin « shenron » (cf. `@/lib/plugin`). */
import { forwardToPluginApi } from "@/lib/plugin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  const full = new URL(request.url).searchParams.get("full") === "1" ? "?full=true" : "";
  return forwardToPluginApi(request, `/api/public/plugin/export/json${full}`);
}
