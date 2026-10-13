// SPDX-License-Identifier: Apache-2.0
import { readGifByKey } from "@/lib/gif-catalog";
import { gifQuery } from "@/lib/gif-catalog-contract";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-z0-9-]{1,96}$/.test(id)) return Response.json({ error: "invalid_id" }, { status: 400 });
  const revision = new URL(request.url).searchParams.get("revision");
  try {
    gifQuery({ revision });
  } catch {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  try {
    const item = await readGifByKey(id, revision);
    if (!item) return Response.json({ error: "not_found" }, { status: 404 });
    const source = await fetch(item.gifUrl, {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (
      !source.ok ||
      !source.body ||
      !/^image\/gif(?:;|$)/i.test(source.headers.get("content-type") ?? "")
    )
      throw new Error("GIF unavailable");
    const declared = source.headers.get("content-length");
    if (declared !== null && Number(declared) !== item.bytes) {
      await source.body.cancel();
      throw new Error("GIF size differs");
    }
    const reader = source.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > item.bytes || chunks.length >= 4096) throw new Error("GIF size differs");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (length !== item.bytes) throw new Error("GIF size differs");
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
    const sha = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (sha !== item.sha256) throw new Error("GIF integrity differs");
    return new Response(bytes, {
      headers: {
        "content-type": "image/gif",
        "content-disposition": `attachment; filename="${id}.gif"`,
        "content-length": String(length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const changed = error instanceof Error && error.message === "GIF revision changed";
    return Response.json(
      { error: changed ? "revision_changed" : "artifact_unavailable" },
      { status: changed ? 409 : 503 },
    );
  }
}
