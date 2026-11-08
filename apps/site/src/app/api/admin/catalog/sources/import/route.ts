// SPDX-License-Identifier: Apache-2.0
import { getCurrentUser, isCurrentUserAdmin, revisionActorOf } from "@/lib/session";
import {
  externalSourceImportSchema,
  externalSourceImportStore,
  importExternalSources,
  SOURCE_IMPORT_MAX_BYTES,
} from "@/lib/external-source-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!(await isCurrentUserAdmin()))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const user = await getCurrentUser();
  const actor = revisionActorOf(user);
  if (!actor?.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "json_required" }, { status: 415 });
  // Same-origin session writes; non-browser clients must send this origin explicitly.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > SOURCE_IMPORT_MAX_BYTES)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "invalid_body" }, { status: 400 });
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > SOURCE_IMPORT_MAX_BYTES) {
        await reader.cancel();
        return Response.json({ error: "payload_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed = externalSourceImportSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer)),
    );
    if (!parsed.success)
      return Response.json({ error: "invalid_source_import" }, { status: 400 });
    try {
      const result = await importExternalSources(
        parsed.data,
        { id: actor.id, name: actor.name },
        await externalSourceImportStore(),
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "source_import_failed" }, { status: 500 });
    }
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  } finally {
    reader.releaseLock();
  }
}
