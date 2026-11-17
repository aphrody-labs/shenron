// SPDX-License-Identifier: Apache-2.0
/** Account playback progress ("continue watching"); storage and identity live in the Bun host. */
import { endpoints } from "@aphrody/shenron-api/contract";
import { callHost, PRIVATE_JSON_HEADERS } from "@/lib/host-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function relay(request: Request, method: "GET" | "POST") {
  const path = method === "GET" ? endpoints.watchProgress.path : endpoints.watchProgressSave.path;
  const result = await callHost<unknown>(request, path, {
    method,
    body: method === "POST" ? await request.text() : undefined,
  });
  return Response.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: PRIVATE_JSON_HEADERS,
  });
}

export const GET = (request: Request) => relay(request, "GET");
export const PUT = (request: Request) => relay(request, "POST");
