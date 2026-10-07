// SPDX-License-Identifier: Apache-2.0
import { hostAuthUrl, proxyAuthToHost } from "@/lib/host-auth";
export const dynamic = "force-dynamic";
/** Verification is owned by the same Bun host that issues desktop identity codes. */
export async function POST(request: Request): Promise<Response> {
  const host = hostAuthUrl();
  if (!host)
    return Response.json(
      { error: "auth_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    return await proxyAuthToHost(request, host);
  } catch {
    return Response.json(
      { error: "auth_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
