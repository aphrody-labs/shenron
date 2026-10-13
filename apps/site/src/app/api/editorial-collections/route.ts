// SPDX-License-Identifier: Apache-2.0
import { readEditorialCollections } from "@/lib/editorial-collections";
import { isCurrentUserAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const id = new URL(request.url).searchParams.get("id") ?? undefined;
  const result = readEditorialCollections(id);
  return Response.json(result, { status: result.collections.length ? 200 : 404, headers });
}
