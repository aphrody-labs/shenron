// SPDX-License-Identifier: Apache-2.0
import { readGifCatalog } from "@/lib/gif-catalog";
import { gifQuery } from "@/lib/gif-catalog-contract";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = {
    page: params.get("page") ?? "1",
    q: params.get("q") ?? "",
    revision: params.get("revision"),
  };
  try {
    gifQuery(input);
  } catch {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  try {
    const page = await readGifCatalog(input);
    return Response.json(page, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message === "GIF revision changed"
            ? "revision_changed"
            : "catalog_unavailable",
      },
      {
        status: error instanceof Error && error.message === "GIF revision changed" ? 409 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
