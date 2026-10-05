/**
 * GET /plugin/<chemin> — un fichier du plugin « shenron », brut par défaut ;
 * `?format=md|txt|html|json` le met en forme (cf. `@/lib/plugin`).
 */
import { forwardToPluginApi } from "@/lib/plugin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["raw", "md", "txt", "html", "json"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const asked = new URL(request.url).searchParams.get("format") ?? "raw";
  const format = FORMATS.has(asked) ? asked : "raw";
  const query = new URLSearchParams({ path: path.join("/") });
  if (format !== "raw") query.set("format", format);
  return forwardToPluginApi(request, `/api/public/plugin/file?${query}`);
}
