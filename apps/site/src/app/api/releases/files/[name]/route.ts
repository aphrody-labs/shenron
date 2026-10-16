// SPDX-License-Identifier: Apache-2.0
/** GET|HEAD /api/releases/files/<name>: one public release file, resumable with `Range`. */
import { serveRelease } from "@/lib/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ name: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  return serveRelease(request, (await params).name);
}

export const HEAD = GET;
