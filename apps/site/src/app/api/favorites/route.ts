/** Favorites storage and reader identity belong exclusively to the Bun host. */
import { NextResponse, type NextRequest } from "next/server";
import { resolveHostUrl } from "@aphrody/shenron-config/public-urls";
import { endpoints } from "@aphrody/shenron-api/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request: NextRequest, method: "GET" | "POST") {
  const host = resolveHostUrl(process.env);
  const responseHeaders = {
    "cache-control": "private, no-store",
    "content-type": "application/json",
  };
  if (!host)
    return NextResponse.json(
      { error: "Favorites host unavailable" },
      { status: 503, headers: responseHeaders },
    );
  const headers = new Headers();
  for (const name of ["cookie", "authorization", "user-agent", "origin", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const init: RequestInit & { duplex: "half" } = {
      method,
      headers,
      body: method === "POST" ? request.body : undefined,
      duplex: "half",
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    };
    const upstream = await fetch(new URL(endpoints.favorites.path, host), init);
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return NextResponse.json(
        { error: "Invalid favorites service response" },
        { status: 502, headers: responseHeaders },
      );
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json(
      { error: "Favorites service unavailable" },
      { status: 502, headers: responseHeaders },
    );
  }
}

export const GET = (request: NextRequest) => forward(request, "GET");
export const PUT = (request: NextRequest) => forward(request, "POST");
