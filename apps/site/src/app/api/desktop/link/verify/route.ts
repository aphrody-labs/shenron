// SPDX-License-Identifier: Apache-2.0
/**
 * POST /api/desktop/link/verify `{ code, state }` — the Discord identity a desktop sign-in code
 * vouches for (`DesktopLinkIdentity`), or 400. Called by the local server of Shenron Studio.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyDesktopLink } from "@/lib/desktop-link";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    code?: unknown;
    state?: unknown;
  } | null;
  const code = typeof body?.code === "string" ? body.code.slice(0, 4096) : "";
  const state = typeof body?.state === "string" ? body.state.slice(0, 128) : "";
  const identity = code && state ? verifyDesktopLink(env.BETTER_AUTH_SECRET, code, state) : null;
  if (!identity)
    return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: noStore });
  return NextResponse.json(identity, { headers: noStore });
}
