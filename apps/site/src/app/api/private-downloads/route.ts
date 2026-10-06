/**
 * GET /api/private-downloads — index of the admin-only downloads (`@/lib/private-downloads`).
 */
import { listPrivateDownloads } from "@/lib/private-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return listPrivateDownloads(request);
}
