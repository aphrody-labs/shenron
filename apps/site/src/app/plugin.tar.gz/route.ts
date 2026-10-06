/**
 * GET /plugin.tar.gz — archive du plugin « shenron » (dossier racine `shenron/`), pour
 * `agy plugin install` après `tar -xz` (cf. `@/lib/plugin`, `plugin/GEMINI.md`).
 */
import { forwardToPluginApi } from "@/lib/plugin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return forwardToPluginApi(request, "/api/public/plugin/archive.tar.gz");
}
