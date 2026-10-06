/**
 * GET|HEAD /api/private-downloads/<name> — one admin-only download, resumable with `Range`
 * (`@/lib/private-downloads`).
 */
import { servePrivateDownload } from "@/lib/private-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  return servePrivateDownload(request, (await params).name);
}

export const HEAD = GET;
