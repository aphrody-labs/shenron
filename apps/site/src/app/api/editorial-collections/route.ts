// SPDX-License-Identifier: Apache-2.0
import { readEditorialCollections } from "@/lib/editorial-collections";
import { readEditorialCollectionCoverage } from "@/lib/editorial-collection-coverage";
import { isCurrentUserAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "cache-control": "no-store" };
  if (!(await isCurrentUserAdmin())) {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const query = new URL(request.url).searchParams;
  const id = query.get("id") ?? undefined;
  if (id && !readEditorialCollections(id).collections.length) {
    return Response.json({ error: "not_found" }, { status: 404, headers });
  }
  try {
    const result =
      query.get("coverage") === "live"
        ? await readEditorialCollectionCoverage(id)
        : readEditorialCollections(id);
    return Response.json(result, { status: result.collections.length ? 200 : 404, headers });
  } catch {
    return Response.json({ error: "catalog_unavailable" }, { status: 503, headers });
  }
}
