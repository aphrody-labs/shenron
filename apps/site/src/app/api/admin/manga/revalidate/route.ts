// SPDX-License-Identifier: Apache-2.0
import { revalidatePath } from "next/cache";
import { isAdminOrToken } from "@/lib/admin-guard";
import { refreshMangaPublication } from "@/lib/manga-data";
import {
  MANGA_REVALIDATION_CAPABILITIES,
  MangaRevalidationError,
  readMangaRevalidation,
  revalidateMangaPublication,
} from "@/lib/manga-publication-revalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!(await isAdminOrToken(request)))
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  const site = request.headers.get("sec-fetch-site"),
    origin = request.headers.get("origin");
  if (
    (site && site !== "same-origin" && site !== "none") ||
    (origin && origin !== new URL(request.url).origin)
  )
    return Response.json({ error: "cross_site_denied" }, { status: 403, headers });
  try {
    const input = await readMangaRevalidation(request);
    if (input.action === "capabilities")
      return Response.json(MANGA_REVALIDATION_CAPABILITIES, { headers });
    const receipt = await revalidateMangaPublication(input, {
      refresh: refreshMangaPublication,
      revalidatePath,
    });
    return Response.json(receipt, { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MangaRevalidationError
            ? error.message
            : "manga_revalidation_unavailable",
      },
      { status: error instanceof MangaRevalidationError ? error.status : 503, headers },
    );
  }
}
