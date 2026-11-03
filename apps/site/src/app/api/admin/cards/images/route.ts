// SPDX-License-Identifier: Apache-2.0
import { revalidatePath } from "next/cache";
import { getCurrentUser, isCurrentUserAdmin, revisionActorOf } from "@/lib/session";
import {
  CARD_IMAGE_BATCH_MAX_BYTES,
  cardImageAdminRequest,
  isCardImageRestoreRequest,
} from "@/lib/card-image-contract";
import { CardImageImportError, importCardImages } from "@/lib/card-image-import";
import { restoreCardImages } from "@/lib/card-image-restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request): Promise<Response> {
  try {
    if (!(await isCurrentUserAdmin())) return json({ error: "forbidden" }, 403);
  } catch {
    return json({ error: "auth_unavailable" }, 503);
  }
  if (Number(request.headers.get("content-length")) > CARD_IMAGE_BATCH_MAX_BYTES)
    return json({ error: "batch_too_large" }, 413);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "invalid_request" }, 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > CARD_IMAGE_BATCH_MAX_BYTES) return json({ error: "batch_too_large" }, 413);
      chunks.push(value);
    }
  } catch {
    return json({ error: "invalid_request" }, 400);
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = cardImageAdminRequest.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  try {
    const actor = revisionActorOf(await getCurrentUser());
    const result = isCardImageRestoreRequest(parsed.data)
      ? await restoreCardImages(parsed.data, actor, request.signal)
      : await importCardImages(parsed.data, actor, request.signal);
    let cacheInvalidated = true;
    if (parsed.data.intent === "commit" || parsed.data.intent === "restore-commit") {
      try {
        revalidatePath("/admin/cards");
        revalidatePath("/wiki/cards");
        revalidatePath("/wiki/cards/[slug]", "page");
      } catch {
        cacheInvalidated = false;
        console.error("[card-image-import] committed but cache revalidation failed");
      }
    }
    return json({ ...result, cacheInvalidated });
  } catch (error) {
    if (error instanceof CardImageImportError) return json({ error: error.code }, error.status);
    console.error("[card-image-import] unavailable", error);
    return json({ error: "card_image_import_unavailable" }, 503);
  }
}
