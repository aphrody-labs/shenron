// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from "next/server";
import { readCatalogDetail, readCatalogPage, readCatalogSummary } from "@/lib/catalog-explorer";
import { readCdnPage } from "@/lib/cdn-catalog";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const category = query.get("category");
  try {
    const data =
      category === "assets"
        ? await readCdnPage({
            path: query.get("path") ?? "/",
            page: query.get("page") ?? 1,
            all: query.get("all") === "1",
          })
        : !category
          ? await readCatalogSummary()
          : query.has("id")
            ? await readCatalogDetail(category, query.get("id")!)
            : await readCatalogPage(category, {
                page: query.get("page") ?? 1,
                q: query.get("q") ?? "",
                parent: query.get("parent") ?? undefined,
                mediaLang: query.get("mediaLang") ?? undefined,
                series: query.get("series") ?? undefined,
                order: query.get("order") ?? undefined,
                focus: query.get("focus") ?? undefined,
                kind: query.get("kind") ?? undefined,
                domain: query.get("domain") ?? undefined,
              });
    return NextResponse.json(data ?? { error: "not_found" }, {
      status: data ? 200 : 404,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "catalog_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
