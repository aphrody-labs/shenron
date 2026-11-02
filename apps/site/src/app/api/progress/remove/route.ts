// SPDX-License-Identifier: Apache-2.0
import { NextResponse, type NextRequest } from "next/server";
import { endpoints } from "@aphrody/shenron-api/contract";
import { callHost, PRIVATE_JSON_HEADERS } from "@/lib/host-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const result = await callHost<unknown>(request, endpoints.watchProgressRemove.path, {
    method: "POST",
    body: await request.text(),
  });
  return NextResponse.json(result.ok ? result.data : { error: result.error }, {
    status: result.status,
    headers: PRIVATE_JSON_HEADERS,
  });
}
