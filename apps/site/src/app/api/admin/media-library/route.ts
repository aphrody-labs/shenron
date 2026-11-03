// SPDX-License-Identifier: Apache-2.0
import { isCurrentUserAdmin } from "@/lib/session";
import { AdminMediaQueryError, readAdminMediaLibrary } from "@/lib/admin-media-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request): Promise<Response> {
  try {
    if (!(await isCurrentUserAdmin())) return json({ error: "forbidden" }, 403);
  } catch {
    return json({ error: "auth_unavailable" }, 503);
  }
  try {
    return json(await readAdminMediaLibrary(new URL(request.url).searchParams));
  } catch (error) {
    if (error instanceof AdminMediaQueryError) return json({ error: "invalid_query" }, 400);
    console.error("[media-library] catalogue unavailable", error);
    return json({ error: "media_library_unavailable" }, 503);
  }
}
