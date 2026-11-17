// SPDX-License-Identifier: Apache-2.0
import { endpoints } from "@aphrody/shenron-api/contract";
import { callHost, PRIVATE_JSON_HEADERS } from "@/lib/host-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await callHost<unknown>(request, endpoints.watchProgressRemove.path, {
    method: "POST",
    body: await request.text(),
  });
  return Response.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: PRIVATE_JSON_HEADERS,
  });
}
