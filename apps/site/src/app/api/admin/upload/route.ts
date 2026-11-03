// SPDX-License-Identifier: Apache-2.0
import { verifyAdminImage } from "@/lib/admin-image-verify";
import { API_URL } from "@/lib/config";
import { isCurrentUserAdmin } from "@/lib/session";
import { MAX_ADMIN_IMAGE_BYTES, sniffAdminImage } from "@/lib/admin-image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Verify actual pixels and relay unchanged bytes to the existing persistent storage owner. */
export async function POST(req: Request) {
  try {
    if (!(await isCurrentUserAdmin())) return json({ error: "forbidden" }, 403);
  } catch {
    return json({ error: "auth_unavailable" }, 503);
  }
  const announcedBytes = Number(req.headers.get("content-length"));
  if (Number.isFinite(announcedBytes) && announcedBytes > MAX_ADMIN_IMAGE_BYTES + 65_536)
    return json({ error: "image_too_large" }, 413);
  const token = process.env.SHENRON_ADMIN_TOKEN ?? "";
  if (!token) return json({ error: "upload_unavailable" }, 503);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "multipart_required" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file_required" }, 400);
  if (!file.size) return json({ error: "empty_image" }, 400);
  if (file.size > MAX_ADMIN_IMAGE_BYTES) return json({ error: "image_too_large" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffAdminImage(bytes);
  if (!kind) return json({ error: "invalid_image" }, 415);
  let dimensions: { width: number; height: number };
  try {
    dimensions = await verifyAdminImage(bytes);
  } catch {
    return json({ error: "invalid_image" }, 415);
  }
  const requested = String(form.get("subdir") ?? "")
    .trim()
    .toLowerCase();
  const subdir = /^[a-z0-9-]{1,32}$/.test(requested) ? requested : "uploads";
  const clean = new File([bytes], "upload." + kind.ext, { type: kind.type });
  const upstream = new FormData();
  upstream.append("file", clean, clean.name);
  upstream.append("subdir", subdir);
  try {
    const response = await fetch(API_URL + "/api/assets/upload", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
      body: upstream,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await response.json().catch(() => ({}))) as { path?: unknown };
    if (!response.ok)
      return json(
        { error: "upload_failed" },
        response.status >= 400 && response.status < 600 ? response.status : 502,
      );
    const expectedPath = new RegExp(
      "^\\./assets/wiki/" +
        subdir +
        "/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\\." +
        kind.ext +
        "$",
    );
    if (typeof data.path !== "string" || !expectedPath.test(data.path))
      return json({ error: "invalid_storage_response" }, 502);
    return json({ path: data.path, ...dimensions, bytes: file.size, mime: kind.type }, 201);
  } catch {
    return json({ error: "upload_unavailable" }, 502);
  }
}
